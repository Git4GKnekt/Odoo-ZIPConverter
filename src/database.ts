/**
 * BETA Timeline - PostgreSQL Database Operations
 *
 * Handles temporary database lifecycle:
 * 1. Create temp database with unique name
 * 2. Load SQL dump
 * 3. Execute migration queries
 * 4. Export migrated database
 * 5. Cleanup (drop temp database)
 */

import { Pool } from 'pg';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  DatabaseContext,
  Logger,
  MigrationScript,
  PostMigrationStats,
  PostgresConfig
} from './types';

/**
 * Find a PostgreSQL binary (psql, pg_dump) by checking PATH and common install locations
 */
function findPgBinary(name: string, binDir?: string): string {
  // If a specific bin directory is provided (embedded mode), use it
  if (binDir) {
    const ext = process.platform === 'win32' ? '.exe' : '';
    const binPath = path.join(binDir, `${name}${ext}`);
    if (fs.existsSync(binPath)) {
      return binPath;
    }
    throw new Error(`PostgreSQL binary not found: ${binPath}`);
  }

  if (process.platform !== 'win32') {
    return name; // On Linux/macOS, rely on PATH
  }

  const searchPaths = [
    process.env['ProgramFiles'],
    process.env['ProgramFiles(x86)'],
    'C:\\Program Files',
    'C:\\Program Files (x86)'
  ];

  for (const base of searchPaths) {
    if (!base) continue;
    const pgBase = path.join(base, 'PostgreSQL');
    if (!fs.existsSync(pgBase)) continue;

    const versions = fs.readdirSync(pgBase)
      .filter(d => /^\d+$/.test(d))
      .sort((a, b) => parseInt(b) - parseInt(a)); // newest first

    for (const ver of versions) {
      const binPath = path.join(pgBase, ver, 'bin', `${name}.exe`);
      if (fs.existsSync(binPath)) {
        return binPath;
      }
    }
  }

  return name; // Fall back to PATH
}

/**
 * Generate a unique temporary database name
 */
export function generateTempDbName(): string {
  const uniqueId = uuidv4().slice(0, 8).replace(/-/g, '');
  const timestamp = Date.now();
  return `odoo_migration_${timestamp}_${uniqueId}`;
}

/**
 * Create a temporary PostgreSQL database
 */
export async function createTempDatabase(
  config: PostgresConfig,
  logger: Logger
): Promise<DatabaseContext> {
  const dbName = generateTempDbName();
  const adminDb = config.adminDatabase || 'postgres';

  logger.info('Creating temporary database', { dbName });

  // Connect to admin database
  const adminPool = new Pool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: adminDb
  });

  try {
    // Create database
    await adminPool.query(`CREATE DATABASE "${dbName}"`);
    logger.debug('Database created successfully');

    return {
      dbName,
      connectionConfig: {
        ...config,
        database: dbName
      },
      created: true
    };
  } catch (err) {
    logger.error('Failed to create database', { error: (err as Error).message });
    throw err;
  } finally {
    await adminPool.end();
  }
}

/**
 * Load SQL dump file into database using psql
 */
export async function loadDumpFile(
  dumpPath: string,
  dbContext: DatabaseContext,
  logger: Logger
): Promise<void> {
  logger.info('Loading SQL dump into database', {
    dumpPath,
    database: dbContext.dbName
  });

  const config = dbContext.connectionConfig;

  // Check dump file exists
  if (!fs.existsSync(dumpPath)) {
    throw new Error(`Dump file not found: ${dumpPath}`);
  }

  const fileSize = fs.statSync(dumpPath).size;
  logger.debug('Dump file size', { size: `${(fileSize / 1024 / 1024).toFixed(2)} MB` });

  // Build psql command
  const env = {
    ...process.env,
    PGPASSWORD: config.password
  };

  const psqlArgs = [
    '-h', config.host,
    '-p', config.port.toString(),
    '-U', config.user,
    '-d', config.database,
    '-f', dumpPath,
    '-q' // Quiet mode — no ON_ERROR_STOP, Odoo dumps may have harmless duplicate constraints
  ];

  const psqlPath = findPgBinary('psql', config.binDir);
  logger.info('Using psql binary', { path: psqlPath });

  await new Promise<void>((resolve, reject) => {
    const psql = spawn(psqlPath, psqlArgs, { env });

    let stderr = '';

    psql.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    psql.on('close', (code) => {
      if (stderr) {
        const errorLines = stderr.split('\n').filter(l => l.includes('FEL:') || l.includes('ERROR:'));
        if (errorLines.length > 0) {
          logger.warn(`SQL import had ${errorLines.length} errors (may be harmless duplicates)`, {
            sample: errorLines.slice(0, 5).join('\n')
          });
        }
      }
      if (code === 0 || code === 3) {
        // code 3 = script errors (e.g. duplicate constraints) — verify below
        logger.info('SQL dump import finished', { exitCode: code });
        resolve();
      } else {
        logger.error('psql failed', { code, stderr });
        reject(new Error(`psql exited with code ${code}: ${stderr}`));
      }
    });

    psql.on('error', (err) => {
      reject(new Error(`Failed to spawn psql (${psqlPath}): ${err.message}`));
    });
  });

  // Verify that critical Odoo tables were loaded
  await verifyDumpImport(dbContext, logger);
}

/**
 * Verify that critical Odoo tables exist after dump import
 */
async function verifyDumpImport(dbContext: DatabaseContext, logger: Logger): Promise<void> {
  const pool = createPool(dbContext);
  try {
    const criticalTables = ['ir_module_module', 'ir_config_parameter', 'res_users'];
    for (const table of criticalTables) {
      const result = await pool.query(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1)`,
        [table]
      );
      if (!result.rows[0].exists) {
        throw new Error(`SQL dump import incomplete: critical table '${table}' is missing`);
      }
    }
    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public'`
    );
    logger.info('Dump import verified', { tableCount: countResult.rows[0].count });
  } finally {
    await pool.end();
  }
}

/**
 * Execute a single migration script
 */
export interface ScriptExecutionResult {
  applied: boolean;
  durationMs: number;
}

export async function executeMigrationScript(
  pool: Pool,
  script: MigrationScript,
  logger: Logger
): Promise<ScriptExecutionResult> {
  logger.info('Executing migration script', {
    id: script.id,
    name: script.name
  });

  const startTime = Date.now();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Run pre-check if defined
    if (script.preCheck) {
      const preResult = await client.query(script.preCheck);
      const shouldRun = preResult.rows[0]?.result ?? true;
      if (!shouldRun) {
        logger.info('Pre-check returned false, skipping script', { id: script.id });
        await client.query('ROLLBACK');
        return { applied: false, durationMs: Date.now() - startTime };
      }
    }

    // Execute main SQL
    await client.query(script.sql);

    // Run post-check if defined
    if (script.postCheck) {
      const postResult = await client.query(script.postCheck);
      const valid = postResult.rows[0]?.valid ?? true;
      if (!valid) {
        throw new Error(`Post-check failed for script: ${script.id}`);
      }
    }

    await client.query('COMMIT');
    const durationMs = Date.now() - startTime;
    logger.debug('Migration script completed', { id: script.id, durationMs });
    return { applied: true, durationMs };

  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration script failed', {
      id: script.id,
      error: (err as Error).message
    });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Collect post-migration database statistics
 */
export async function collectPostMigrationStats(
  pool: Pool,
  logger: Logger
): Promise<PostMigrationStats> {
  const stats: PostMigrationStats = {
    tableCount: 0,
    moduleCount: 0,
    installedModuleCount: 0,
    partnerCount: 0,
    userCount: 0
  };

  const queries: Array<{ key: keyof PostMigrationStats; sql: string }> = [
    { key: 'tableCount', sql: `SELECT COUNT(*)::int as count FROM information_schema.tables WHERE table_schema = 'public'` },
    { key: 'moduleCount', sql: `SELECT COUNT(*)::int as count FROM ir_module_module` },
    { key: 'installedModuleCount', sql: `SELECT COUNT(*)::int as count FROM ir_module_module WHERE state = 'installed'` },
    { key: 'partnerCount', sql: `SELECT COUNT(*)::int as count FROM res_partner` },
    { key: 'userCount', sql: `SELECT COUNT(*)::int as count FROM res_users` },
  ];

  for (const q of queries) {
    try {
      const result = await pool.query(q.sql);
      stats[q.key] = result.rows[0]?.count ?? 0;
    } catch (err) {
      logger.warn(`Failed to collect stat: ${q.key}`, { error: (err as Error).message });
    }
  }

  logger.info('Post-migration stats', stats as unknown as Record<string, unknown>);
  return stats;
}

/**
 * Export database to SQL dump file using pg_dump
 */
export async function exportDatabase(
  dbContext: DatabaseContext,
  outputPath: string,
  logger: Logger
): Promise<void> {
  logger.info('Exporting database to SQL dump', {
    database: dbContext.dbName,
    outputPath
  });

  const config = dbContext.connectionConfig;

  const env = {
    ...process.env,
    PGPASSWORD: config.password
  };

  const pgDumpArgs = [
    '-h', config.host,
    '-p', config.port.toString(),
    '-U', config.user,
    '-d', config.database,
    '-f', outputPath,
    '--no-owner',
    '--no-privileges',
    '--format=plain'
  ];

  const pgDumpPath = findPgBinary('pg_dump', config.binDir);
  logger.info('Using pg_dump binary', { path: pgDumpPath });

  return new Promise((resolve, reject) => {
    const pgDump = spawn(pgDumpPath, pgDumpArgs, { env });

    let stderr = '';

    pgDump.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pgDump.on('close', (code) => {
      if (code === 0) {
        const fileSize = fs.statSync(outputPath).size;
        logger.info('Database exported successfully', {
          size: `${(fileSize / 1024 / 1024).toFixed(2)} MB`
        });
        resolve();
      } else {
        logger.error('pg_dump failed', { code, stderr });
        reject(new Error(`pg_dump exited with code ${code}: ${stderr}`));
      }
    });

    pgDump.on('error', (err) => {
      reject(new Error(`Failed to spawn pg_dump (${pgDumpPath}): ${err.message}`));
    });
  });
}

/**
 * Drop temporary database
 */
export async function dropTempDatabase(
  dbContext: DatabaseContext,
  config: PostgresConfig,
  logger: Logger
): Promise<void> {
  if (!dbContext.created) {
    logger.debug('Database was not created, skipping drop');
    return;
  }

  logger.info('Dropping temporary database', { dbName: dbContext.dbName });

  const adminDb = config.adminDatabase || 'postgres';

  const adminPool = new Pool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: adminDb
  });

  try {
    // Terminate existing connections
    await adminPool.query(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = $1
        AND pid <> pg_backend_pid()
    `, [dbContext.dbName]);

    // Drop database
    await adminPool.query(`DROP DATABASE IF EXISTS "${dbContext.dbName}"`);
    logger.debug('Database dropped successfully');

  } catch (err) {
    logger.warn('Failed to drop temp database', {
      dbName: dbContext.dbName,
      error: (err as Error).message
    });
  } finally {
    await adminPool.end();
  }
}

/**
 * Create a connection pool for the temp database
 */
export function createPool(dbContext: DatabaseContext): Pool {
  return new Pool({
    host: dbContext.connectionConfig.host,
    port: dbContext.connectionConfig.port,
    user: dbContext.connectionConfig.user,
    password: dbContext.connectionConfig.password,
    database: dbContext.connectionConfig.database,
    max: 5,
    idleTimeoutMillis: 30000
  });
}

/**
 * Verify database connection
 */
export async function verifyConnection(
  pool: Pool,
  logger: Logger
): Promise<boolean> {
  try {
    const result = await pool.query('SELECT 1 as connected');
    const connected = result.rows[0]?.connected === 1;
    logger.debug('Database connection verified', { connected });
    return connected;
  } catch (err) {
    logger.error('Database connection failed', {
      error: (err as Error).message
    });
    return false;
  }
}

/**
 * Get database size
 */
export async function getDatabaseSize(
  pool: Pool,
  dbName: string,
  logger: Logger
): Promise<string> {
  try {
    const result = await pool.query(
      'SELECT pg_size_pretty(pg_database_size($1)) as size',
      [dbName]
    );
    return result.rows[0]?.size || 'unknown';
  } catch (err) {
    logger.warn('Failed to get database size', {
      error: (err as Error).message
    });
    return 'unknown';
  }
}

/**
 * List all tables in database
 */
export async function listTables(
  pool: Pool,
  logger: Logger
): Promise<string[]> {
  const result = await pool.query(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);

  const tables = result.rows.map(row => row.tablename);
  logger.debug('Tables in database', { count: tables.length });
  return tables;
}

/**
 * Check if a table exists
 */
export async function tableExists(
  pool: Pool,
  tableName: string
): Promise<boolean> {
  const result = await pool.query(`
    SELECT EXISTS (
      SELECT FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename = $1
    ) as exists
  `, [tableName]);

  return result.rows[0]?.exists || false;
}

/**
 * Check if a column exists in a table
 */
export async function columnExists(
  pool: Pool,
  tableName: string,
  columnName: string
): Promise<boolean> {
  const result = await pool.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
    ) as exists
  `, [tableName, columnName]);

  return result.rows[0]?.exists || false;
}
