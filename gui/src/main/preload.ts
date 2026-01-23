/**
 * BETA Timeline - Preload Script
 * Secure bridge between main process and renderer
 */

import { contextBridge, ipcRenderer } from 'electron';

// Define the API exposed to the renderer
const electronAPI = {
  // ==========================================
  // File Dialogs
  // ==========================================
  openFileDialog: (options?: {
    title?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
    defaultPath?: string;
  }): Promise<string | null> => {
    return ipcRenderer.invoke('dialog:open-file', options);
  },

  saveFileDialog: (options?: {
    title?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
    defaultPath?: string;
  }): Promise<string | null> => {
    return ipcRenderer.invoke('dialog:save-file', options);
  },

  // ==========================================
  // Settings
  // ==========================================
  loadSettings: (): Promise<{
    postgres: {
      host: string;
      port: number;
      user: string;
      password: string;
    };
    recentFiles: string[];
  }> => {
    return ipcRenderer.invoke('settings:load');
  },

  saveSettings: (settings: {
    postgres?: {
      host: string;
      port: number;
      user: string;
      password: string;
    };
  }): Promise<boolean> => {
    return ipcRenderer.invoke('settings:save', settings);
  },

  getRecentFiles: (): Promise<string[]> => {
    return ipcRenderer.invoke('settings:get-recent-files');
  },

  clearRecentFiles: (): Promise<boolean> => {
    return ipcRenderer.invoke('settings:clear-recent-files');
  },

  // ==========================================
  // Migration
  // ==========================================
  startMigration: (config: {
    inputPath: string;
    outputPath: string;
    postgresConfig: {
      host: string;
      port: number;
      user: string;
      password: string;
    };
    keepTemp?: boolean;
    verbose?: boolean;
  }): Promise<{
    success: boolean;
    sourceVersion: string;
    targetVersion: string;
    migrationsApplied: string[];
    errors: Array<{ phase: string; message: string; recoverable: boolean }>;
    warnings: string[];
    duration: number;
  }> => {
    return ipcRenderer.invoke('migration:start', config);
  },

  cancelMigration: (): Promise<boolean> => {
    return ipcRenderer.invoke('migration:cancel');
  },

  validatePostgres: (config: {
    host: string;
    port: number;
    user: string;
    password: string;
  }): Promise<{ valid: boolean; message: string }> => {
    return ipcRenderer.invoke('migration:validate-postgres', config);
  },

  // ==========================================
  // Event Listeners
  // ==========================================
  onMigrationProgress: (callback: (update: {
    phase: 'extraction' | 'database' | 'migration' | 'export';
    status: 'pending' | 'running' | 'completed' | 'failed';
    progress: number;
    message: string;
    details?: Record<string, unknown>;
  }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, update: unknown) => {
      callback(update as Parameters<typeof callback>[0]);
    };
    ipcRenderer.on('migration:progress', handler);

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener('migration:progress', handler);
    };
  },

  onTrayStartMigration: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on('tray:start-migration', handler);
    return () => {
      ipcRenderer.removeListener('tray:start-migration', handler);
    };
  },

  onTrayOpenSettings: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on('tray:open-settings', handler);
    return () => {
      ipcRenderer.removeListener('tray:open-settings', handler);
    };
  }
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Type declaration for renderer process
export type ElectronAPI = typeof electronAPI;
