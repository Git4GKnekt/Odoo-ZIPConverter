# Odoo-ZIPConverter

> Migreringsverktyg för Odoo backup-ZIPs med stöd för 16→17 och 17→18

## Funktioner

- Extrahera Odoo backup-ZIPs (dump.sql + filestore + manifest.json)
- Migrera databaser från Odoo 16.0 → 17.0 (15 SQL-skript)
- Migrera databaser från Odoo 17.0 → 18.0 (17 SQL-skript)
- Auto-detektera migreringsväg baserat på databasversion
- Electron GUI med drag-and-drop, progressvisning och logghantering

## Quick Start

### GUI (Electron)

```bash
cd gui
npm install
npm run dev
```

### Backend (CLI)

```bash
npm install
npm run build
```

```typescript
import { migrate } from './src';

const result = await migrate({
  inputPath: '/path/to/backup.zip',
  outputPath: '/path/to/output',
  postgresConfig: {
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'password'
  }
});
```

## Projektstruktur

```
Odoo-ZIPConverter/
├── src/                    # Backend migreringsmotor
│   ├── index.ts           # Huvudexport
│   ├── extractor.ts       # ZIP-extraktion
│   ├── database.ts        # PostgreSQL-operationer
│   ├── filestore.ts       # Filestore-hantering
│   └── migration/         # Migreringsskript
│       ├── index.ts       # Orchestrator med auto-detection
│       ├── odoo-16-to-17.ts  # 15 skript för 16→17
│       └── odoo-17-to-18.ts  # 17 skript för 17→18
├── gui/                    # Electron desktop-app
│   ├── src/main/          # Main process
│   └── src/renderer/      # React UI
├── metamorphosis/          # Evolution governance
└── tests/                  # Tester
```

## Migreringsskript

### Odoo 16 → 17
- Grundläggande tabelluppdateringar
- Modulstrukturändringar
- Partner/kontaktfält

### Odoo 17 → 18
- Modulkategoriuppdateringar
- Förbättrad lösenordspolicy
- Meddelandereaktioner
- Schemalagda meddelanden
- Förbättrad sessionshantering

## Systemkrav

- Node.js 18+
- PostgreSQL 14+
- Windows/macOS/Linux

## Utveckling med Claude Code

```bash
claude
```

Se `CLAUDE.md` för Claude Code-konfiguration.

## METAMORPHOSIS

Projektet utvecklades med METAMORPHOSIS evolutionary governance:

| Evolution | Mål | Vinnare |
|-----------|-----|---------|
| evo-001 | Backend | Beta (Disk-based extraction) |
| evo-002 | GUI | Beta (Electron) |
| evo-003 | 17→18 stöd | Alpha (Modular Scripts) |

Se `metamorphosis/CLAUDE.md` för dokumentation.

## Licens

MIT
