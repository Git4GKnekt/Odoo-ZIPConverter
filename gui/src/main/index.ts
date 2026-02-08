/**
 * BETA Timeline - Electron Main Process
 * Odoo ZIPConverter Desktop Application
 */

import { app, BrowserWindow, Tray, Menu, nativeImage, Notification } from 'electron';
import * as path from 'path';
import Store from 'electron-store';
import { registerIpcHandlers } from './ipc-handlers';

// Store schema type
interface StoreSchema {
  postgres: {
    host: string;
    port: number;
    user: string;
    password: string;
  };
  recentFiles: string[];
  windowBounds: { width: number; height: number };
}

// Settings store with encryption for sensitive data
const store = new Store<StoreSchema>({
  name: 'odoo-zipconverter-settings',
  encryptionKey: 'odoo-zipconverter-v1',
  defaults: {
    postgres: {
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      password: ''
    },
    recentFiles: [],
    windowBounds: { width: 900, height: 700 }
  }
});

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

/**
 * Create the main application window
 */
function createWindow(): void {
  const bounds = store.get('windowBounds') as { width: number; height: number };

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: 600,
    minHeight: 500,
    title: 'Odoo ZIPConverter',
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    show: false // Show after ready-to-show event
  });

  // Load the renderer
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Save window bounds on resize
  mainWindow.on('resize', () => {
    if (mainWindow && !mainWindow.isMaximized()) {
      const [width, height] = mainWindow.getSize();
      store.set('windowBounds', { width, height });
    }
  });

  // Minimize to tray instead of closing (only if tray exists)
  mainWindow.on('close', (event) => {
    if (!isQuitting && tray) {
      event.preventDefault();
      mainWindow?.hide();
      showTrayNotification('Odoo ZIPConverter', 'Application minimized to system tray');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Create system tray with context menu
 */
function createTray(): void {
  const iconPath = getIconPath();
  const icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    console.warn('Tray icon not found at', iconPath, '- skipping tray creation');
    return;
  }
  tray = new Tray(icon.resize({ width: 16, height: 16 }));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Odoo ZIPConverter',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      }
    },
    {
      label: 'Start Migration...',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
        mainWindow?.webContents.send('tray:start-migration');
      }
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
        mainWindow?.webContents.send('tray:open-settings');
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Odoo ZIPConverter');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

/**
 * Get platform-appropriate icon path
 */
function getIconPath(): string {
  const iconName = process.platform === 'win32' ? 'icon.ico' : 'icon.png';

  // In development, use assets folder
  if (process.env.NODE_ENV === 'development') {
    return path.join(__dirname, '../../assets', iconName);
  }

  // In production, use resources folder
  return path.join(process.resourcesPath, 'assets', iconName);
}

/**
 * Show a native notification
 */
export function showNotification(title: string, body: string, isError = false): void {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title,
      body,
      icon: getIconPath(),
      urgency: isError ? 'critical' : 'normal'
    });
    notification.show();
  }
}

/**
 * Show tray balloon notification (Windows) or notification
 */
function showTrayNotification(title: string, body: string): void {
  if (process.platform === 'win32' && tray) {
    tray.displayBalloon({
      title,
      content: body,
      iconType: 'info'
    });
  } else {
    showNotification(title, body);
  }
}

/**
 * Update tray icon to indicate migration status
 */
export function updateTrayStatus(status: 'idle' | 'running' | 'success' | 'error'): void {
  if (!tray) return;

  const statusMessages: Record<string, string> = {
    idle: 'Odoo ZIPConverter',
    running: 'Odoo ZIPConverter - Migration in progress...',
    success: 'Odoo ZIPConverter - Migration completed',
    error: 'Odoo ZIPConverter - Migration failed'
  };

  tray.setToolTip(statusMessages[status]);
}

/**
 * Get the settings store for IPC handlers
 */
export function getStore(): Store<StoreSchema> {
  return store;
}

/**
 * Get main window for IPC handlers
 */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

// App lifecycle events
app.whenReady().then(() => {
  createWindow();
  createTray();
  registerIpcHandlers();

  app.on('activate', () => {
    // macOS: re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Don't quit on macOS (stay in menu bar)
  if (process.platform !== 'darwin') {
    // Keep running in tray
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

// Handle second instance (single instance lock)
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Focus existing window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}
