/**
 * BETA Timeline - Settings Component
 * PostgreSQL configuration with validation and persistence
 */

import React, { useState, useCallback } from 'react';

interface PostgresConfig {
  host: string;
  port: number;
  user: string;
  password: string;
}

interface SettingsProps {
  config: PostgresConfig;
  onSave: (config: PostgresConfig) => void;
  onCancel: () => void;
  onValidate: () => Promise<{ valid: boolean; message: string }>;
}

const Settings: React.FC<SettingsProps> = ({
  config,
  onSave,
  onCancel,
  onValidate
}) => {
  // Local state for form editing
  const [formData, setFormData] = useState<PostgresConfig>({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password
  });

  const [showPassword, setShowPassword] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    message: string;
  } | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof PostgresConfig, string>>>({});

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof PostgresConfig, string>> = {};

    if (!formData.host.trim()) {
      newErrors.host = 'Host is required';
    }

    if (!formData.port || formData.port < 1 || formData.port > 65535) {
      newErrors.port = 'Port must be between 1 and 65535';
    }

    if (!formData.user.trim()) {
      newErrors.user = 'Username is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle input change
  const handleChange = (field: keyof PostgresConfig, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }

    // Clear validation result when form changes
    setValidationResult(null);
  };

  // Handle test connection
  const handleTestConnection = useCallback(async () => {
    if (!validateForm()) return;

    setValidating(true);
    setValidationResult(null);

    try {
      const result = await onValidate();
      setValidationResult(result);
    } catch (err) {
      setValidationResult({
        valid: false,
        message: err instanceof Error ? err.message : 'Connection test failed'
      });
    } finally {
      setValidating(false);
    }
  }, [onValidate]);

  // Handle save
  const handleSave = () => {
    if (validateForm()) {
      onSave(formData);
    }
  };

  // Handle reset to defaults
  const handleReset = () => {
    setFormData({
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      password: ''
    });
    setValidationResult(null);
    setErrors({});
  };

  return (
    <div className="settings">
      <div className="settings-header">
        <h2>PostgreSQL Settings</h2>
        <p className="settings-subtitle">
          Configure the PostgreSQL connection for migration operations
        </p>
      </div>

      <form className="settings-form" onSubmit={(e) => e.preventDefault()}>
        {/* Host */}
        <div className={`form-group ${errors.host ? 'has-error' : ''}`}>
          <label htmlFor="pg-host">Host</label>
          <input
            id="pg-host"
            type="text"
            value={formData.host}
            onChange={(e) => handleChange('host', e.target.value)}
            placeholder="localhost"
          />
          {errors.host && <span className="error-message">{errors.host}</span>}
        </div>

        {/* Port */}
        <div className={`form-group ${errors.port ? 'has-error' : ''}`}>
          <label htmlFor="pg-port">Port</label>
          <input
            id="pg-port"
            type="number"
            value={formData.port}
            onChange={(e) => handleChange('port', parseInt(e.target.value, 10) || 0)}
            placeholder="5432"
            min="1"
            max="65535"
          />
          {errors.port && <span className="error-message">{errors.port}</span>}
        </div>

        {/* Username */}
        <div className={`form-group ${errors.user ? 'has-error' : ''}`}>
          <label htmlFor="pg-user">Username</label>
          <input
            id="pg-user"
            type="text"
            value={formData.user}
            onChange={(e) => handleChange('user', e.target.value)}
            placeholder="postgres"
          />
          {errors.user && <span className="error-message">{errors.user}</span>}
        </div>

        {/* Password */}
        <div className="form-group">
          <label htmlFor="pg-password">Password</label>
          <div className="password-input">
            <input
              id="pg-password"
              type={showPassword ? 'text' : 'password'}
              value={formData.password}
              onChange={(e) => handleChange('password', e.target.value)}
              placeholder="Enter password"
            />
            <button
              type="button"
              className="toggle-password"
              onClick={() => setShowPassword(!showPassword)}
              title={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? '[HIDE]' : '[SHOW]'}
            </button>
          </div>
          <span className="help-text">Password is encrypted when saved</span>
        </div>

        {/* Test Connection */}
        <div className="form-group test-connection">
          <button
            type="button"
            className="btn btn-test"
            onClick={handleTestConnection}
            disabled={validating}
          >
            {validating ? 'Testing...' : 'Test Connection'}
          </button>

          {validationResult && (
            <div className={`validation-result ${validationResult.valid ? 'success' : 'error'}`}>
              <span className="result-icon">
                {validationResult.valid ? '[OK]' : '[X]'}
              </span>
              <span className="result-message">{validationResult.message}</span>
            </div>
          )}
        </div>
      </form>

      {/* Help Panel */}
      <div className="settings-help">
        <h4>Where to find your PostgreSQL credentials?</h4>
        <div className="help-content">
          <p><strong>Default values:</strong></p>
          <ul>
            <li><strong>Host:</strong> localhost (if PostgreSQL runs locally)</li>
            <li><strong>Port:</strong> 5432 (standard PostgreSQL port)</li>
            <li><strong>Username:</strong> postgres (default admin user)</li>
            <li><strong>Password:</strong> Set during PostgreSQL installation</li>
          </ul>

          <p><strong>If you forgot your password:</strong></p>
          <ul>
            <li>Check pgAdmin if installed (right-click server → Properties)</li>
            <li>Windows: Search "Services", find PostgreSQL, note the user</li>
            <li>Reset via pg_hba.conf (change auth to "trust" temporarily)</li>
          </ul>

          <p><strong>Check if PostgreSQL is running:</strong></p>
          <code>netstat -ano | findstr :5432</code>
        </div>
      </div>

      {/* Requirements Panel */}
      <div className="settings-info">
        <h4>Requirements</h4>
        <ul>
          <li>PostgreSQL 14 or higher recommended</li>
          <li>User must have CREATE DATABASE permission</li>
          <li>Sufficient disk space for temporary database</li>
        </ul>
      </div>

      {/* Actions */}
      <div className="settings-actions">
        <button className="btn btn-secondary" onClick={handleReset}>
          Reset to Defaults
        </button>
        <div className="action-buttons">
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            Save Settings
          </button>
        </div>
      </div>

      <style>{`
        .settings {
          background: white;
          border-radius: 8px;
          padding: 24px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .settings-header {
          margin-bottom: 24px;
          padding-bottom: 16px;
          border-bottom: 1px solid #eee;
        }

        .settings-header h2 {
          margin-bottom: 4px;
        }

        .settings-subtitle {
          color: #666;
          font-size: 14px;
        }

        .settings-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-bottom: 24px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-group label {
          font-weight: 500;
          font-size: 14px;
          color: #333;
        }

        .form-group input {
          padding: 10px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
        }

        .form-group input:focus {
          outline: none;
          border-color: #714B67;
        }

        .form-group.has-error input {
          border-color: #dc3545;
        }

        .error-message {
          font-size: 12px;
          color: #dc3545;
        }

        .help-text {
          font-size: 12px;
          color: #666;
        }

        .password-input {
          display: flex;
          gap: 8px;
        }

        .password-input input {
          flex: 1;
        }

        .toggle-password {
          padding: 10px 12px;
          background: #f0f0f0;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-family: 'Courier New', monospace;
          font-size: 11px;
          cursor: pointer;
          color: #666;
        }

        .toggle-password:hover {
          background: #e0e0e0;
        }

        .test-connection {
          padding-top: 8px;
        }

        .btn-test {
          padding: 10px 20px;
          background: #f0f0f0;
          border: 1px solid #ddd;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }

        .btn-test:hover:not(:disabled) {
          background: #e0e0e0;
        }

        .btn-test:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .validation-result {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 12px;
          padding: 10px 12px;
          border-radius: 4px;
        }

        .validation-result.success {
          background: #f0fff0;
          border: 1px solid #28a745;
        }

        .validation-result.error {
          background: #fff5f5;
          border: 1px solid #dc3545;
        }

        .result-icon {
          font-family: 'Courier New', monospace;
          font-size: 12px;
        }

        .validation-result.success .result-icon {
          color: #28a745;
        }

        .validation-result.error .result-icon {
          color: #dc3545;
        }

        .result-message {
          font-size: 13px;
        }

        .settings-help {
          background: #f0f7ff;
          border: 1px solid #b8d4f0;
          border-radius: 6px;
          padding: 16px;
          margin-bottom: 16px;
        }

        .settings-help h4 {
          margin-bottom: 12px;
          font-size: 14px;
          color: #1a5a96;
        }

        .help-content p {
          margin: 12px 0 6px 0;
          font-size: 13px;
          color: #333;
        }

        .help-content p:first-child {
          margin-top: 0;
        }

        .help-content ul {
          margin: 0;
          padding-left: 20px;
        }

        .help-content li {
          font-size: 13px;
          color: #555;
          margin: 4px 0;
        }

        .help-content code {
          display: inline-block;
          background: #e8e8e8;
          padding: 4px 8px;
          border-radius: 4px;
          font-family: 'Consolas', 'Courier New', monospace;
          font-size: 12px;
          color: #333;
          margin-top: 4px;
        }

        .settings-info {
          background: #f5f5f5;
          border-radius: 6px;
          padding: 16px;
          margin-bottom: 24px;
        }

        .settings-info h4 {
          margin-bottom: 8px;
          font-size: 14px;
          color: #666;
        }

        .settings-info ul {
          margin: 0;
          padding-left: 20px;
        }

        .settings-info li {
          font-size: 13px;
          color: #666;
          margin: 4px 0;
        }

        .settings-actions {
          display: flex;
          justify-content: space-between;
          padding-top: 16px;
          border-top: 1px solid #eee;
        }

        .action-buttons {
          display: flex;
          gap: 8px;
        }

        .btn {
          padding: 10px 20px;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-primary {
          background: #714B67;
          color: white;
          border: none;
        }

        .btn-primary:hover {
          background: #5a3c52;
        }

        .btn-secondary {
          background: white;
          color: #333;
          border: 1px solid #ddd;
        }

        .btn-secondary:hover {
          background: #f5f5f5;
        }
      `}</style>
    </div>
  );
};

export default Settings;
