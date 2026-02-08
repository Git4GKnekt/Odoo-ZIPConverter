/**
 * BETA Timeline - Main React Application
 * Odoo ZIPConverter Desktop UI
 */

import React, { useState, useEffect, useCallback } from 'react';
import FileSelector from './components/FileSelector';
import MigrationProgress from './components/MigrationProgress';
import Settings from './components/Settings';

// Get the Electron API from preload
declare global {
  interface Window {
    electronAPI: {
      openFileDialog: (options?: {
        title?: string;
        filters?: Array<{ name: string; extensions: string[] }>;
        defaultPath?: string;
      }) => Promise<string | null>;
      saveFileDialog: (options?: {
        title?: string;
        filters?: Array<{ name: string; extensions: string[] }>;
        defaultPath?: string;
      }) => Promise<string | null>;
      loadSettings: () => Promise<{
        postgres: PostgresConfig;
        recentFiles: string[];
      }>;
      saveSettings: (settings: { postgres?: PostgresConfig }) => Promise<boolean>;
      startMigration: (config: MigrationConfig) => Promise<MigrationResult>;
      cancelMigration: () => Promise<boolean>;
      validatePostgres: (config: PostgresConfig) => Promise<{ valid: boolean; message: string }>;
      checkPostgresInstalled: () => Promise<{
        installed: boolean;
        running: boolean;
        port: number;
        message: string;
        installUrl: string;
        dockerCommand: string;
      }>;
      openExternalUrl: (url: string) => Promise<boolean>;
      onMigrationProgress: (callback: (update: ProgressUpdate) => void) => () => void;
      onTrayStartMigration: (callback: () => void) => () => void;
      onTrayOpenSettings: (callback: () => void) => () => void;
    };
  }
}

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
  progress: number;
  message: string;
  details?: Record<string, unknown>;
}

type AppView = 'main' | 'settings' | 'progress' | 'result';

const App: React.FC = () => {
  // Application state
  const [view, setView] = useState<AppView>('main');
  const [inputPath, setInputPath] = useState<string>('');
  const [outputPath, setOutputPath] = useState<string>('');
  const [migrationPath, setMigrationPath] = useState<MigrationPath>('16-to-17');
  const [postgresConfig, setPostgresConfig] = useState<PostgresConfig>({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: ''
  });
  const [recentFiles, setRecentFiles] = useState<string[]>([]);

  // Migration state
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [result, setResult] = useState<MigrationResult | null>(null);

  // Validation state
  const [postgresStatus, setPostgresStatus] = useState<{
    checked: boolean;
    valid: boolean;
    message: string;
  }>({ checked: false, valid: false, message: 'Not checked' });
  const [isValidating, setIsValidating] = useState(false);

  // System status
  const [systemStatus, setSystemStatus] = useState<{
    checked: boolean;
    postgresInstalled: boolean;
    postgresRunning: boolean;
    message: string;
    installUrl: string;
    dockerCommand: string;
  }>({
    checked: false,
    postgresInstalled: false,
    postgresRunning: false,
    message: 'Checking system...',
    installUrl: '',
    dockerCommand: ''
  });
  const [showSystemWarning, setShowSystemWarning] = useState(false);

  // Check if migration can start
  const canStartMigration = inputPath && outputPath && postgresStatus.valid && !isRunning;
  const getStartButtonMessage = (): string => {
    if (!inputPath) return 'Select input file';
    if (!outputPath) return 'Select output file';
    if (!postgresStatus.checked) return 'Checking PostgreSQL...';
    if (!postgresStatus.valid) return 'PostgreSQL not connected';
    return 'Start Migration';
  };

  // Validate PostgreSQL connection
  const validatePostgresConnection = useCallback(async () => {
    setIsValidating(true);
    try {
      const result = await window.electronAPI.validatePostgres(postgresConfig);
      setPostgresStatus({
        checked: true,
        valid: result.valid,
        message: result.message
      });
    } catch (err) {
      setPostgresStatus({
        checked: true,
        valid: false,
        message: err instanceof Error ? err.message : 'Connection failed'
      });
    } finally {
      setIsValidating(false);
    }
  }, [postgresConfig]);

  // Check system requirements on mount
  useEffect(() => {
    const checkSystem = async () => {
      try {
        const status = await window.electronAPI.checkPostgresInstalled();
        setSystemStatus({
          checked: true,
          postgresInstalled: status.installed,
          postgresRunning: status.running,
          message: status.message,
          installUrl: status.installUrl,
          dockerCommand: status.dockerCommand
        });

        // Show warning if PostgreSQL is not running
        if (!status.running) {
          setShowSystemWarning(true);
        }
      } catch (err) {
        console.error('Failed to check system:', err);
        setSystemStatus(prev => ({
          ...prev,
          checked: true,
          message: 'Could not check system status'
        }));
      }
    };

    checkSystem();
  }, []);

  // Load settings on mount
  useEffect(() => {
    const loadInitialSettings = async () => {
      try {
        const settings = await window.electronAPI.loadSettings();
        setPostgresConfig(settings.postgres);
        setRecentFiles(settings.recentFiles || []);
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    };

    loadInitialSettings();
  }, []);

  // Validate PostgreSQL when config changes
  useEffect(() => {
    if (postgresConfig.host && postgresConfig.user) {
      setPostgresStatus({ checked: false, valid: false, message: 'Checking...' });
      validatePostgresConnection();
    }
  }, [postgresConfig, validatePostgresConnection]);

  // Register event listeners
  useEffect(() => {
    const unsubProgress = window.electronAPI.onMigrationProgress((update) => {
      setProgress(update);
    });

    const unsubTrayMigration = window.electronAPI.onTrayStartMigration(() => {
      setView('main');
    });

    const unsubTraySettings = window.electronAPI.onTrayOpenSettings(() => {
      setView('settings');
    });

    return () => {
      unsubProgress();
      unsubTrayMigration();
      unsubTraySettings();
    };
  }, []);

  // Get version info based on migration path
  const getVersionInfo = useCallback(() => {
    return migrationPath === '16-to-17'
      ? { source: '16', target: '17' }
      : { source: '17', target: '18' };
  }, [migrationPath]);

  // Handle input file selection
  const handleSelectInput = useCallback(async () => {
    const { source } = getVersionInfo();
    const path = await window.electronAPI.openFileDialog({
      title: `Select Odoo ${source} Backup File`,
      filters: [
        { name: 'ZIP Archives', extensions: ['zip'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (path) {
      setInputPath(path);

      // Auto-suggest output path
      if (!outputPath) {
        const { target } = getVersionInfo();
        const suggestedOutput = path.replace(/\.zip$/i, `-odoo${target}.zip`);
        setOutputPath(suggestedOutput);
      }
    }
  }, [outputPath, getVersionInfo]);

  // Handle output file selection
  const handleSelectOutput = useCallback(async () => {
    const path = await window.electronAPI.saveFileDialog({
      title: 'Save Migrated Backup',
      filters: [{ name: 'ZIP Archives', extensions: ['zip'] }],
      defaultPath: outputPath || 'migrated-backup.zip'
    });

    if (path) {
      setOutputPath(path);
    }
  }, [outputPath]);

  // Handle recent file selection
  const handleRecentFileSelect = useCallback((path: string) => {
    setInputPath(path);
    if (!outputPath) {
      const { target } = getVersionInfo();
      const suggestedOutput = path.replace(/\.zip$/i, `-odoo${target}.zip`);
      setOutputPath(suggestedOutput);
    }
  }, [outputPath, getVersionInfo]);

  // Start migration
  const handleStartMigration = useCallback(async () => {
    if (!inputPath || !outputPath) {
      return;
    }

    setIsRunning(true);
    setResult(null);
    setProgress(null);
    setView('progress');

    const { source, target } = getVersionInfo();

    try {
      const migrationResult = await window.electronAPI.startMigration({
        inputPath,
        outputPath,
        postgresConfig,
        migrationPath
      });

      setResult(migrationResult);
      setView('result');
    } catch (err) {
      console.error('Migration error:', err);
      setResult({
        success: false,
        sourceVersion: `${source}.0`,
        targetVersion: `${target}.0`,
        migrationsApplied: [],
        errors: [{
          phase: 'migration',
          message: err instanceof Error ? err.message : 'Unknown error',
          recoverable: false
        }],
        warnings: [],
        duration: 0
      });
      setView('result');
    } finally {
      setIsRunning(false);
    }
  }, [inputPath, outputPath, postgresConfig, migrationPath, getVersionInfo]);

  // Cancel migration
  const handleCancelMigration = useCallback(async () => {
    await window.electronAPI.cancelMigration();
    setIsRunning(false);
    setView('main');
  }, []);

  // Save settings
  const handleSaveSettings = useCallback(async (newConfig: PostgresConfig) => {
    setPostgresConfig(newConfig);
    await window.electronAPI.saveSettings({ postgres: newConfig });
    setView('main');
  }, []);

  // Reset to main view
  const handleBackToMain = useCallback(() => {
    setView('main');
    setProgress(null);
    setResult(null);
  }, []);

  // Validate PostgreSQL connection
  const handleValidatePostgres = useCallback(async (): Promise<{ valid: boolean; message: string }> => {
    return window.electronAPI.validatePostgres(postgresConfig);
  }, [postgresConfig]);

  // Render current view
  const renderView = () => {
    switch (view) {
      case 'settings':
        return (
          <Settings
            config={postgresConfig}
            onSave={handleSaveSettings}
            onCancel={() => setView('main')}
            onValidate={handleValidatePostgres}
          />
        );

      case 'progress':
        return (
          <MigrationProgress
            progress={progress}
            onCancel={handleCancelMigration}
          />
        );

      case 'result':
        return (
          <div className="result-view">
            <div className={`result-header ${result?.success ? 'success' : 'error'}`}>
              <span className="result-icon">
                {result?.success ? '[OK]' : '[X]'}
              </span>
              <h2>{result?.success ? 'Migration Successful' : 'Migration Failed'}</h2>
            </div>

            {result?.success && (
              <div className="result-details">
                <p>
                  <strong>Migrated:</strong> {result.sourceVersion} to {result.targetVersion}
                </p>
                <p>
                  <strong>Duration:</strong> {(result.duration / 1000).toFixed(1)}s
                </p>
                <p>
                  <strong>Scripts Applied:</strong> {result.migrationsApplied.length}
                </p>
                {result.warnings.length > 0 && (
                  <div className="warnings">
                    <h4>Warnings:</h4>
                    <ul>
                      {result.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="output-path">
                  <strong>Output:</strong> {outputPath}
                </p>
              </div>
            )}

            {!result?.success && (
              <div className="error-details">
                <h4>Errors:</h4>
                <ul>
                  {result?.errors.map((e, i) => (
                    <li key={i}>
                      <span className="error-phase">[{e.phase}]</span> {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="result-actions">
              <button className="btn btn-primary" onClick={handleBackToMain}>
                Back to Main
              </button>
              {result?.success && (
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setInputPath('');
                    setOutputPath('');
                    handleBackToMain();
                  }}
                >
                  New Migration
                </button>
              )}
            </div>
          </div>
        );

      case 'main':
      default:
        const versionInfo = getVersionInfo();
        return (
          <div className="main-view">
            <div className="main-view-scroll">
            <div className="version-selector">
              <h4>Migration Path</h4>
              <div className="version-options">
                <label className={`version-option ${migrationPath === '16-to-17' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="migrationPath"
                    value="16-to-17"
                    checked={migrationPath === '16-to-17'}
                    onChange={() => setMigrationPath('16-to-17')}
                  />
                  <span className="version-label">Odoo 16 → 17</span>
                  <span className="version-scripts">15 scripts</span>
                </label>
                <label className={`version-option ${migrationPath === '17-to-18' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="migrationPath"
                    value="17-to-18"
                    checked={migrationPath === '17-to-18'}
                    onChange={() => setMigrationPath('17-to-18')}
                  />
                  <span className="version-label">Odoo 17 → 18</span>
                  <span className="version-scripts">17 scripts</span>
                </label>
              </div>
            </div>

            {/* System Warning Banner */}
            {showSystemWarning && !systemStatus.postgresRunning && (
              <div className="system-warning">
                <div className="warning-header">
                  <span className="warning-icon">⚠️</span>
                  <strong>PostgreSQL {systemStatus.postgresInstalled ? 'is not running' : 'is not installed'}</strong>
                  <button
                    className="warning-close"
                    onClick={() => setShowSystemWarning(false)}
                    title="Dismiss"
                  >
                    ×
                  </button>
                </div>
                <p className="warning-message">{systemStatus.message}</p>

                {!systemStatus.postgresInstalled && (
                  <div className="warning-actions">
                    <p><strong>Install PostgreSQL:</strong></p>
                    <button
                      className="btn btn-warning"
                      onClick={() => window.electronAPI.openExternalUrl(systemStatus.installUrl)}
                    >
                      Download PostgreSQL
                    </button>
                    <p className="warning-alt">Or use Docker:</p>
                    <code className="docker-command">{systemStatus.dockerCommand}</code>
                  </div>
                )}

                {systemStatus.postgresInstalled && !systemStatus.postgresRunning && (
                  <div className="warning-actions">
                    <p><strong>Start PostgreSQL service:</strong></p>
                    <ol>
                      <li>Press <code>Win + R</code>, type <code>services.msc</code>, press Enter</li>
                      <li>Find "postgresql" in the list</li>
                      <li>Right-click → <strong>Start</strong></li>
                    </ol>
                    <button
                      className="btn btn-warning"
                      onClick={async () => {
                        const status = await window.electronAPI.checkPostgresInstalled();
                        setSystemStatus({
                          checked: true,
                          postgresInstalled: status.installed,
                          postgresRunning: status.running,
                          message: status.message,
                          installUrl: status.installUrl,
                          dockerCommand: status.dockerCommand
                        });
                        if (status.running) {
                          setShowSystemWarning(false);
                          validatePostgresConnection();
                        }
                      }}
                    >
                      Check Again
                    </button>
                  </div>
                )}
              </div>
            )}

            <FileSelector
              inputPath={inputPath}
              outputPath={outputPath}
              recentFiles={recentFiles}
              onSelectInput={handleSelectInput}
              onSelectOutput={handleSelectOutput}
              onRecentSelect={handleRecentFileSelect}
              onInputChange={setInputPath}
              onOutputChange={setOutputPath}
            />

            <div className="status-panel">
              <div className={`status-item ${postgresStatus.valid ? 'valid' : 'invalid'}`}>
                <span className="status-icon">
                  {isValidating ? '⏳' : postgresStatus.valid ? '✓' : '✗'}
                </span>
                <span className="status-label">PostgreSQL:</span>
                <span className="status-message">
                  {isValidating ? 'Checking connection...' : postgresStatus.message}
                </span>
                <button
                  className="btn btn-small"
                  onClick={validatePostgresConnection}
                  disabled={isValidating}
                >
                  Test
                </button>
              </div>
            </div>

            <div className="actions">
              <button
                className="btn btn-primary btn-large"
                onClick={handleStartMigration}
                disabled={!canStartMigration}
                title={!canStartMigration ? getStartButtonMessage() : ''}
              >
                {canStartMigration
                  ? `Start Migration (${versionInfo.source} → ${versionInfo.target})`
                  : getStartButtonMessage()
                }
              </button>

              <button
                className="btn btn-secondary"
                onClick={() => setView('settings')}
              >
                Settings
              </button>
            </div>

            <div className="info-panel">
              <h4>Migration Info</h4>
              <p>This tool migrates Odoo backup files between versions.</p>
              <ul>
                <li>Select migration path (16→17 or 17→18)</li>
                <li>Select your Odoo {versionInfo.source} backup ZIP file</li>
                <li>Choose where to save the migrated backup</li>
                <li>Ensure PostgreSQL is running and configured in Settings</li>
              </ul>
            </div>
            </div>{/* End main-view-scroll */}
          </div>
        );
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Odoo ZIPConverter</h1>
        <span className="version">v2.0.0</span>
      </header>

      <main className="app-content">
        {renderView()}
      </main>

      <footer className="app-footer">
        <span>Odoo Backup Migration Tool (16→17, 17→18)</span>
      </footer>

      <style>{`
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        .app {
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
          background: #f5f5f5;
          color: #333;
        }

        .app-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 24px;
          background: linear-gradient(135deg, #714B67 0%, #875A7B 100%);
          color: white;
          -webkit-app-region: drag;
        }

        .app-header h1 {
          font-size: 20px;
          font-weight: 600;
        }

        .version {
          font-size: 12px;
          opacity: 0.8;
        }

        .app-content {
          flex: 1;
          padding: 24px;
          overflow-y: auto;
        }

        .app-footer {
          padding: 12px 24px;
          background: #e0e0e0;
          font-size: 12px;
          color: #666;
          text-align: center;
        }

        .btn {
          padding: 10px 20px;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-primary {
          background: #714B67;
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background: #5a3c52;
        }

        .btn-secondary {
          background: #e0e0e0;
          color: #333;
        }

        .btn-secondary:hover:not(:disabled) {
          background: #d0d0d0;
        }

        .btn-large {
          padding: 14px 32px;
          font-size: 16px;
        }

        .btn-small {
          padding: 4px 12px;
          font-size: 12px;
        }

        .btn-warning {
          background: #f0ad4e;
          color: #333;
          border: none;
        }

        .btn-warning:hover {
          background: #ec971f;
        }

        .system-warning {
          background: #fff3cd;
          border: 1px solid #ffc107;
          border-radius: 8px;
          padding: 16px;
        }

        .warning-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }

        .warning-icon {
          font-size: 20px;
        }

        .warning-close {
          margin-left: auto;
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #856404;
          padding: 0 4px;
          line-height: 1;
        }

        .warning-close:hover {
          color: #533f03;
        }

        .warning-message {
          color: #856404;
          margin-bottom: 12px;
        }

        .warning-actions {
          background: rgba(255,255,255,0.5);
          border-radius: 6px;
          padding: 12px;
        }

        .warning-actions p {
          margin: 0 0 8px 0;
          color: #333;
        }

        .warning-actions ol {
          margin: 8px 0;
          padding-left: 20px;
          color: #555;
        }

        .warning-actions li {
          margin: 4px 0;
        }

        .warning-actions code {
          background: #e9ecef;
          padding: 2px 6px;
          border-radius: 3px;
          font-family: 'Consolas', monospace;
          font-size: 12px;
        }

        .warning-alt {
          margin-top: 12px !important;
          color: #666 !important;
          font-size: 13px;
        }

        .docker-command {
          display: block;
          background: #2d2d2d;
          color: #f8f8f2;
          padding: 10px 12px;
          border-radius: 4px;
          font-family: 'Consolas', monospace;
          font-size: 11px;
          overflow-x: auto;
          white-space: nowrap;
          margin-top: 8px;
        }

        .status-panel {
          background: white;
          border-radius: 8px;
          padding: 12px 16px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .status-item {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .status-item.valid .status-icon {
          color: #28a745;
        }

        .status-item.invalid .status-icon {
          color: #dc3545;
        }

        .status-icon {
          font-size: 16px;
          width: 20px;
        }

        .status-label {
          font-weight: 600;
          color: #333;
        }

        .status-message {
          flex: 1;
          color: #666;
          font-size: 13px;
        }

        .main-view {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .main-view-scroll {
          display: contents;
        }

        .main-view-scroll::-webkit-scrollbar {
          width: 8px;
        }

        .main-view-scroll::-webkit-scrollbar-track {
          background: #f0f0f0;
          border-radius: 4px;
        }

        .main-view-scroll::-webkit-scrollbar-thumb {
          background: #ccc;
          border-radius: 4px;
        }

        .main-view-scroll::-webkit-scrollbar-thumb:hover {
          background: #aaa;
        }

        .actions {
          display: flex;
          gap: 12px;
          justify-content: center;
        }

        .info-panel {
          background: white;
          border-radius: 8px;
          padding: 16px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .info-panel h4 {
          margin-bottom: 8px;
          color: #714B67;
        }

        .info-panel ul {
          margin-left: 20px;
          margin-top: 8px;
        }

        .info-panel li {
          margin: 4px 0;
          color: #666;
        }

        .version-selector {
          background: white;
          border-radius: 8px;
          padding: 16px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .version-selector h4 {
          margin-bottom: 12px;
          color: #714B67;
        }

        .version-options {
          display: flex;
          gap: 12px;
        }

        .version-option {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 16px;
          border: 2px solid #e0e0e0;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .version-option:hover {
          border-color: #714B67;
        }

        .version-option.selected {
          border-color: #714B67;
          background: #f9f5f8;
        }

        .version-option input {
          display: none;
        }

        .version-label {
          font-weight: 600;
          font-size: 16px;
          color: #333;
        }

        .version-scripts {
          font-size: 12px;
          color: #666;
          margin-top: 4px;
        }

        .result-view {
          background: white;
          border-radius: 8px;
          padding: 24px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .result-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 20px;
          padding-bottom: 16px;
          border-bottom: 1px solid #eee;
        }

        .result-header.success .result-icon {
          color: #28a745;
          font-size: 24px;
        }

        .result-header.error .result-icon {
          color: #dc3545;
          font-size: 24px;
        }

        .result-details p {
          margin: 8px 0;
        }

        .output-path {
          margin-top: 16px;
          padding: 12px;
          background: #f0f0f0;
          border-radius: 4px;
          word-break: break-all;
        }

        .error-details {
          background: #fff5f5;
          border: 1px solid #ffcccc;
          border-radius: 4px;
          padding: 16px;
          margin-bottom: 20px;
        }

        .error-details h4 {
          color: #dc3545;
          margin-bottom: 8px;
        }

        .error-details li {
          margin: 4px 0;
        }

        .error-phase {
          color: #666;
          font-size: 12px;
        }

        .warnings {
          background: #fff9e6;
          border: 1px solid #ffe066;
          border-radius: 4px;
          padding: 12px;
          margin: 16px 0;
        }

        .warnings h4 {
          color: #856404;
          margin-bottom: 8px;
        }

        .result-actions {
          display: flex;
          gap: 12px;
          margin-top: 24px;
        }
      `}</style>
    </div>
  );
};

export default App;
