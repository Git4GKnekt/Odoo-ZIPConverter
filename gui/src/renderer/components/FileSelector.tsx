/**
 * BETA Timeline - File Selector Component
 * Native file dialog integration with recent files
 */

import React from 'react';

interface FileSelectorProps {
  inputPath: string;
  outputPath: string;
  recentFiles: string[];
  onSelectInput: () => void;
  onSelectOutput: () => void;
  onRecentSelect: (path: string) => void;
  onInputChange: (path: string) => void;
  onOutputChange: (path: string) => void;
}

const FileSelector: React.FC<FileSelectorProps> = ({
  inputPath,
  outputPath,
  recentFiles,
  onSelectInput,
  onSelectOutput,
  onRecentSelect,
  onInputChange,
  onOutputChange
}) => {
  // Extract filename from path for display
  const getFileName = (path: string): string => {
    if (!path) return '';
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1];
  };

  // Truncate path for display
  const truncatePath = (path: string, maxLength = 50): string => {
    if (path.length <= maxLength) return path;
    const start = path.slice(0, 20);
    const end = path.slice(-25);
    return `${start}...${end}`;
  };

  return (
    <div className="file-selector">
      {/* Input File Section */}
      <div className="file-section">
        <label className="section-label">
          <span className="label-icon">[IN]</span>
          Source Backup (Odoo 16)
        </label>

        <div className="file-input-group">
          <input
            type="text"
            className="file-path-input"
            value={inputPath}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder="Select Odoo 16 backup file..."
            readOnly
          />
          <button
            className="btn btn-browse"
            onClick={onSelectInput}
            title="Browse for file"
          >
            Browse...
          </button>
        </div>

        {inputPath && (
          <div className="file-info">
            <span className="file-name">{getFileName(inputPath)}</span>
          </div>
        )}
      </div>

      {/* Output File Section */}
      <div className="file-section">
        <label className="section-label">
          <span className="label-icon">[OUT]</span>
          Migrated Backup (Odoo 17)
        </label>

        <div className="file-input-group">
          <input
            type="text"
            className="file-path-input"
            value={outputPath}
            onChange={(e) => onOutputChange(e.target.value)}
            placeholder="Choose destination for migrated backup..."
            readOnly
          />
          <button
            className="btn btn-browse"
            onClick={onSelectOutput}
            title="Choose save location"
          >
            Save As...
          </button>
        </div>

        {outputPath && (
          <div className="file-info">
            <span className="file-name">{getFileName(outputPath)}</span>
          </div>
        )}
      </div>

      {/* Recent Files Section */}
      {recentFiles.length > 0 && (
        <div className="recent-files">
          <label className="section-label">
            <span className="label-icon">[~]</span>
            Recent Files
          </label>

          <div className="recent-list">
            {recentFiles.slice(0, 5).map((path, index) => (
              <button
                key={index}
                className="recent-item"
                onClick={() => onRecentSelect(path)}
                title={path}
              >
                <span className="recent-icon">[ZIP]</span>
                <span className="recent-name">{getFileName(path)}</span>
                <span className="recent-path">{truncatePath(path)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <style>{`
        .file-selector {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .file-section {
          background: white;
          border-radius: 8px;
          padding: 16px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .section-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          margin-bottom: 12px;
          color: #333;
        }

        .label-icon {
          font-family: 'Courier New', monospace;
          font-size: 12px;
          color: #714B67;
        }

        .file-input-group {
          display: flex;
          gap: 8px;
        }

        .file-path-input {
          flex: 1;
          padding: 10px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
          background: #fafafa;
          color: #333;
        }

        .file-path-input:focus {
          outline: none;
          border-color: #714B67;
          background: white;
        }

        .file-path-input::placeholder {
          color: #999;
        }

        .btn-browse {
          padding: 10px 16px;
          background: #714B67;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 14px;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.2s;
        }

        .btn-browse:hover {
          background: #5a3c52;
        }

        .file-info {
          margin-top: 8px;
          padding: 8px 12px;
          background: #f0f0f0;
          border-radius: 4px;
        }

        .file-name {
          font-size: 13px;
          color: #666;
          font-family: 'Courier New', monospace;
        }

        .recent-files {
          background: white;
          border-radius: 8px;
          padding: 16px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .recent-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .recent-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          background: #fafafa;
          border: 1px solid transparent;
          border-radius: 4px;
          cursor: pointer;
          text-align: left;
          transition: all 0.2s;
        }

        .recent-item:hover {
          background: #f0f0f0;
          border-color: #ddd;
        }

        .recent-icon {
          font-family: 'Courier New', monospace;
          font-size: 11px;
          color: #714B67;
          flex-shrink: 0;
        }

        .recent-name {
          font-weight: 500;
          font-size: 13px;
          color: #333;
          flex-shrink: 0;
        }

        .recent-path {
          font-size: 12px;
          color: #999;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          margin-left: auto;
        }

        /* Drag and drop visual feedback */
        .file-section.drag-over {
          border: 2px dashed #714B67;
          background: #f9f5f8;
        }
      `}</style>
    </div>
  );
};

export default FileSelector;
