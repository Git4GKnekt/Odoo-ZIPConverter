/**
 * BETA Timeline - Main Entry Point
 * Odoo Backup Migration Tool (16 -> 17)
 *
 * Simple disk-based extraction approach:
 * 1. Extract ZIP to temp directory
 * 2. Load SQL into temporary PostgreSQL database
 * 3. Run migration scripts
 * 4. Dump database and repack ZIP
 */

import * as path from 'path';
import { Pool } from 'pg';
import {
  MigrationConfig,
  MigrationResult,
  Logger,
  DatabaseContext,
  ExtractionContext,
  VersionPair
} from './types';
import {
  createTempDirectory,
  extractBackup,
  updateManifest,
  packBackup,
  cleanupTempDirectory,
  getFileSize
} from './extractor';
import {
  createTempDatabase,
  loadDumpFile,
  exportDatabase,
  dropTempDatabase,
  createPool,
  verifyConnection,
  getDatabaseSize,
  collectPostMigrationStats
} from './database';
import * as fs from 'fs';
import { runMigration, getMigrationPathInfo, MigrationPath } from './migration';

/**
 * Create a simple console logger
 */
function createLogger(verbose: boolean): Logger {
  const timestamp = () => new Date().toISOString();

  return {
    debug: (message, meta) => {
      if (verbose) {
        console.log(`[${timestamp()}] DEBUG: ${message}`, meta || '');
      }
    },
    info: (message, meta) => {
      console.log(`[${timestamp()}] INFO: ${message}`, meta ? JSON.stringify(meta) : '');
    },
    warn: (message, meta) => {
      console.warn(`[${timestamp()}] WARN: ${message}`, meta ? JSON.stringify(meta) : '');
    },
    error: (message, meta) => {
      console.error(`[${timestamp()}] ERROR: ${message}`, meta ? JSON.stringify(meta) : '');
    }
  };
}

/**
 * Main migration function
 */
export async function migrate(config: MigrationConfig): Promise<MigrationResult> {
  const logger = createLogger(config.verbose || false);
  const startTime = Date.now();

  logger.info('=== Odoo Migration Tool (BETA Timeline) ===');
  logger.info('Starting migration', {
    input: config.inputPath,
    output: config.outputPath
  });

  let tempDir: string | null = null;
  let dbContext: DatabaseContext | null = null;
  let pool: Pool | null = null;
  let extractionContext: ExtractionContext | null = null;

  const emitProgress = config.onProgress || (() => {});

  try {
    // ===== PHASE 1: Extraction =====
    const phase1Start = Date.now();
    logger.info('--- Phase 1: Extraction ---');
    emitProgress({ phase: 'extraction', progress: 5, message: 'Extracting backup archive...' });
    tempDir = createTempDirectory(config.tempDir);
    logger.info('Created temp directory', { path: tempDir });

    extractionContext = await extractBackup(config.inputPath, tempDir, logger);

    const sourceVersion = extractionContext.contents.manifest.version;
    logger.info('Source backup version', { version: sourceVersion });

    // Determine migration path
    let migrationPath: MigrationPath | undefined = config.migrationPath;
    if (!migrationPath) {
      // Auto-detect from source version
      if (sourceVersion.startsWith('16.')) {
        migrationPath = '16-to-17';
      } else if (sourceVersion.startsWith('17.')) {
        migrationPath = '17-to-18';
      } else {
        throw new Error(
          `Unsupported Odoo version: ${sourceVersion}. Only Odoo 16.x and 17.x backups are supported.`
        );
      }
      logger.info('Auto-detected migration path', { path: migrationPath });
    }

    const pathInfo = getMigrationPathInfo(migrationPath);
    const expectedPrefix = pathInfo.source.split('.')[0] + '.';
    if (!sourceVersion.startsWith(expectedPrefix)) {
      throw new Error(
        `Version mismatch: backup is Odoo ${sourceVersion} but migration path expects Odoo ${pathInfo.source}. ` +
        `Please select the correct migration path for your backup.`
      );
    }

    const phase1Duration = Date.now() - phase1Start;
    emitProgress({ phase: 'extraction', progress: 20, message: 'Extraction complete' });

    // ===== PHASE 2: Database Setup =====
    const phase2Start = Date.now();
    logger.info('--- Phase 2: Database Setup ---');
    emitProgress({ phase: 'database', progress: 25, message: 'Creating temporary database...' });
    dbContext = await createTempDatabase(config.postgresConfig, logger);

    pool = createPool(dbContext);
    const connected = await verifyConnection(pool, logger);
    if (!connected) {
      throw new Error('Failed to connect to temporary database');
    }

    emitProgress({ phase: 'database', progress: 30, message: 'Loading SQL dump...' });
    await loadDumpFile(extractionContext.contents.dumpPath, dbContext, logger);

    const dbSizeBefore = await getDatabaseSize(pool, dbContext.dbName, logger);
    logger.info('Database loaded', { size: dbSizeBefore });

    const phase2Duration = Date.now() - phase2Start;
    emitProgress({ phase: 'database', progress: 45, message: 'Database ready' });

    // ===== PHASE 3: Migration =====
    const phase3Start = Date.now();
    logger.info('--- Phase 3: Migration ---');
    emitProgress({ phase: 'migration', progress: 50, message: 'Running migration scripts...' });
    const migrationResult = await runMigration(pool, logger, migrationPath);

    if (!migrationResult.success) {
      logger.error('Migration failed', {
        errors: migrationResult.errors.length,
        applied: migrationResult.migrationsApplied.length
      });
      return migrationResult;
    }

    const phase3Duration = Date.now() - phase3Start;

    const dbSizeAfter = await getDatabaseSize(pool, dbContext.dbName, logger);
    logger.info('Migration complete', {
      scriptsApplied: migrationResult.migrationsApplied.length,
      warnings: migrationResult.warnings.length,
      dbSizeBefore,
      dbSizeAfter
    });

    // Collect post-migration stats
    const postStats = await collectPostMigrationStats(pool, logger);
    emitProgress({ phase: 'migration', progress: 75, message: 'Migration scripts complete' });

    // ===== PHASE 4: Export =====
    const phase4Start = Date.now();
    logger.info('--- Phase 4: Export ---');
    emitProgress({ phase: 'export', progress: 80, message: 'Exporting database...' });

    // Close pool before pg_dump
    await pool.end();
    pool = null;

    // Export migrated database
    const newDumpPath = path.join(tempDir, 'dump_migrated.sql');
    await exportDatabase(dbContext, newDumpPath, logger);

    // Update extraction context with new dump
    extractionContext.contents.dumpPath = newDumpPath;

    // Update manifest
    const originalDbName = extractionContext.contents.manifest.db_name;
    updateManifest(extractionContext.contents.manifestPath, {
      version: pathInfo.target,
      db_name: originalDbName // Keep original DB name
    }, logger);

    // Pack new ZIP
    emitProgress({ phase: 'export', progress: 90, message: 'Creating output ZIP...' });
    await packBackup(extractionContext.contents, config.outputPath, logger);

    const phase4Duration = Date.now() - phase4Start;
    emitProgress({ phase: 'export', progress: 100, message: 'Migration complete!' });

    // Calculate stats
    const inputSize = getFileSize(config.inputPath);
    const outputSize = getFileSize(config.outputPath);
    migrationResult.duration = Date.now() - startTime;

    logger.info('Migration complete', {
      inputSize,
      outputSize,
      duration: `${(migrationResult.duration / 1000).toFixed(2)}s`
    });

    // Build full report
    const phaseTimings = {
      extraction: phase1Duration,
      database: phase2Duration,
      migration: phase3Duration,
      export: phase4Duration
    };

    if (migrationResult.report) {
      migrationResult.report.phaseTimings = phaseTimings;
      migrationResult.report.stats = postStats;
    } else {
      migrationResult.report = {
        phaseTimings,
        scriptResults: [],
        stats: postStats,
        importWarnings: []
      };
    }

    // Save text report
    try {
      const reportPath = config.outputPath.replace(/\.zip$/i, '-report.txt');
      const reportText = generateTextReport(migrationResult, pathInfo);
      fs.writeFileSync(reportPath, reportText, 'utf8');
      migrationResult.report.reportFilePath = reportPath;
      logger.info('Report saved', { path: reportPath });
    } catch (reportErr) {
      logger.warn('Failed to save report file', { error: (reportErr as Error).message });
    }

    return migrationResult;

  } catch (err) {
    logger.error('Migration failed with error', {
      error: (err as Error).message,
      stack: (err as Error).stack
    });

    // Get version info for error response
    const errorPathInfo = config.migrationPath
      ? getMigrationPathInfo(config.migrationPath)
      : { source: '16.0', target: '17.0' };

    return {
      success: false,
      sourceVersion: errorPathInfo.source,
      targetVersion: errorPathInfo.target,
      migrationsApplied: [],
      errors: [{
        phase: 'migration',
        message: (err as Error).message,
        recoverable: false
      }],
      warnings: [],
      duration: Date.now() - startTime
    };

  } finally {
    // ===== Cleanup =====
    logger.info('--- Cleanup ---');

    // Close database pool
    if (pool) {
      try {
        await pool.end();
      } catch (e) {
        logger.warn('Failed to close pool', { error: (e as Error).message });
      }
    }

    // Drop temp database
    if (dbContext) {
      await dropTempDatabase(dbContext, config.postgresConfig, logger);
    }

    // Remove temp directory
    if (tempDir && !config.keepTemp) {
      cleanupTempDirectory(tempDir, logger);
    } else if (tempDir && config.keepTemp) {
      logger.info('Keeping temp directory for debugging', { path: tempDir });
    }

    logger.info('Cleanup complete');
  }
}

/**
 * Generate a human-readable text report
 */
function generateTextReport(result: MigrationResult, pathInfo: VersionPair): string {
  const lines: string[] = [];
  const fmt = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

  lines.push('=== Odoo Migration Report ===');
  lines.push('Odoo Backup Migration Tool by Arbore, Sweden — https://www.arbore.se');
  lines.push(`Date: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`);
  lines.push(`Source: ${pathInfo.source} → Target: ${pathInfo.target}`);
  lines.push(`Status: ${result.success ? 'Success' : 'Failed'}`);
  lines.push(`Duration: ${fmt(result.duration)}`);
  lines.push('');

  if (result.report) {
    const pt = result.report.phaseTimings;
    lines.push('--- Phase Timing ---');
    lines.push(`Extraction:     ${fmt(pt.extraction)}`);
    lines.push(`Database Setup: ${fmt(pt.database)}`);
    lines.push(`Migration:      ${fmt(pt.migration)}`);
    lines.push(`Export:         ${fmt(pt.export)}`);
    lines.push('');

    const s = result.report.stats;
    lines.push('--- Database Statistics ---');
    lines.push(`Tables: ${s.tableCount}`);
    lines.push(`Modules: ${s.moduleCount} (${s.installedModuleCount} installed)`);
    lines.push(`Partners: ${s.partnerCount.toLocaleString()}`);
    lines.push(`Users: ${s.userCount}`);
    lines.push('');

    const sr = result.report.scriptResults;
    const total = sr.length;
    const applied = sr.filter(s => s.status === 'applied').length;
    lines.push(`--- Migration Scripts (${applied}/${total}) ---`);
    for (const script of sr) {
      const tag = script.status === 'applied' ? '[OK]  ' : script.status === 'skipped' ? '[SKIP]' : '[FAIL]';
      const name = script.name.padEnd(40);
      lines.push(`${tag} ${script.id.padEnd(35)} ${name} ${fmt(script.durationMs)}`);
      if (script.error) {
        lines.push(`       Error: ${script.error}`);
      }
    }
    lines.push('');

    if (result.report.importWarnings.length > 0) {
      lines.push(`--- Import Warnings (${result.report.importWarnings.length}) ---`);
      for (const w of result.report.importWarnings) {
        lines.push(`- ${w}`);
      }
      lines.push('');
    }
  }

  if (result.warnings.length > 0) {
    lines.push(`--- Warnings (${result.warnings.length}) ---`);
    for (const w of result.warnings) {
      lines.push(`- ${w}`);
    }
    lines.push('');
  }

  if (result.errors.length > 0) {
    lines.push(`--- Errors (${result.errors.length}) ---`);
    for (const e of result.errors) {
      lines.push(`- [${e.phase}] ${e.message}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * CLI entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Simple argument parsing
  const getArg = (name: string): string | undefined => {
    const index = args.indexOf(name);
    return index !== -1 ? args[index + 1] : undefined;
  };

  const hasFlag = (name: string): boolean => args.includes(name);

  // Show help
  if (hasFlag('--help') || hasFlag('-h') || args.length === 0) {
    console.log(`
Odoo Backup Migration Tool (BETA Timeline)
Migrates Odoo backup ZIP files from version 16 to 17

Usage:
  npx ts-node src/index.ts [options]

Options:
  --input, -i <path>     Input ZIP file (Odoo 16 backup)
  --output, -o <path>    Output ZIP file (Odoo 17 backup)
  --pg-host <host>       PostgreSQL host (default: localhost)
  --pg-port <port>       PostgreSQL port (default: 5432)
  --pg-user <user>       PostgreSQL user (default: postgres)
  --pg-password <pass>   PostgreSQL password (default: postgres)
  --keep-temp            Keep temp files after migration (for debugging)
  --verbose, -v          Enable verbose logging
  --help, -h             Show this help

Example:
  npx ts-node src/index.ts \\
    --input backup-odoo16.zip \\
    --output backup-odoo17.zip \\
    --pg-host localhost \\
    --pg-user postgres \\
    --pg-password secret
`);
    process.exit(0);
  }

  // Parse arguments
  const inputPath = getArg('--input') || getArg('-i');
  const outputPath = getArg('--output') || getArg('-o');

  if (!inputPath || !outputPath) {
    console.error('Error: --input and --output are required');
    process.exit(1);
  }

  const config: MigrationConfig = {
    inputPath: path.resolve(inputPath),
    outputPath: path.resolve(outputPath),
    postgresConfig: {
      host: getArg('--pg-host') || 'localhost',
      port: parseInt(getArg('--pg-port') || '5432', 10),
      user: getArg('--pg-user') || 'postgres',
      password: getArg('--pg-password') || 'postgres'
    },
    keepTemp: hasFlag('--keep-temp'),
    verbose: hasFlag('--verbose') || hasFlag('-v')
  };

  // Run migration
  const result = await migrate(config);

  // Output result
  console.log('\n=== Migration Result ===');
  console.log(`Success: ${result.success}`);
  console.log(`Source Version: ${result.sourceVersion}`);
  console.log(`Target Version: ${result.targetVersion}`);
  console.log(`Scripts Applied: ${result.migrationsApplied.length}`);
  console.log(`Duration: ${(result.duration / 1000).toFixed(2)}s`);

  if (result.warnings.length > 0) {
    console.log('\nWarnings:');
    result.warnings.forEach(w => console.log(`  - ${w}`));
  }

  if (result.errors.length > 0) {
    console.log('\nErrors:');
    result.errors.forEach(e => console.log(`  - [${e.phase}] ${e.message}`));
  }

  process.exit(result.success ? 0 : 1);
}

// Run CLI if executed directly
if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

// Export for programmatic use
export { MigrationConfig, MigrationResult, MigrationPath } from './types';
