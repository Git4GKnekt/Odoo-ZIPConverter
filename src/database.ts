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
import { v4 as uuidv4 } from 'uuid';
import {
  DatabaseContext,
  Logger,
  MigrationScript,
  PostgresConfig
} from './types';

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
    '-q', // Quiet mode
    '--set', 'ON_ERROR_STOP=on'
  ];

  return new Promise((resolve, reject) => {
    const psql = spawn('psql', psqlArgs, { env });

    let stderr = '';

    psql.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    psql.on('close', (code) => {
      if (code === 0) {
        logger.info('SQL dump loaded successfully');
        resolve();
      } else {
        logger.error('psql failed', { code, stderr });
        reject(new Error(`psql exited with code ${code}: ${stderr}`));
      }
    });

    psql.on('error', (err) => {
      reject(new Error(`Failed to spawn psql: ${err.message}`));
    });
  });
}

/**
 * Execute a single migration script
 */
export async function executeMigrationScript(
  pool: Pool,
  script: MigrationScript,
  logger: Logger
): Promise<boolean> {
  logger.info('Executing migration script', {
    id: script.id,
    name: script.name
  });

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
        return false;
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
    logger.debug('Migration script completed', { id: script.id });
    return true;

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

  return new Promise((resolve, reject) => {
    const pgDump = spawn('pg_dump', pgDumpArgs, { env });

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
      reject(new Error(`Failed to spawn pg_dump: ${err.message}`));
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
