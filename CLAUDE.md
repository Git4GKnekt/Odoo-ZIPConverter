# Odoo-ZIPConverter

> Beskriv projektets syfte har
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

Stack: TypeScript, React, Node.js

Odoo-ZIPConverter/
â”œâ”€â”€ CLAUDE.md           # Denna fil
â”œâ”€â”€ .claude/
â”‚   â”œâ”€â”€ agents/        # code-reviewer, gdpr-specialist
â”‚   â”œâ”€â”€ commands/      # Slash-kommandon
â”‚   â””â”€â”€ skills/        # swedish-gdpr, testing-patterns
â”œâ”€â”€ src/               # Kallkod
â”œâ”€â”€ tests/             # Tester
â””â”€â”€ docs/              # Dokumentation

## VARFOR (Projektets Syfte)

Beskriv projektets syfte har

## HUR (Kommandon och Verifiering)

### Utveckling
npm run dev          # Starta dev server
npm run build        # Bygg for produktion

### Verifiering (KOR ALLTID fore commit)
npm run typecheck    # TypeScript
npm run lint         # Kodstil
npm test             # Tester

## Filgranser

| Typ | Mappar | Regel |
|-----|--------|-------|
| Sakert | /src/, /tests/, /docs/ | Fritt fram |
| Las forst | /config/, package.json | Fraga innan |
| Aldrig | /node_modules/, /.git/ | Forbjudet |

## Agent Loop Workflow

SAMLA KONTEXT -> PLANERA -> AGERA -> VERIFIERA -> UPPREPA

1. Samla Kontext: Las relevanta filer, forsta scope
2. Planera: Skapa plan innan kodning (anvand "think hard")
3. Agera: Implementera i sma, verifierbara steg
4. Verifiera: Kor tester, linters, typkontroll
5. Commit: Beskrivande commits (conventional commits)

## Extended Thinking Guide

| Fras | Anvandning |
|------|------------|
| think | Enkel planering |
| think hard | Feature implementation |
| think harder | Arkitekturbeslut |
| ultrathink | Sakerhetskritisk kod |

## Subagenter

- code-reviewer: Kodgranskning fore commits
- gdpr-specialist: GDPR-compliance (svenska krav)

Hantera med: /agents

## Skills

- swedish-gdpr: GDPR for svenska foretag
- testing-patterns: AAA-pattern, mocking, coverage

## Git Workflow

# Ny feature
git checkout -b feature/beskrivning

# Commit (efter verifiering!)
git add .
git commit -m "feat: beskrivning"

# Push
git push origin feature/beskrivning

## GDPR Paminnelse (Sverige)

- Personnummer - ALDRIG som primarnyckel
- Samtycke kravs for personuppgifter
- Se .claude/skills/swedish-gdpr/SKILL.md

## Tips

1. /init - Auto-generera CLAUDE.md
2. # - Lagg till anteckningar
3. /clear - Rensa context
4. /agents - Hantera subagenter

## METAMORPHOSIS Integration

Projektet anvander METAMORPHOSIS for evolutionar AI-governance.

### Snabbstart
```
cd metamorphosis
/awaken "Beskriv vad du vill bygga"
```

### Kommandon
- `/awaken` - Starta ny evolution
- `/evolve` - Utveckla alla timelines
- `/status` - Visa ekosystemets status
- `/cross a b` - Korsning av tva timelines
- `/council` - Manuell Council-granskning
- `/select` - Valj vinnare for produktion
- `/ledger` - Fraga beslutshistorik

Se `metamorphosis/CLAUDE.md` for fullstandig dokumentation.

---
Version: 1.0.0 | Uppdaterad: 2026-01-23
