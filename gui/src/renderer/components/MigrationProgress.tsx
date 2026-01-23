/**
 * BETA Timeline - Migration Progress Component
 * Phase-based progress indicator with detailed status
 */

import React from 'react';

interface ProgressUpdate {
  phase: 'extraction' | 'database' | 'migration' | 'export';
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  message: string;
  details?: Record<string, unknown>;
}

interface MigrationProgressProps {
  progress: ProgressUpdate | null;
  onCancel: () => void;
}

interface PhaseInfo {
  id: ProgressUpdate['phase'];
  label: string;
  icon: string;
  description: string;
}

const phases: PhaseInfo[] = [
  {
    id: 'extraction',
    label: 'Extraction',
    icon: '[1]',
    description: 'Extracting backup archive to temp directory'
  },
  {
    id: 'database',
    label: 'Database Setup',
    icon: '[2]',
    description: 'Creating temp database and loading SQL dump'
  },
  {
    id: 'migration',
    label: 'Migration',
    icon: '[3]',
    description: 'Running Odoo 16 to 17 migration scripts'
  },
  {
    id: 'export',
    label: 'Export',
    icon: '[4]',
    description: 'Exporting database and creating new ZIP'
  }
];

const MigrationProgress: React.FC<MigrationProgressProps> = ({
  progress,
  onCancel
}) => {
  // Get status for a specific phase
  const getPhaseStatus = (phaseId: ProgressUpdate['phase']): ProgressUpdate['status'] => {
    if (!progress) return 'pending';

    const currentIndex = phases.findIndex(p => p.id === progress.phase);
    const phaseIndex = phases.findIndex(p => p.id === phaseId);

    if (phaseIndex < currentIndex) return 'completed';
    if (phaseIndex > currentIndex) return 'pending';

    return progress.status;
  };

  // Get status icon
  const getStatusIcon = (status: ProgressUpdate['status']): string => {
    switch (status) {
      case 'completed': return '[OK]';
      case 'running': return '[>>]';
      case 'failed': return '[X]';
      default: return '[ ]';
    }
  };

  // Get status color class
  const getStatusClass = (status: ProgressUpdate['status']): string => {
    switch (status) {
      case 'completed': return 'status-completed';
      case 'running': return 'status-running';
      case 'failed': return 'status-failed';
      default: return 'status-pending';
    }
  };

  return (
    <div className="migration-progress">
      <h2>Migration in Progress</h2>

      {/* Overall Progress Bar */}
      <div className="overall-progress">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${progress?.progress || 0}%` }}
          />
        </div>
        <span className="progress-percent">{progress?.progress || 0}%</span>
      </div>

      {/* Current Status Message */}
      <div className="current-status">
        <span className="status-message">{progress?.message || 'Initializing...'}</span>
      </div>

      {/* Phase List */}
      <div className="phases-list">
        {phases.map((phase) => {
          const status = getPhaseStatus(phase.id);
          const isActive = progress?.phase === phase.id;

          return (
            <div
              key={phase.id}
              className={`phase-item ${getStatusClass(status)} ${isActive ? 'active' : ''}`}
            >
              <div className="phase-header">
                <span className="phase-icon">{phase.icon}</span>
                <span className="phase-label">{phase.label}</span>
                <span className="phase-status">{getStatusIcon(status)}</span>
              </div>

              <div className="phase-description">
                {phase.description}
              </div>

              {/* Show spinner for running phase */}
              {status === 'running' && (
                <div className="phase-spinner">
                  <div className="spinner" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Details Panel */}
      {progress?.details && Object.keys(progress.details).length > 0 && (
        <div className="details-panel">
          <h4>Details</h4>
          <pre>{JSON.stringify(progress.details, null, 2)}</pre>
        </div>
      )}

      {/* Cancel Button */}
      <div className="progress-actions">
        <button
          className="btn btn-cancel"
          onClick={onCancel}
        >
          Cancel Migration
        </button>
      </div>

      <style>{`
        .migration-progress {
          background: white;
          border-radius: 8px;
          padding: 24px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .migration-progress h2 {
          margin-bottom: 20px;
          color: #333;
        }

        .overall-progress {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
        }

        .progress-bar {
          flex: 1;
          height: 8px;
          background: #e0e0e0;
          border-radius: 4px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #714B67 0%, #875A7B 100%);
          border-radius: 4px;
          transition: width 0.3s ease;
        }

        .progress-percent {
          font-size: 14px;
          font-weight: 600;
          color: #714B67;
          min-width: 40px;
        }

        .current-status {
          padding: 12px;
          background: #f5f5f5;
          border-radius: 4px;
          margin-bottom: 20px;
        }

        .status-message {
          font-size: 14px;
          color: #666;
        }

        .phases-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 20px;
        }

        .phase-item {
          padding: 12px 16px;
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          transition: all 0.3s;
        }

        .phase-item.active {
          border-color: #714B67;
          background: #faf8f9;
        }

        .phase-item.status-completed {
          border-color: #28a745;
          background: #f0fff0;
        }

        .phase-item.status-failed {
          border-color: #dc3545;
          background: #fff5f5;
        }

        .phase-header {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .phase-icon {
          font-family: 'Courier New', monospace;
          font-size: 12px;
          color: #714B67;
          font-weight: bold;
        }

        .phase-label {
          font-weight: 600;
          flex: 1;
        }

        .phase-status {
          font-family: 'Courier New', monospace;
          font-size: 12px;
        }

        .status-completed .phase-status {
          color: #28a745;
        }

        .status-running .phase-status {
          color: #714B67;
        }

        .status-failed .phase-status {
          color: #dc3545;
        }

        .status-pending .phase-status {
          color: #999;
        }

        .phase-description {
          font-size: 12px;
          color: #666;
          margin-top: 4px;
          margin-left: 30px;
        }

        .phase-spinner {
          display: flex;
          justify-content: flex-end;
          margin-top: 8px;
        }

        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid #e0e0e0;
          border-top-color: #714B67;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .details-panel {
          background: #f5f5f5;
          border-radius: 4px;
          padding: 12px;
          margin-bottom: 20px;
        }

        .details-panel h4 {
          margin-bottom: 8px;
          font-size: 12px;
          color: #666;
        }

        .details-panel pre {
          font-size: 11px;
          margin: 0;
          overflow-x: auto;
        }

        .progress-actions {
          display: flex;
          justify-content: center;
        }

        .btn-cancel {
          padding: 10px 24px;
          background: #f0f0f0;
          color: #666;
          border: 1px solid #ddd;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-cancel:hover {
          background: #e0e0e0;
          color: #333;
        }
      `}</style>
    </div>
  );
};

export default MigrationProgress;
