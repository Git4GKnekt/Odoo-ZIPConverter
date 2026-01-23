---
name: swedish-gdpr
description: GDPR-compliance for Swedish companies. Use when handling personal data, cookies, data protection, export/delete functionality.
---

# GDPR-efterlevnad (Sverige)

## Nar ska denna skill anvandas?
- Vid implementation av anvandarregistrering
- Vid hantering av personuppgifter
- Vid cookie-implementation
- Vid export/radera funktionalitet

## Karnprinciper

### 1. Dataminimering
Samla ENDAST nodvandig data.

### 2. Samtycke
- Explicit opt-in
- Visa INNAN tracking borjar
- Enkelt att aterkalla

### 3. Anvandarens Rattigheter
- Ratt till tillgang (export)
- Ratt till radering
- Ratt till rattelse
- Ratt till dataportabilitet

### 4. Kansliga Personuppgifter
Dessa kraver extra skydd:
- Personnummer (ALDRIG som primarnyckel!)
- Halsodata
- Etniskt ursprung
- Politiska asikter

## Checklista
- [ ] Dataskyddspolicy publicerad (svenska)
- [ ] Cookie-banner med opt-in
- [ ] Behandlingsregister upprattat
- [ ] PuB-avtal med leverantorer
- [ ] Export-funktionalitet
- [ ] Radera-funktionalitet

## Lagringstider
- Bokforingslagen: 7 ar for finansiell data
- Analytics: Max 14 manader
- Marketing consent: Tills aterkallat
