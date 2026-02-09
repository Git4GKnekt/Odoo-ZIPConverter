# Odoo-ZIPConverter

> Migreringsverktyg for Odoo backup-ZIPs (16->17, 17->18)
> Skapat: 2026-01-23 | GitHub: Git4GKnekt

## VIKTIGT: Referensdokumentation

Innan storre andringar, las dessa kallor:
- Claude Code Best Practices: https://www.anthropic.com/engineering/claude-code-best-practices
- Building Effective Agents: https://www.anthropic.com/engineering/building-effective-agents

## KRITISKA REGLER

- ALDRIG committa till main - Skapa feature branch forst
- ALLTID verifiera med test/lint innan commit
- FOLJ GDPR - Extra viktigt vid personuppgiftshantering
- Hall CLAUDE.md under 200 rader - For optimal prestanda

## VAD (Tech Stack och Struktur)

Stack: TypeScript, React, Electron, Embedded PostgreSQL

```
Odoo-ZIPConverter/
├── src/                      # Backend migreringsmotor
│   ├── index.ts             # Huvudexport (migrate())
│   ├── embedded-pg.ts       # Inbaddad PostgreSQL-livscykel
│   ├── extractor.ts         # ZIP-extraktion
│   ├── database.ts          # PostgreSQL temp-databas
│   ├── filestore.ts         # Filestore-kopiering
│   └── migration/           # SQL-skript
│       ├── index.ts         # Orchestrator + auto-detection
│       ├── odoo-16-to-17.ts # 15 migreringsskript
│       └── odoo-17-to-18.ts # 17 migreringsskript
├── gui/                      # Electron desktop-app
│   ├── src/main/            # IPC handlers
│   ├── src/renderer/        # React UI
│   ├── scripts/             # Byggskript (prepare-backend, prepare-postgres)
│   └── postgres/            # Bundlade PG-binarar (gitignored, byggs lokalt)
├── Screenprints/             # Skarmbilder for dokumentation
├── metamorphosis/            # Evolution governance
└── tests/                    # Tester
```

## VARFOR (Projektets Syfte)

Migrera Odoo backup-ZIPs mellan versioner:
- Extrahera dump.sql + filestore fran ZIP
- Kor SQL-migreringsskript i temporar PostgreSQL-databas
- Auto-detektera migreringsvag (16->17 eller 17->18)
- Paketera migrerad backup
- **Inbaddad PostgreSQL** — ingen extern installation kravs

## HUR (Kommandon och Verifiering)

### Backend
```bash
npm install
npm run build
npm run typecheck
```

### GUI (Electron)
```bash
cd gui
npm install
npm run prepare-postgres  # Kopiera PG-binarar (forsta gangen)
npm run dev               # Starta dev
npm run build             # Bygg for produktion
npm run build:package     # Bygg installer (.exe)
```

### Verifiering (KOR ALLTID fore commit)
```bash
npm run typecheck    # TypeScript
npm run lint         # Kodstil
npm test             # Tester
```

## Filgranser

| Typ | Mappar | Regel |
|-----|--------|-------|
| Sakert | /src/, /gui/, /tests/ | Fritt fram |
| Las forst | /config/, package.json | Fraga innan |
| Aldrig | /node_modules/, /.git/ | Forbjudet |

## GDPR Paminnelse (Sverige)

- Personnummer - ALDRIG som primarnyckel
- Samtycke kravs for personuppgifter

## METAMORPHOSIS Integration

Projektet utvecklades med METAMORPHOSIS evolutionary governance:

| Evolution | Mal | Vinnare |
|-----------|-----|---------|
| evo-001 | Backend | Beta (Disk-based) |
| evo-002 | GUI | Beta (Electron) |
| evo-003 | 17->18 | Alpha (Modular Scripts) |

### Kommandon
- `/awaken` - Starta ny evolution
- `/evolve` - Utveckla alla timelines
- `/council` - Council-granskning
- `/select` - Valj vinnare
- `/status` - Visa status
- `/ledger` - Beslutshistorik

Se `metamorphosis/CLAUDE.md` for fullstandig dokumentation.

---
Version: 2.3.0 | Uppdaterad: 2026-02-09
