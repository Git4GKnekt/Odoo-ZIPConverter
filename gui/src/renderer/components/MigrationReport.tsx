/**
 * BETA Timeline - Migration Report Component
 * Detailed view of migration results with phase timing,
 * database statistics, and per-script results.
 */

import React, { useState } from 'react';

interface ScriptResult {
  id: string;
  name: string;
  description: string;
  status: 'applied' | 'skipped' | 'failed';
  durationMs: number;
  error?: string;
}

interface PhaseTiming {
  extraction: number;
  database: number;
  migration: number;
  export: number;
}

interface PostMigrationStats {
  tableCount: number;
  moduleCount: number;
  installedModuleCount: number;
  partnerCount: number;
  userCount: number;
}

interface MigrationReport {
  phaseTimings: PhaseTiming;
  scriptResults: ScriptResult[];
  stats: PostMigrationStats;
  importWarnings: string[];
  reportFilePath?: string;
}

interface MigrationReportProps {
  report: MigrationReport;
  totalDuration?: number;
  onOpenReport?: () => void;
}

const fmt = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

const MigrationReportView: React.FC<MigrationReportProps> = ({
  report,
  onOpenReport
}) => {
  const [showScripts, setShowScripts] = useState(false);
  const [showWarnings, setShowWarnings] = useState(false);

  const pt = report.phaseTimings;
  const s = report.stats;
  const sr = report.scriptResults;
  const applied = sr.filter(r => r.status === 'applied').length;
  const skipped = sr.filter(r => r.status === 'skipped').length;
  const failed = sr.filter(r => r.status === 'failed').length;

  // Find the longest phase for bar scaling
  const maxPhase = Math.max(pt.extraction, pt.database, pt.migration, pt.export, 1);

  const phaseItems = [
    { label: 'Extraction', value: pt.extraction, color: '#714B67' },
    { label: 'Database Setup', value: pt.database, color: '#875A7B' },
    { label: 'Migration', value: pt.migration, color: '#5a3c52' },
    { label: 'Export', value: pt.export, color: '#9b6d8e' },
  ];

  return (
    <div className="migration-report">
      {/* Phase Timing */}
      <div className="report-section">
        <h4 className="section-title">Phase Timing</h4>
        <div className="phase-bars">
          {phaseItems.map((phase) => (
            <div key={phase.label} className="phase-bar-row">
              <span className="phase-bar-label">{phase.label}</span>
              <div className="phase-bar-track">
                <div
                  className="phase-bar-fill"
                  style={{
                    width: `${Math.max((phase.value / maxPhase) * 100, 2)}%`,
                    background: phase.color
                  }}
                />
              </div>
              <span className="phase-bar-time">{fmt(phase.value)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Database Statistics */}
      <div className="report-section">
        <h4 className="section-title">Database Statistics</h4>
        <div className="stats-grid">
          <div className="stat-item">
            <span className="stat-value">{s.tableCount}</span>
            <span className="stat-label">Tables</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{s.installedModuleCount}</span>
            <span className="stat-label">Installed Modules</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{s.partnerCount.toLocaleString()}</span>
            <span className="stat-label">Partners</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{s.userCount}</span>
            <span className="stat-label">Users</span>
          </div>
        </div>
        <div className="stats-footnote">
          {s.moduleCount} total modules ({s.installedModuleCount} installed)
        </div>
      </div>

      {/* Script Results */}
      <div className="report-section">
        <button
          className="section-toggle"
          onClick={() => setShowScripts(!showScripts)}
        >
          <h4 className="section-title">
            Migration Scripts ({applied}/{sr.length})
            {skipped > 0 && <span className="script-count-skip"> | {skipped} skipped</span>}
            {failed > 0 && <span className="script-count-fail"> | {failed} failed</span>}
          </h4>
          <span className="toggle-arrow">{showScripts ? '[-]' : '[+]'}</span>
        </button>

        {showScripts && (
          <div className="script-list">
            {sr.map((script) => (
              <div key={script.id} className={`script-item script-${script.status}`}>
                <span className="script-status-tag">
                  {script.status === 'applied' ? '[OK]' : script.status === 'skipped' ? '[SKIP]' : '[FAIL]'}
                </span>
                <div className="script-info">
                  <span className="script-name">{script.name}</span>
                  <span className="script-id">{script.id}</span>
                </div>
                <span className="script-time">{fmt(script.durationMs)}</span>
                {script.error && (
                  <div className="script-error">{script.error}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Import Warnings */}
      {report.importWarnings.length > 0 && (
        <div className="report-section">
          <button
            className="section-toggle"
            onClick={() => setShowWarnings(!showWarnings)}
          >
            <h4 className="section-title">
              Import Warnings ({report.importWarnings.length})
            </h4>
            <span className="toggle-arrow">{showWarnings ? '[-]' : '[+]'}</span>
          </button>

          {showWarnings && (
            <ul className="import-warnings-list">
              {report.importWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Open Report File */}
      {report.reportFilePath && onOpenReport && (
        <div className="report-file-action">
          <button className="btn btn-small btn-secondary" onClick={onOpenReport}>
            Open Full Report
          </button>
          <span className="report-file-path">{report.reportFilePath}</span>
        </div>
      )}

      <style>{`
        .migration-report {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-top: 16px;
        }

        .report-section {
          background: #fafafa;
          border: 1px solid #eee;
          border-radius: 6px;
          padding: 14px;
        }

        .section-title {
          color: #714B67;
          font-size: 13px;
          font-weight: 600;
          margin: 0;
        }

        .section-toggle {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
          text-align: left;
        }

        .section-toggle:hover .section-title {
          color: #5a3c52;
        }

        .toggle-arrow {
          font-family: 'Courier New', monospace;
          font-size: 12px;
          color: #999;
        }

        /* Phase Timing Bars */
        .phase-bars {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 12px;
        }

        .phase-bar-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .phase-bar-label {
          width: 110px;
          font-size: 12px;
          color: #555;
          text-align: right;
          flex-shrink: 0;
        }

        .phase-bar-track {
          flex: 1;
          height: 14px;
          background: #e8e8e8;
          border-radius: 3px;
          overflow: hidden;
        }

        .phase-bar-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 0.4s ease;
          min-width: 2px;
        }

        .phase-bar-time {
          width: 50px;
          font-size: 12px;
          font-family: 'Courier New', monospace;
          color: #666;
          text-align: right;
          flex-shrink: 0;
        }

        /* Stats Grid */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-top: 12px;
        }

        .stat-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 8px;
          background: white;
          border-radius: 4px;
          border: 1px solid #eee;
        }

        .stat-value {
          font-size: 20px;
          font-weight: 700;
          color: #714B67;
        }

        .stat-label {
          font-size: 11px;
          color: #888;
          margin-top: 2px;
        }

        .stats-footnote {
          font-size: 11px;
          color: #999;
          margin-top: 8px;
          text-align: center;
        }

        /* Script List */
        .script-count-skip {
          color: #856404;
          font-weight: normal;
        }

        .script-count-fail {
          color: #dc3545;
          font-weight: normal;
        }

        .script-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-top: 10px;
        }

        .script-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 8px;
          border-radius: 4px;
          font-size: 12px;
          flex-wrap: wrap;
        }

        .script-applied {
          background: #f0fff0;
        }

        .script-skipped {
          background: #fffde6;
        }

        .script-failed {
          background: #fff5f5;
        }

        .script-status-tag {
          font-family: 'Courier New', monospace;
          font-size: 11px;
          font-weight: bold;
          width: 42px;
          flex-shrink: 0;
        }

        .script-applied .script-status-tag {
          color: #28a745;
        }

        .script-skipped .script-status-tag {
          color: #856404;
        }

        .script-failed .script-status-tag {
          color: #dc3545;
        }

        .script-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .script-name {
          color: #333;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .script-id {
          color: #999;
          font-size: 10px;
          font-family: 'Courier New', monospace;
        }

        .script-time {
          font-family: 'Courier New', monospace;
          font-size: 11px;
          color: #666;
          flex-shrink: 0;
        }

        .script-error {
          width: 100%;
          color: #dc3545;
          font-size: 11px;
          padding: 4px 8px;
          margin-top: 2px;
          background: rgba(220,53,69,0.05);
          border-radius: 3px;
        }

        /* Import Warnings */
        .import-warnings-list {
          margin: 10px 0 0 18px;
          font-size: 12px;
          color: #856404;
        }

        .import-warnings-list li {
          margin: 4px 0;
        }

        /* Report File */
        .report-file-action {
          display: flex;
          align-items: center;
          gap: 10px;
          padding-top: 4px;
        }

        .report-file-path {
          font-size: 11px;
          color: #999;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
};

export default MigrationReportView;
