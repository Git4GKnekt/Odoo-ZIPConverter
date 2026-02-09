# Quickstart

## Krav
- Node.js 18+
- PostgreSQL 14+ (korande)

## Installera och bygg
```bash
npm install
npm run build
cd gui
npm install
npm run build
```

## Starta GUI
```bash
cd gui
npx electron .
```

Eller pa Windows: dubbelklicka `start-gui.bat`

## Anvandning
1. Valj migreringsvag (Odoo 16→17 eller 17→18)
2. Valj din Odoo backup-ZIP som input-fil
3. Valj var den migrerade filen ska sparas
4. Kontrollera att PostgreSQL ar ansluten (gron bock)
5. Klicka "Start Migration"
6. Folj progressen genom alla 4 faser (Extraction → Database → Migration → Export)
7. Granska rapporten med fas-tider, statistik och skript-resultat
8. Textrapport sparas automatiskt som `*-report.txt` bredvid output-ZIP

## Stodda versioner
- Odoo 16 → 17 (15 migreringsskript)
- Odoo 17 → 18 (17 migreringsskript)

## Backup-format
ZIP-filen maste innehalla:
- `dump.sql` - Databasdump
- `filestore/` - Bifogade filer
- `manifest.json` - Metadata (valfritt men rekommenderas)

## Felskning
- **PostgreSQL hittas inte**: Appen soker automatiskt i Program Files, men kontrollera att PostgreSQL ar installerat och startat
- **Versionsfel**: Backupen maste matcha vald migreringsvag (t.ex. Odoo 16-backup for 16→17)
- **Help-menyn**: Innehaller lankar till README, Quickstart och Arbore-webbplatsen

---
[Arbore, Sweden](https://www.arbore.se)
