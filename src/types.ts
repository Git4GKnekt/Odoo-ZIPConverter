/**
 * BETA Timeline - Type Definitions
 * Odoo Backup Migration Tool (16 -> 17)
 */

export interface PostgresConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  /** Base database for admin operations (default: postgres) */
  adminDatabase?: string;
}

/** Supported migration paths */
export type MigrationPath = '16-to-17' | '17-to-18';

export interface ProgressUpdate {
  phase: 'extraction' | 'database' | 'migration' | 'export';
  progress: number;
  message: string;
}

export interface MigrationConfig {
  inputPath: string;
  outputPath: string;
  postgresConfig: PostgresConfig;
  /** Migration path to use (auto-detected if not specified) */
  migrationPath?: MigrationPath;
  /** Keep temp files after completion (for debugging) */
  keepTemp?: boolean;
  /** Custom temp directory base path */
  tempDir?: string;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Progress callback for UI updates */
  onProgress?: (update: ProgressUpdate) => void;
}

export interface OdooManifest {
  db_name: string;
  version: string;
  modules?: Record<string, string>;
  /** Timestamp of backup creation */
  timestamp?: string;
}

export interface BackupContents {
  /** Path to extracted dump.sql */
  dumpPath: string;
  /** Path to extracted filestore directory */
  filestorePath: string;
  /** Parsed manifest data */
  manifest: OdooManifest;
  /** Path to manifest.json file */
  manifestPath: string;
}

export interface MigrationResult {
  success: boolean;
  sourceVersion: string;
  targetVersion: string;
  migrationsApplied: string[];
  errors: MigrationError[];
  warnings: string[];
  duration: number;
  report?: MigrationReport;
}

export interface ScriptResult {
  id: string;
  name: string;
  description: string;
  status: 'applied' | 'skipped' | 'failed';
  durationMs: number;
  error?: string;
}

export interface PhaseTiming {
  extraction: number;
  database: number;
  migration: number;
  export: number;
}

export interface PostMigrationStats {
  tableCount: number;
  moduleCount: number;
  installedModuleCount: number;
  partnerCount: number;
  userCount: number;
}

export interface MigrationReport {
  phaseTimings: PhaseTiming;
  scriptResults: ScriptResult[];
  stats: PostMigrationStats;
  importWarnings: string[];
  reportFilePath?: string;
}

export interface MigrationError {
  phase: 'extraction' | 'database' | 'migration' | 'export';
  message: string;
  details?: string;
  recoverable: boolean;
}

export interface MigrationScript {
  id: string;
  name: string;
  description: string;
  /** Order of execution (lower = earlier) */
  order: number;
  /** SQL to execute */
  sql: string;
  /** Pre-condition check SQL (must return true) */
  preCheck?: string;
  /** Post-condition validation SQL */
  postCheck?: string;
}

export interface DatabaseContext {
  /** Temporary database name */
  dbName: string;
  /** Full connection config for temp database */
  connectionConfig: PostgresConfig & { database: string };
  /** Whether database was successfully created */
  created: boolean;
}

export interface ExtractionContext {
  /** Path to temp directory */
  tempDir: string;
  /** Extracted backup contents */
  contents: BackupContents;
  /** Whether extraction completed successfully */
  complete: boolean;
}

export interface MigrationPhase {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime?: Date;
  endTime?: Date;
  error?: MigrationError;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Version pair for migration
 */
export interface VersionPair {
  source: string;
  target: string;
}

/**
 * Statistics from migration run
 */
export interface MigrationStats {
  tablesProcessed: number;
  rowsModified: number;
  durationMs: number;
  tempDbSize: string;
  inputZipSize: number;
  outputZipSize: number;
}
