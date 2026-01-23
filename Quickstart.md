# Quickstart

## Krav
- Node.js 18+
- PostgreSQL 14+ (korrande)

## Starta GUI
```bash
cd gui
npm install
npm run dev
```

## Anvandning
1. Dra en Odoo backup-ZIP till fonstret
2. Ange PostgreSQL-uppgifter (localhost:5432)
3. Klicka "Starta migrering"
4. Hamta migrerad ZIP fran output-mappen

## Stodda versioner
- Odoo 16 → 17
- Odoo 17 → 18

## Backup-format
ZIP-filen maste innehalla:
- `dump.sql` - Databasdump
- `filestore/` - Bifogade filer
- `manifest.json` - Metadata (valfritt)
