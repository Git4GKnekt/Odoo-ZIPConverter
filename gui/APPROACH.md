# BETA Timeline: Electron Desktop Application

## Overview

Native cross-platform desktop application using Electron with React renderer.
Provides full offline capability with native OS integration.

## Architecture

```
+------------------+     IPC      +------------------+
|   Main Process   | <==========> |  Renderer (React)|
|   (Node.js)      |              |    (Chromium)    |
+------------------+              +------------------+
        |                                  |
        v                                  v
+------------------+              +------------------+
| Migration Engine |              |   UI Components  |
| (src/index.ts)   |              | - FileSelector   |
+------------------+              | - Progress       |
        |                         | - Settings       |
        v                         +------------------+
+------------------+
|   PostgreSQL     |
+------------------+
```

## Key Design Decisions

### 1. Process Isolation
- **Main Process**: Handles migration, file dialogs, system tray, settings
- **Renderer Process**: React UI, sandboxed for security
- **Communication**: Type-safe IPC with preload script

### 2. Native Integration
- **File Dialogs**: Native OS dialogs via `dialog.showOpenDialog`
- **System Tray**: Background operation indicator
- **Notifications**: Native OS notifications for completion/errors
- **Settings**: Stored in user app data directory

### 3. Offline-First
- All operations run locally
- No external dependencies during runtime
- PostgreSQL connection validated before migration

## Traits Applied

| Trait | Value | Implementation |
|-------|-------|----------------|
| native_feel | 0.8 | Native dialogs, system tray, notifications |
| cross_platform | 0.9 | Electron handles Win/Mac/Linux differences |
| offline_capable | 0.95 | Complete local operation, no network required |

## File Structure

```
gui-beta/
├── APPROACH.md              # This file
├── package.json             # Dependencies + electron-builder config
├── src/
│   ├── main/
│   │   ├── index.ts         # Main process entry
│   │   ├── ipc-handlers.ts  # IPC handler implementations
│   │   └── preload.ts       # Context bridge (security)
│   └── renderer/
│       ├── App.tsx          # Main React component
│       ├── index.tsx        # Renderer entry
│       ├── index.html       # HTML template
│       └── components/
│           ├── FileSelector.tsx      # Native file dialogs
│           ├── MigrationProgress.tsx # Phase-based progress
│           └── Settings.tsx          # PostgreSQL config
```

## IPC Channel Design

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `dialog:open-file` | Renderer -> Main | Open file picker |
| `dialog:save-file` | Renderer -> Main | Save file picker |
| `migration:start` | Renderer -> Main | Start migration |
| `migration:progress` | Main -> Renderer | Progress updates |
| `settings:load` | Renderer -> Main | Load saved settings |
| `settings:save` | Renderer -> Main | Persist settings |

## Progress Phases

1. **Extraction** - Unzip backup to temp directory
2. **Database Setup** - Create temp PostgreSQL DB, load dump
3. **Migration** - Run Odoo 16->17 migration scripts
4. **Export** - Dump DB, update manifest, create new ZIP

## Security Considerations

- Context isolation enabled (no Node.js in renderer)
- Preload script exposes only safe IPC methods
- File paths validated before operations
- PostgreSQL password stored with electron-store encryption

## Build Targets

- Windows: NSIS installer (.exe)
- macOS: DMG with app bundle
- Linux: AppImage, deb, rpm

## Dependencies

| Package | Purpose |
|---------|---------|
| electron | Desktop framework |
| electron-builder | Cross-platform builds |
| electron-store | Settings persistence |
| react, react-dom | UI framework |
| @types/electron | TypeScript support |

## Fitness Expectations

- **Completion**: 100 (full feature implementation)
- **Native Feel**: High (OS-integrated dialogs, notifications)
- **User Experience**: Smooth progress indication with phases
- **Reliability**: Error handling with retry options
