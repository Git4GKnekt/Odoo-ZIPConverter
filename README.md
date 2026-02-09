# Odoo-ZIPConverter

> Migreringsverktyg for Odoo backup-ZIPs med stod for 16→17 och 17→18
> Utvecklat av [Arbore, Sweden](https://www.arbore.se)

## Funktioner

- Extrahera Odoo backup-ZIPs (dump.sql + filestore + manifest.json)
- Migrera databaser fran Odoo 16.0 → 17.0 (15 SQL-skript)
- Migrera databaser fran Odoo 17.0 → 18.0 (17 SQL-skript)
- Auto-detektera migreringsvag baserat pa databasversion
- Versionskontroll - blockerar migrering om backup-version inte matchar vald vag
- Electron GUI med progressvisning genom alla 4 faser
- Detaljerad migrationsrapport med fas-tider, databasstatistik och per-skript-resultat
- Textrapport sparas automatiskt bredvid output-ZIP
- PostgreSQL auto-sokning (hittar psql/pg_dump aven om de inte finns i PATH)

## Systemkrav

- Node.js 18+
- PostgreSQL 14+ (korande)
- Windows / macOS / Linux

## Quick Start

### GUI (Electron desktop-app)

```bash
# Installera beroenden
npm install
cd gui && npm install

# Bygg backend + GUI
cd ..
npm run build
cd gui && npm run build

# Starta appen
npx electron .
```

Eller anvand startskriptet (Windows):
```bash
start-gui.bat
```

### Anvandning

1. Valj migreringsvag (16→17 eller 17→18)
2. Valj din Odoo backup-ZIP som input
3. Valj var output-filen ska sparas
4. Se till att PostgreSQL kor och ar konfigurerad (Settings)
5. Klicka "Start Migration"
6. Granska den detaljerade rapporten nar migreringen ar klar

### Backend (CLI)

```bash
npm install
npm run build

npx ts-node src/index.ts \
  --input backup-odoo16.zip \
  --output backup-odoo17.zip \
  --pg-host localhost \
  --pg-user postgres \
  --pg-password secret
```

## Projektstruktur

```
Odoo-ZIPConverter/
├── src/                    # Backend migreringsmotor
│   ├── index.ts           # Huvudexport (migrate())
│   ├── extractor.ts       # ZIP-extraktion
│   ├── database.ts        # PostgreSQL temp-databas, psql/pg_dump
│   ├── filestore.ts       # Filestore-hantering
│   ├── types.ts           # TypeScript-typer
│   └── migration/         # Migreringsskript
│       ├── index.ts       # Orchestrator med auto-detection
│       ├── odoo-16-to-17.ts  # 15 skript for 16→17
│       └── odoo-17-to-18.ts  # 17 skript for 17→18
├── gui/                    # Electron desktop-app
│   ├── src/main/          # Main process + IPC handlers
│   └── src/renderer/      # React UI + komponenter
│       └── components/
│           ├── FileSelector.tsx
│           ├── MigrationProgress.tsx
│           ├── MigrationReport.tsx
│           └── Settings.tsx
├── dist/                   # Kompilerad backend
└── tests/                  # Tester
```

## Migreringsskript

### Odoo 16 → 17 (15 skript)
- Integritetskontroll av backup
- Modulberoende- och statusuppdateringar
- Partner trust-falt och aktivitetssparning
- TOTP och API-nyckelstod
- Bokforing (account.move) och betalningsstatus
- Mail, CRM och webbplatsstruktur
- Versionsmarkering

### Odoo 17 → 18 (17 skript)
- Modulkategoriuppdateringar
- Forbattrad losenordspolicy
- Meddelandereaktioner och schemalagda meddelanden
- Forbattrad sessionshantering
- Kundfalt och betalningsflode
- CRM lead-scoring och webbplats-SEO

## Migrationsrapport

Efter varje migrering genereras en detaljerad rapport som visar:
- **Fas-tider**: Extraction, Database Setup, Migration, Export
- **Databasstatistik**: Tabeller, moduler, partners, anvandare
- **Skript-resultat**: Status ([OK]/[SKIP]/[FAIL]), namn och kortid for varje skript
- **Varningar**: SQL-importvarningar och andra noteringar

Rapporten visas i GUI:t och sparas aven som textfil (`*-report.txt`).

## Utveckling

```bash
# Typecheck
npm run typecheck

# Bygg backend
npm run build

# Bygg GUI
cd gui
npm run build

# Starta i dev-lage (hot-reload)
npm run dev
```

## Licens

MIT

---
Utvecklat av [Arbore, Sweden](https://www.arbore.se)
