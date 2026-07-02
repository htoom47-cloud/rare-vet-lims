# Release Notes — Rare Vet LIMS v1.0

**Laboratory:** AL NAWADER VETERINARY CARE CENTER (مركز رعاية النوادر البيطري)  
**Release:** v1.0 — UAT / Go-Live Candidate  
**Date:** 2026-07-03

---

## Overview

Rare Vet LIMS v1.0 is a cloud-based veterinary laboratory information system covering reception through report delivery and customer portal access. Development was delivered in phased engineering milestones (Phase 0–9A) with verify scripts and change control at each stage.

**Production URL:** https://lims.rarevetcare.com  
**Portal URL:** https://portal.rarevetcare.com

---

## Phase 0 — Safety Baseline (Documentation)

- Established `CHANGE_CONTROL.md`, `TESTING_CHECKLIST.md`, `BACKUP_AND_ROLLBACK.md`
- Defined rules: no deletion without documentation, no migration without backup, reports/devices/barcode require checklist before deploy
- No operational code changes

---

## Phase 1 — Reference Range Engine

- **New:** `reference-range-engine.service.js`
- Centralized reference range resolution by species, sex, age, device
- Unified flag evaluation (HIGH/LOW/NORMAL/CRITICAL)
- `result_values.notes` (Norma metadata) never used as reference bounds
- **Verify:** `verify-reference-range-engine.js` (9/9)
- **Migration:** None

---

## Phase 2 — Device Mapping Engine

- **New:** `device-mapping-engine.service.js`
- Norma/device OBX codes mapped to LIMS parameters before import
- Blocks dangerous pass-through (e.g. WBC ↔ LYM% confusion)
- **Verify:** `verify-device-mapping-engine.js` (15/15)
- **Migration:** None

---

## Phase 3 — Result Engine

- **New:** `result-engine.service.js`
- Centralized value normalization, flags, and report row building
- Manual entry and device import share same evaluation logic
- **Verify:** `verify-result-engine.js` (13/13)
- **Migration:** None

---

## Phase 4 — Dynamic Report Builder

- Expanded `report-builder.service.js`
- Sections appear only when tests ordered + results/images exist (CBC, Chemistry, Parasites, Images, Approval)
- Staff preview and PDF share same `sections` pipeline
- **Verify:** `verify-report-builder.js` (12/12)
- **Migration:** None

---

## Phase 4.1 — PDF / Preview Consistency

- **New:** `verify-report-preview-pdf-consistency.js`
- Confirmed identical section signatures across preview, portal, and Design 3 PDF
- No layout/CSS changes
- **Verify:** 13/13

---

## Phase 5 — Barcode Engine

- **New:** `barcode-engine.service.js`
- Code128 = sample digits only; Arabic text outside barcode (ZPL ^CI28)
- Wired to backend barcode, frontend Zebra print, and Norma PID chain
- **Verify:** `verify-barcode-engine.js` (15/15), `verify-barcode-norma-chain.js` (15/15)
- **Migration:** None

---

## Phase 6 — Portal Synchronization

- **New:** `portal-sync.service.js`
- Single unified report view: staff preview = portal preview = official PDF sections
- Portal visibility SQL aligned with report lifecycle
- PDF download uses official `pdf_url`
- **Env:** `PORTAL_SHOW_REVIEWED=true` (optional preliminary reports)
- **Verify:** `verify-portal-sync.js` (15/15)
- **Migration:** None

---

## Phase 7 — Laboratory Workflow Engine

- **New:** `laboratory-workflow.service.js`
- 13 workflow states from customer registration through archive
- Read/infer layer over existing data; timeline via `audit_logs`
- Role-based allowed actions; dashboard counts when enabled
- **Env:** `WORKFLOW_ENGINE_ENABLED=true` to activate
- **Verify:** `verify-laboratory-workflow.js` (36/36)
- **Migration:** None

---

## Phase 8 — Production Readiness & Enterprise Audit

- Documentation-only comprehensive audit
- **Deliverables:** `PRODUCTION_READINESS_REPORT.md`, `SECURITY_AUDIT.md`, `PERFORMANCE_AUDIT.md`, `DEPLOYMENT_CHECKLIST.md`, `RELEASE_V1_CHECKLIST.md`
- Identified P0 security and operational gaps
- No code changes

---

## Phase 9A — Security Hardening (P0)

| Fix | Detail |
|-----|--------|
| Forgot password | `resetToken` removed from API response |
| Device API keys | bcrypt hash in config JSON; `api_key_once` on create/regenerate |
| Database SSL | Production defaults `rejectUnauthorized: true` |
| Login rate limit | 5 failed attempts / 15 minutes |
| Upload backup | `backup-uploads.js` + `UPLOAD_BACKUP_ENABLED` |
| **Verify:** `verify-security-phase9.js` (20/20) |
| **Migration:** None |

---

## Automated Verification Suite

Run from `backend/` before UAT sign-off:

```bash
node src/scripts/verify-reference-range-engine.js
node src/scripts/verify-device-mapping-engine.js
node src/scripts/verify-result-engine.js
node src/scripts/verify-report-builder.js
node src/scripts/verify-report-preview-pdf-consistency.js
node src/scripts/verify-barcode-engine.js
node src/scripts/verify-barcode-norma-chain.js
node src/scripts/verify-portal-sync.js
node src/scripts/verify-laboratory-workflow.js
node src/scripts/verify-security-phase9.js
```

---

## Known Limitations

See [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md) for deferred features (SMS config, QC v1.1, AI v1.1, mobile v1.2, multi-branch v2.0).

---

## Upgrade / Deploy Notes

- Render blueprint: `render.yaml`
- Deploy checklist: `DEPLOYMENT_CHECKLIST.md`
- Go-live: `GO_LIVE_CHECKLIST.md`
- UAT: `UAT_TEST_BOOK.md`

---

*Rare Vet LIMS v1.0 — AL NAWADER VETERINARY CARE CENTER*
