/**
 * BETA Timeline - IPC Handlers
 * Bridge between Electron main process and renderer
 */

import { ipcMain, dialog, BrowserWindow } from 'electron';
import * as path from 'path';
import { getStore, getMainWindow, showNotification, updateTrayStatus } from './index';

// Import migration engine from backend (compiled)
// In dev/production: backend is copied to gui/dist/backend/ before build
import { migrate, MigrationConfig as BackendMigrationConfig } from '../backend/index';

// Import types from the migration engine
interface PostgresConfig {
  host: string;
  port: number;
  user: string;
  password: string;
}

type MigrationPath = '16-to-17' | '17-to-18';

interface MigrationConfig {
  inputPath: string;
  outputPath: string;
  postgresConfig: PostgresConfig;
  migrationPath?: MigrationPath;
  keepTemp?: boolean;
  verbose?: boolean;
}

interface MigrationResult {
  success: boolean;
  sourceVersion: string;
  targetVersion: string;
  migrationsApplied: string[];
  errors: Array<{ phase: string; message: string; recoverable: boolean }>;
  warnings: string[];
  duration: number;
}

interface ProgressUpdate {
  phase: 'extraction' | 'database' | 'migration' | 'export';
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number; // 0-100
  message: string;
  details?: Record<string, unknown>;
}

// Track active migration for cancellation
let activeMigration: { cancel: () => void } | null = null;

/**
 * Register all IPC handlers
 */
export function registerIpcHandlers(): void {
  // ==========================================
  // File Dialog Handlers
  // ==========================================

  ipcMain.handle('dialog:open-file', async (_, options?: {
    title?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
    defaultPath?: string;
  }) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;

    const result = await dialog.showOpenDialog(mainWindow, {
      title: options?.title || 'Select Odoo Backup File',
      filters: options?.filters || [
        { name: 'ZIP Archives', extensions: ['zip'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      defaultPath: options?.defaultPath,
      properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    // Add to recent files
    addRecentFile(result.filePaths[0]);

    return result.filePaths[0];
  });

  ipcMain.handle('dialog:save-file', async (_, options?: {
    title?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
    defaultPath?: string;
  }) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;

    const result = await dialog.showSaveDialog(mainWindow, {
      title: options?.title || 'Save Migrated Backup',
      filters: options?.filters || [
        { name: 'ZIP Archives', extensions: ['zip'] }
      ],
      defaultPath: options?.defaultPath || 'migrated-backup.zip',
      properties: ['createDirectory', 'showOverwriteConfirmation']
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    return result.filePath;
  });

  // ==========================================
  // Settings Handlers
  // ==========================================

  ipcMain.handle('settings:load', async () => {
    const store = getStore();
    return {
      postgres: store.get('postgres'),
      recentFiles: store.get('recentFiles')
    };
  });

  ipcMain.handle('settings:save', async (_, settings: {
    postgres?: PostgresConfig;
  }) => {
    const store = getStore();

    if (settings.postgres) {
      store.set('postgres', settings.postgres);
    }

    return true;
  });

  ipcMain.handle('settings:get-recent-files', async () => {
    const store = getStore();
    return store.get('recentFiles') as string[];
  });

  ipcMain.handle('settings:clear-recent-files', async () => {
    const store = getStore();
    store.set('recentFiles', []);
    return true;
  });

  // ==========================================
  // Migration Handlers
  // ==========================================

  ipcMain.handle('migration:start', async (event, config: MigrationConfig) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) {
      return { success: false, error: 'No window available' };
    }

    // Update tray status
    updateTrayStatus('running');

    // Send initial progress
    const sendProgress = (update: ProgressUpdate) => {
      mainWindow.webContents.send('migration:progress', update);
    };

    try {
      // Phase 1: Extraction
      sendProgress({
        phase: 'extraction',
        status: 'running',
        progress: 0,
        message: 'Extracting backup archive...'
      });

      // Import and run migration
      // In a real implementation, this would use the actual migration engine
      const result = await runMigrationWithProgress(config, sendProgress);

      // Update tray and show notification
      const { target } = getVersionInfo(config.migrationPath);
      if (result.success) {
        updateTrayStatus('success');
        showNotification(
          'Migration Complete',
          `Successfully migrated ${path.basename(config.inputPath)} to Odoo ${target.split('.')[0]}`,
          false
        );
      } else {
        updateTrayStatus('error');
        const errorMsg = result.errors[0]?.message || 'Unknown error';
        showNotification(
          'Migration Failed',
          errorMsg,
          true
        );
      }

      return result;

    } catch (err) {
      updateTrayStatus('error');
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      const { source, target } = getVersionInfo(config.migrationPath);

      showNotification('Migration Failed', errorMessage, true);

      sendProgress({
        phase: 'migration',
        status: 'failed',
        progress: 0,
        message: errorMessage
      });

      return {
        success: false,
        sourceVersion: source,
        targetVersion: target,
        migrationsApplied: [],
        errors: [{ phase: 'migration', message: errorMessage, recoverable: false }],
        warnings: [],
        duration: 0
      };
    }
  });

  ipcMain.handle('migration:cancel', async () => {
    if (activeMigration) {
      activeMigration.cancel();
      activeMigration = null;
      updateTrayStatus('idle');
      return true;
    }
    return false;
  });

  ipcMain.handle('migration:validate-postgres', async (_, config: PostgresConfig) => {
    try {
      // Test PostgreSQL connection
      const { Pool } = await import('pg');
      const pool = new Pool({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: 'postgres',
        connectionTimeoutMillis: 5000
      });

      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      await pool.end();

      return { valid: true, message: 'Connection successful' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      return { valid: false, message };
    }
  });

  // ==========================================
  // System Check Handlers
  // ==========================================

  ipcMain.handle('system:check-postgres', async () => {
    // Embedded PostgreSQL is bundled with the app — always available
    return {
      installed: true,
      running: true,
      port: 0, // Auto-selected at migration time
      message: 'PostgreSQL is built-in and will start automatically during migration.',
      embedded: true
    };
  });

  ipcMain.handle('system:open-url', async (_, url: string) => {
    const { shell } = await import('electron');
    await shell.openExternal(url);
    return true;
  });
}

/**
 * Get version info from migration path
 */
function getVersionInfo(migrationPath: MigrationPath = '16-to-17'): { source: string; target: string } {
  return migrationPath === '16-to-17'
    ? { source: '16.0', target: '17.0' }
    : { source: '17.0', target: '18.0' };
}

/**
 * Run migration with progress callbacks
 * Calls the actual migration engine from src/
 */
async function runMigrationWithProgress(
  config: MigrationConfig,
  sendProgress: (update: ProgressUpdate) => void
): Promise<MigrationResult> {
  const { source, target } = getVersionInfo(config.migrationPath);

  try {
    // Call the actual migration engine with progress callback
    const backendConfig: BackendMigrationConfig = {
      inputPath: config.inputPath,
      outputPath: config.outputPath,
      postgresConfig: config.postgresConfig,
      migrationPath: config.migrationPath,
      keepTemp: config.keepTemp,
      verbose: config.verbose,
      useEmbeddedPostgres: true,
      onProgress: (update) => {
        sendProgress({
          phase: update.phase,
          status: 'running',
          progress: update.progress,
          message: update.message
        });
      }
    };

    // Run the actual migration
    const result = await migrate(backendConfig);

    // Send completion progress
    if (result.success) {
      sendProgress({
        phase: 'export',
        status: 'completed',
        progress: 100,
        message: 'Migration complete!'
      });
    } else {
      sendProgress({
        phase: 'migration',
        status: 'failed',
        progress: 0,
        message: result.errors[0]?.message || 'Migration failed'
      });
    }

    return result;

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';

    sendProgress({
      phase: 'migration',
      status: 'failed',
      progress: 0,
      message: errorMessage
    });

    return {
      success: false,
      sourceVersion: source,
      targetVersion: target,
      migrationsApplied: [],
      errors: [{ phase: 'migration', message: errorMessage, recoverable: false }],
      warnings: [],
      duration: 0
    };
  }
}

/**
 * Add file to recent files list
 */
function addRecentFile(filePath: string): void {
  const store = getStore();
  const recentFiles = store.get('recentFiles') as string[];

  // Remove if already exists
  const filtered = recentFiles.filter(f => f !== filePath);

  // Add to front and limit to 10
  filtered.unshift(filePath);
  const limited = filtered.slice(0, 10);

  store.set('recentFiles', limited);
}
