/**
 * Migration Orchestrator
 *
 * Coordinates the execution of migration scripts in the correct order,
 * with proper error handling and rollback capabilities.
 *
 * Supports multiple migration paths:
 * - 16.0 → 17.0
 * - 17.0 → 18.0
 */

import { Pool } from 'pg';
import {
  Logger,
  MigrationResult,
  MigrationScript
} from '../types';
import {
  getMigrationScripts as getMigrationScripts16to17,
  SOURCE_VERSION as SOURCE_16,
  TARGET_VERSION as TARGET_17,
  getRequiredTables as getRequiredTables16to17
} from './odoo-16-to-17';
import {
  getMigrationScripts17to18,
  SOURCE_VERSION_17,
  TARGET_VERSION_18,
  getRequiredTables17to18
} from './odoo-17-to-18';
import { executeMigrationScript, tableExists } from '../database';

/**
 * Supported migration paths
 */
export type MigrationPath = '16-to-17' | '17-to-18';

/**
 * Migration path configuration
 */
interface MigrationPathConfig {
  sourceVersion: string;
  targetVersion: string;
  getScripts: () => MigrationScript[];
  getRequiredTables: () => string[];
}

const MIGRATION_PATHS: Record<MigrationPath, MigrationPathConfig> = {
  '16-to-17': {
    sourceVersion: SOURCE_16,
    targetVersion: TARGET_17,
    getScripts: getMigrationScripts16to17,
    getRequiredTables: getRequiredTables16to17
  },
  '17-to-18': {
    sourceVersion: SOURCE_VERSION_17,
    targetVersion: TARGET_VERSION_18,
    getScripts: getMigrationScripts17to18,
    getRequiredTables: getRequiredTables17to18
  }
};

/**
 * Detect which migration path to use based on database version
 */
export async function detectMigrationPath(pool: Pool): Promise<MigrationPath | null> {
  try {
    const versionResult = await pool.query(`
      SELECT value FROM ir_config_parameter
      WHERE key = 'database.version'
    `);

    if (versionResult.rows.length > 0) {
      const currentVersion = versionResult.rows[0].value;

      if (currentVersion.startsWith('16.')) {
        return '16-to-17';
      } else if (currentVersion.startsWith('17.')) {
        return '17-to-18';
      }
    }
  } catch {
    // Table might not exist, try to infer from other indicators
  }

  return null;
}

/**
 * Run migration for a specific path
 */
export async function runMigration(
  pool: Pool,
  logger: Logger,
  migrationPath?: MigrationPath
): Promise<MigrationResult> {
  const startTime = Date.now();

  // Auto-detect path if not specified
  let path: MigrationPath | undefined = migrationPath;
  if (!path) {
    const detected = await detectMigrationPath(pool);
    if (!detected) {
      return {
        success: false,
        sourceVersion: 'unknown',
        targetVersion: 'unknown',
        migrationsApplied: [],
        errors: [{
          phase: 'migration',
          message: 'Could not detect database version. Please specify migration path.',
          recoverable: false
        }],
        warnings: [],
        duration: Date.now() - startTime
      };
    }
    path = detected;
    logger.info('Auto-detected migration path', { path });
  }

  const config = MIGRATION_PATHS[path];
  const result: MigrationResult = {
    success: false,
    sourceVersion: config.sourceVersion,
    targetVersion: config.targetVersion,
    migrationsApplied: [],
    errors: [],
    warnings: [],
    duration: 0
  };

  logger.info('Starting migration', {
    source: config.sourceVersion,
    target: config.targetVersion,
    path
  });

  try {
    // Phase 1: Pre-migration validation
    logger.info('Phase 1: Pre-migration validation');
    await validatePreMigration(pool, config, result, logger);

    if (result.errors.length > 0) {
      logger.error('Pre-migration validation failed', {
        errors: result.errors.length
      });
      result.duration = Date.now() - startTime;
      return result;
    }

    // Phase 2: Execute migration scripts
    logger.info('Phase 2: Executing migration scripts');
    const scripts = config.getScripts();
    logger.info(`Found ${scripts.length} migration scripts`);

    for (const script of scripts) {
      try {
        const applied = await executeMigrationScript(pool, script, logger);
        if (applied) {
          result.migrationsApplied.push(script.id);
        } else {
          result.warnings.push(`Skipped: ${script.id} (pre-check false)`);
        }
      } catch (err) {
        result.errors.push({
          phase: 'migration',
          message: `Script ${script.id} failed: ${(err as Error).message}`,
          details: script.name,
          recoverable: false
        });
        logger.error('Migration script failed, aborting', { scriptId: script.id });
        result.duration = Date.now() - startTime;
        return result;
      }
    }

    // Phase 3: Post-migration validation
    logger.info('Phase 3: Post-migration validation');
    await validatePostMigration(pool, config, result, logger);

    if (result.errors.length === 0) {
      result.success = true;
      logger.info('Migration completed successfully', {
        scriptsApplied: result.migrationsApplied.length,
        warnings: result.warnings.length
      });
    }

  } catch (err) {
    result.errors.push({
      phase: 'migration',
      message: `Unexpected error: ${(err as Error).message}`,
      recoverable: false
    });
    logger.error('Migration failed with unexpected error', {
      error: (err as Error).message
    });
  }

  result.duration = Date.now() - startTime;
  return result;
}

/**
 * Validate database state before migration
 */
async function validatePreMigration(
  pool: Pool,
  config: MigrationPathConfig,
  result: MigrationResult,
  logger: Logger
): Promise<void> {
  logger.debug('Validating pre-migration state');

  // Check required tables exist
  const requiredTables = config.getRequiredTables();
  for (const table of requiredTables) {
    const exists = await tableExists(pool, table);
    if (!exists) {
      result.errors.push({
        phase: 'migration',
        message: `Required table missing: ${table}`,
        recoverable: false
      });
    }
  }

  // Check current version
  try {
    const versionResult = await pool.query(`
      SELECT value FROM ir_config_parameter
      WHERE key = 'database.version'
    `);

    if (versionResult.rows.length > 0) {
      const currentVersion = versionResult.rows[0].value;
      logger.info('Current database version', { version: currentVersion });

      const expectedPrefix = config.sourceVersion.split('.')[0] + '.';
      if (!currentVersion.startsWith(expectedPrefix)) {
        throw new Error(
          `Database version mismatch: database is ${currentVersion} but migration expects Odoo ${config.sourceVersion}. ` +
          `Please select the correct migration path.`
        );
      }
    } else {
      result.warnings.push('No version marker found in database');
    }
  } catch (err) {
    logger.warn('Could not check database version', {
      error: (err as Error).message
    });
  }

  // Check for pending module upgrades
  try {
    const pendingResult = await pool.query(`
      SELECT COUNT(*) as count FROM ir_module_module
      WHERE state IN ('to upgrade', 'to install', 'to remove')
    `);

    const pendingCount = parseInt(pendingResult.rows[0].count, 10);
    if (pendingCount > 0) {
      result.warnings.push(
        `${pendingCount} modules have pending state changes. ` +
        `Run Odoo to complete module operations before migration.`
      );
    }
  } catch (err) {
    logger.debug('Could not check module states', {
      error: (err as Error).message
    });
  }
}

/**
 * Validate database state after migration
 */
async function validatePostMigration(
  pool: Pool,
  config: MigrationPathConfig,
  result: MigrationResult,
  logger: Logger
): Promise<void> {
  logger.debug('Validating post-migration state');

  // Verify version was updated
  try {
    const versionResult = await pool.query(`
      SELECT value FROM ir_config_parameter
      WHERE key = 'database.version'
    `);

    if (versionResult.rows.length > 0) {
      const newVersion = versionResult.rows[0].value;
      if (newVersion !== config.targetVersion) {
        result.warnings.push(
          `Version marker is ${newVersion}, expected ${config.targetVersion}`
        );
      } else {
        logger.info('Version marker updated successfully', {
          version: newVersion
        });
      }
    }
  } catch (err) {
    result.warnings.push(
      `Could not verify version marker: ${(err as Error).message}`
    );
  }

  // Run basic integrity checks
  try {
    // Check foreign key consistency for critical relations
    const fkCheck = await pool.query(`
      SELECT COUNT(*) as orphans FROM res_users u
      LEFT JOIN res_partner p ON u.partner_id = p.id
      WHERE u.partner_id IS NOT NULL AND p.id IS NULL
    `);

    const orphans = parseInt(fkCheck.rows[0].orphans, 10);
    if (orphans > 0) {
      result.warnings.push(
        `${orphans} users have orphaned partner references`
      );
    }
  } catch (err) {
    logger.debug('Could not run FK integrity check', {
      error: (err as Error).message
    });
  }
}

/**
 * Get migration progress information
 */
export function getMigrationProgress(
  appliedIds: string[],
  path: MigrationPath = '16-to-17'
): { completed: number; total: number; percentage: number } {
  const config = MIGRATION_PATHS[path];
  const scripts = config.getScripts();
  const completed = appliedIds.length;
  const total = scripts.length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { completed, total, percentage };
}

/**
 * Get available migration paths
 */
export function getAvailablePaths(): MigrationPath[] {
  return Object.keys(MIGRATION_PATHS) as MigrationPath[];
}

/**
 * Get migration path info
 */
export function getMigrationPathInfo(path: MigrationPath): {
  source: string;
  target: string;
  scriptCount: number;
} {
  const config = MIGRATION_PATHS[path];
  return {
    source: config.sourceVersion,
    target: config.targetVersion,
    scriptCount: config.getScripts().length
  };
}

/**
 * Re-export version constants for backwards compatibility
 */
export const SOURCE_VERSION = SOURCE_16;
export const TARGET_VERSION = TARGET_17;
