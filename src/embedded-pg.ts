/**
 * Embedded PostgreSQL lifecycle manager.
 * Bundles a portable PostgreSQL distribution and manages
 * init, start, stop, and cleanup of a temporary instance.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';
import * as os from 'os';
import { PostgresConfig, Logger } from './types';

export interface EmbeddedPgOptions {
  /** Path to PostgreSQL bin directory */
  binDir: string;
  /** Directory for PostgreSQL data files (default: auto in os.tmpdir()) */
  dataDir?: string;
  /** Port to listen on (0 = auto-select free port) */
  port?: number;
  /** PostgreSQL superuser name */
  user?: string;
  /** PostgreSQL superuser password */
  password?: string;
  /** Logger instance */
  logger: Logger;
}

/**
 * Resolve the path to bundled PostgreSQL binaries.
 * In packaged Electron app: process.resourcesPath/postgres/bin
 * In development: gui/postgres/bin (relative to project root)
 */
export function resolvePostgresBinDir(): string {
  // Check if running in a packaged Electron app
  const resourcesPath = (process as unknown as { resourcesPath?: string }).resourcesPath;
  if (resourcesPath && resourcesPath !== process.cwd()) {
    const packaged = path.join(resourcesPath, 'postgres', 'bin');
    if (fs.existsSync(packaged)) return packaged;
  }

  // Development: look for gui/postgres/bin relative to project root
  const devPaths = [
    path.resolve(__dirname, '..', 'gui', 'postgres', 'bin'),
    path.resolve(__dirname, '..', '..', 'gui', 'postgres', 'bin'),
    path.resolve(__dirname, '..', '..', '..', 'gui', 'postgres', 'bin'),
  ];

  for (const p of devPaths) {
    if (fs.existsSync(p)) return p;
  }

  throw new Error(
    'Embedded PostgreSQL binaries not found. Run "npm run prepare-postgres" in gui/ first.'
  );
}

/**
 * Find a free TCP port in the given range.
 */
async function findFreePort(start = 15432, end = 25432): Promise<number> {
  for (let port = start; port <= end; port++) {
    const free = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close(() => resolve(true));
      });
      server.listen(port, '127.0.0.1');
    });
    if (free) return port;
  }
  throw new Error(`No free port found in range ${start}-${end}`);
}

export class EmbeddedPostgres {
  private binDir: string;
  private dataDir: string;
  private port: number;
  private user: string;
  private password: string;
  private logger: Logger;
  private initialized = false;
  private running = false;
  private autoDataDir: boolean;

  constructor(options: EmbeddedPgOptions) {
    this.binDir = options.binDir;
    this.autoDataDir = !options.dataDir;
    this.dataDir = options.dataDir || path.join(os.tmpdir(), `odoo_pg_${Date.now()}`);
    this.port = options.port || 0;
    this.user = options.user || 'postgres';
    this.password = options.password || 'postgres';
    this.logger = options.logger;
  }

  /**
   * Get path to a PostgreSQL binary
   */
  getBinPath(name: string): string {
    const ext = process.platform === 'win32' ? '.exe' : '';
    return path.join(this.binDir, `${name}${ext}`);
  }

  /**
   * Initialize a new PostgreSQL data directory using initdb.
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // Auto-select port if needed
    if (this.port === 0) {
      this.port = await findFreePort();
      this.logger.info('Auto-selected port', { port: this.port });
    }

    // Ensure data directory is clean (initdb requires empty or non-existent dir)
    if (fs.existsSync(this.dataDir)) {
      fs.rmSync(this.dataDir, { recursive: true, force: true });
    }

    this.logger.info('Initializing PostgreSQL data directory', {
      dataDir: this.dataDir,
      port: this.port
    });

    const initdbPath = this.getBinPath('initdb');
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      PGPASSWORD: this.password
    };

    // Create password file in temp dir (NOT inside data dir — initdb needs it empty)
    const pwFile = path.join(os.tmpdir(), `pgpass_${Date.now()}`);
    fs.writeFileSync(pwFile, this.password, 'utf-8');

    try {
      const args = [
        '-D', this.dataDir,
        '-U', this.user,
        '-A', 'password',
        '--pwfile', pwFile,
        '-E', 'UTF8',
        '--no-locale'
      ];

      await this.execBinary(initdbPath, args, env);
      this.writePerformanceConfig();
      this.initialized = true;
      this.logger.info('PostgreSQL data directory initialized');
    } finally {
      // Clean up password file
      if (fs.existsSync(pwFile)) {
        fs.unlinkSync(pwFile);
      }
    }
  }

  /**
   * Write performance-optimized postgresql.conf for temporary database use.
   * Safe because this database is ephemeral — crash = just restart the migration.
   */
  private writePerformanceConfig(): void {
    const confPath = path.join(this.dataDir, 'postgresql.conf');

    const perfSettings = `
# === Embedded migration database — optimized for speed ===
# Durability disabled (temp database, crash = restart migration)
fsync = off
synchronous_commit = off
full_page_writes = off

# WAL tuning
wal_level = minimal
max_wal_senders = 0
wal_buffers = 64MB
max_wal_size = 2GB

# Memory (sized for migration workload)
shared_buffers = 256MB
work_mem = 64MB
maintenance_work_mem = 256MB
effective_cache_size = 512MB

# Checkpoint tuning
checkpoint_completion_target = 0.9

# Reduce logging noise
log_min_messages = warning
`;

    fs.appendFileSync(confPath, perfSettings, 'utf-8');
    this.logger.info('Performance config written to postgresql.conf');
  }

  /**
   * Start the PostgreSQL server.
   * Uses stdio:'ignore' so pg_ctl can exit cleanly on Windows
   * (otherwise postgres.exe inherits handles and 'close' never fires).
   */
  async start(): Promise<void> {
    if (this.running) return;
    if (!this.initialized) {
      throw new Error('PostgreSQL not initialized. Call init() first.');
    }

    this.logger.info('Starting embedded PostgreSQL', { port: this.port });

    const pgCtlPath = this.getBinPath('pg_ctl');
    const logFile = path.join(this.dataDir, 'server.log');

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
    };

    const args = [
      'start',
      '-D', this.dataDir,
      '-l', logFile,
      '-o', `-p ${this.port}`,
      '-w', // Wait for startup to complete
      '-t', '30' // Timeout after 30 seconds
    ];

    // Use stdio:'ignore' — pg_ctl start spawns postgres.exe which inherits
    // stdio handles on Windows, preventing the 'close' event from firing.
    // Server output goes to logFile via -l flag.
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(pgCtlPath, args, { env, windowsHide: true, stdio: 'ignore' });

      proc.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          // Read server log for error details
          let logContent = '';
          try { logContent = fs.readFileSync(logFile, 'utf-8'); } catch {}
          reject(new Error(`pg_ctl start exited with code ${code}. Server log:\n${logContent}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to spawn pg_ctl: ${err.message}`));
      });
    });

    // Verify server is accepting connections
    await this.waitForReady();
    this.running = true;
    this.logger.info('Embedded PostgreSQL started', { port: this.port });
  }

  /**
   * Wait until PostgreSQL accepts TCP connections.
   */
  private async waitForReady(timeoutMs = 10000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const ready = await new Promise<boolean>((resolve) => {
        const sock = net.createConnection({ host: '127.0.0.1', port: this.port }, () => {
          sock.destroy();
          resolve(true);
        });
        sock.on('error', () => resolve(false));
        sock.setTimeout(1000, () => { sock.destroy(); resolve(false); });
      });
      if (ready) return;
      await new Promise(r => setTimeout(r, 200));
    }
    throw new Error(`PostgreSQL did not become ready within ${timeoutMs}ms`);
  }

  /**
   * Stop the PostgreSQL server.
   */
  async stop(): Promise<void> {
    if (!this.running) return;

    this.logger.info('Stopping embedded PostgreSQL');

    const pgCtlPath = this.getBinPath('pg_ctl');
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
    };

    const runPgCtlStop = (mode: string): Promise<void> => {
      const args = ['stop', '-D', this.dataDir, '-m', mode, '-w', '-t', '15'];
      return new Promise<void>((resolve, reject) => {
        const proc = spawn(pgCtlPath, args, { env, windowsHide: true, stdio: 'ignore' });
        proc.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`pg_ctl stop exited with code ${code}`)));
        proc.on('error', (err) => reject(err));
      });
    };

    try {
      await runPgCtlStop('fast');
      this.running = false;
      this.logger.info('Embedded PostgreSQL stopped');
    } catch (err) {
      this.logger.warn('Failed to stop PostgreSQL gracefully, attempting immediate shutdown', {
        error: (err as Error).message
      });

      try {
        await runPgCtlStop('immediate');
      } catch {
        this.logger.warn('Immediate shutdown also failed');
      }
      this.running = false;
    }
  }

  /**
   * Stop the server and remove the data directory.
   */
  async cleanup(): Promise<void> {
    await this.stop();

    if (this.autoDataDir && fs.existsSync(this.dataDir)) {
      this.logger.info('Cleaning up data directory', { dataDir: this.dataDir });
      try {
        fs.rmSync(this.dataDir, { recursive: true, force: true });
      } catch (err) {
        this.logger.warn('Failed to clean up data directory', {
          error: (err as Error).message
        });
      }
    }
  }

  /**
   * Get a PostgresConfig for connecting to this embedded instance.
   */
  getConfig(): PostgresConfig {
    return {
      host: '127.0.0.1',
      port: this.port,
      user: this.user,
      password: this.password,
      binDir: this.binDir
    };
  }

  /**
   * Check if the server is currently running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Execute a PostgreSQL binary and wait for completion.
   */
  private execBinary(
    binaryPath: string,
    args: string[],
    env: Record<string, string>
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(binaryPath, args, { env, windowsHide: true });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => { stdout += data.toString(); });
      proc.stderr?.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code === 0) {
          if (stdout) this.logger.debug('Process output', { stdout: stdout.trim() });
          resolve();
        } else {
          reject(new Error(
            `${path.basename(binaryPath)} exited with code ${code}: ${stderr || stdout}`
          ));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to spawn ${path.basename(binaryPath)}: ${err.message}`));
      });
    });
  }
}

/**
 * Kill any orphaned embedded PostgreSQL processes from previous crashes.
 * Checks for stale PID files in temp directories.
 */
export function cleanupOrphanedInstances(logger: Logger): void {
  const tmpDir = os.tmpdir();
  try {
    const entries = fs.readdirSync(tmpDir).filter(e => e.startsWith('odoo_pg_'));
    for (const entry of entries) {
      const dataDir = path.join(tmpDir, entry);
      const pidFile = path.join(dataDir, 'postmaster.pid');

      if (fs.existsSync(pidFile)) {
        try {
          const pidContent = fs.readFileSync(pidFile, 'utf-8');
          const pid = parseInt(pidContent.split('\n')[0], 10);
          if (pid) {
            logger.info('Found orphaned PostgreSQL instance', { pid, dataDir });
            try {
              process.kill(pid, 'SIGTERM');
            } catch {
              // Process already dead
            }
          }
        } catch {
          // Ignore read errors
        }
      }

      // Clean up old data directories (older than 1 hour)
      try {
        const stat = fs.statSync(dataDir);
        const ageMs = Date.now() - stat.mtimeMs;
        if (ageMs > 3600000) {
          fs.rmSync(dataDir, { recursive: true, force: true });
          logger.info('Cleaned up old data directory', { dataDir });
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  } catch {
    // Ignore errors during cleanup scan
  }
}
