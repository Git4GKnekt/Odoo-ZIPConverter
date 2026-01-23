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
  ExtractionContext
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
  getDatabaseSize
} from './database';
import { runMigration, TARGET_VERSION } from './migration';

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

  try {
    // ===== PHASE 1: Extraction =====
    logger.info('--- Phase 1: Extraction ---');
    tempDir = createTempDirectory(config.tempDir);
    logger.info('Created temp directory', { path: tempDir });

    extractionContext = await extractBackup(config.inputPath, tempDir, logger);

    const sourceVersion = extractionContext.contents.manifest.version;
    logger.info('Source backup version', { version: sourceVersion });

    if (!sourceVersion.startsWith('16.')) {
      logger.warn('Source version is not 16.x, migration may have unexpected results');
    }

    // ===== PHASE 2: Database Setup =====
    logger.info('--- Phase 2: Database Setup ---');
    dbContext = await createTempDatabase(config.postgresConfig, logger);

    pool = createPool(dbContext);
    const connected = await verifyConnection(pool, logger);
    if (!connected) {
      throw new Error('Failed to connect to temporary database');
    }

    await loadDumpFile(extractionContext.contents.dumpPath, dbContext, logger);

    const dbSizeBefore = await getDatabaseSize(pool, dbContext.dbName, logger);
    logger.info('Database loaded', { size: dbSizeBefore });

    // ===== PHASE 3: Migration =====
    logger.info('--- Phase 3: Migration ---');
    const migrationResult = await runMigration(pool, logger);

    if (!migrationResult.success) {
      logger.error('Migration failed', {
        errors: migrationResult.errors.length,
        applied: migrationResult.migrationsApplied.length
      });
      return migrationResult;
    }

    const dbSizeAfter = await getDatabaseSize(pool, dbContext.dbName, logger);
    logger.info('Migration complete', {
      scriptsApplied: migrationResult.migrationsApplied.length,
      warnings: migrationResult.warnings.length,
      dbSizeBefore,
      dbSizeAfter
    });

    // ===== PHASE 4: Export =====
    logger.info('--- Phase 4: Export ---');

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
      version: TARGET_VERSION,
      db_name: originalDbName // Keep original DB name
    }, logger);

    // Pack new ZIP
    await packBackup(extractionContext.contents, config.outputPath, logger);

    // Calculate stats
    const inputSize = getFileSize(config.inputPath);
    const outputSize = getFileSize(config.outputPath);
    logger.info('Migration complete', {
      inputSize,
      outputSize,
      duration: `${((Date.now() - startTime) / 1000).toFixed(2)}s`
    });

    migrationResult.duration = Date.now() - startTime;
    return migrationResult;

  } catch (err) {
    logger.error('Migration failed with error', {
      error: (err as Error).message,
      stack: (err as Error).stack
    });

    return {
      success: false,
      sourceVersion: '16.0',
      targetVersion: TARGET_VERSION,
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
export { MigrationConfig, MigrationResult } from './types';
