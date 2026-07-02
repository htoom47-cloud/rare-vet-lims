# Change Control — Rare Vet LIMS

> **Phase 0 — Safety Baseline**  
> **Effective:** 2026-07-03  
> **Scope:** All code, schema, config, and deployment changes

---

## 1. Purpose

This document defines **mandatory rules** before changing production-critical areas (reports, devices, barcode, database). It complements:

- [TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md) — what to verify after a change
- [BACKUP_AND_ROLLBACK.md](./BACKUP_AND_ROLLBACK.md) — how to recover
- [DEAD_CODE_REPORT.md](./DEAD_CODE_REPORT.md) — what may be removed later (not now without process)

---

## 2. Core rules

### Rule 1 — No deletion without documentation

| Requirement | Detail |
|-------------|--------|
| **Before deleting any file** | Record it in a change log entry (§4) and confirm zero importers via grep |
| **Before removing an API route** | Update [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) and notify frontend/portal consumers |
| **Before dropping a DB column/table** | Update [DATABASE_DOCUMENTATION.md](./DATABASE_DOCUMENTATION.md); mark as deprecated for at least one release unless emergency |
| **Dead code** | Follow phased removal in [DEAD_CODE_REPORT.md](./DEAD_CODE_REPORT.md) — **do not bulk-delete** |

**Allowed without a deletion:** disabling a feature (410 response, feature flag, stub script) if behaviour is documented.

---

### Rule 2 — No migration without backup

| Requirement | Detail |
|-------------|--------|
| **Before `migrate.js` patches that alter data** | Take a DB backup (see [BACKUP_AND_ROLLBACK.md](./BACKUP_AND_ROLLBACK.md)) |
| **Before manual SQL on production** | Backup + run on staging copy first |
| **Before Render deploy that runs boot migrations** | Confirm daily backup cron succeeded or run manual `npm run backup` |
| **After failed migration** | Stop deploy; restore from backup — do not “fix forward” blindly |

**Note:** This project uses incremental patches in `backend/src/scripts/migrate.js`, not numbered migration files. Treat every `applyPatches()` change as a migration.

---

### Rule 3 — Reports / devices / barcode only after testing

Changes touching any of these paths require **full relevant section** of [TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md) before merge/deploy:

| Area | Paths (examples) | Minimum tests |
|------|------------------|---------------|
| **Reports** | `reports.service.js`, `report-builder.service.js`, `design-3/*`, `LaboratoryReport.jsx` | Generate PDF + staff preview + portal preview |
| **Devices** | `devices.service.js`, `device-import.service.js`, `bridge/*`, `devices.routes.js` | Norma ingest + barcode chain script |
| **Barcode** | `barcode.js`, `barcode-scan.js`, `zebraPrint.js`, `labelPanel.js` | Sample create + label print + Norma PID match |

**Automated smoke (when available):**

```bash
cd backend
node src/scripts/verify-system-health.js
node src/scripts/verify-barcode-norma-chain.js
node src/scripts/verify-norma-ref-chain.js
```

---

## 3. Change categories

| Category | Examples | Backup required? | Full checklist? |
|----------|----------|:----------------:|:---------------:|
| **Docs only** | README, `*_DOCUMENTATION.md` | No | No |
| **UI copy / i18n** | `frontend/src/i18n/*` | No | Spot-check affected screens |
| **Billing / inventory** | invoices, stock | Yes (prod) | Billing section of checklist |
| **Reference ranges** | `reference-ranges*.service.js`, Tests UI | Yes (prod) | Report with refs + flags |
| **Schema / migrate** | `migrate.js`, `init.sql` | **Yes** | Full checklist |
| **Reports / PDF** | design-3, Puppeteer | Yes (prod) | All report scenarios in checklist |
| **Device / Norma** | ingest, bridge | Yes (prod) | Norma + barcode items |
| **Deletion** | remove file/table | Yes + doc update | Full checklist |

---

## 4. How to log every change

Use a single line per change in **`CHANGELOG.md`** (create on first code change) or the Git commit message body.

### Minimum log fields

```markdown
## YYYY-MM-DD — Short title

- **Author:**
- **Category:** docs | ui | api | schema | report | device | barcode | delete
- **Risk:** low | medium | high
- **Backup taken:** yes/no — file or Render snapshot ID
- **Checklist run:** yes/no — link or PR
- **Files touched:** (bullet list)
- **Rollback:** (one sentence — git revert SHA / restore backup name)
- **Notes:** (optional)
```

### Git commit format (recommended)

```
type(scope): short description

- Backup: yes (rare-vet-lims-2026-07-03.sql.gz)
- Checklist: TESTING_CHECKLIST §1–8
- Rollback: git revert <sha> or restore backup above
```

Types: `docs`, `feat`, `fix`, `refactor`, `chore`, `schema`

---

## 5. Rollback procedure (summary)

Full detail: [BACKUP_AND_ROLLBACK.md](./BACKUP_AND_ROLLBACK.md)

| Layer | Fast rollback |
|-------|----------------|
| **Application code** | Redeploy previous Render deploy **or** `git revert` + push |
| **Database** | Restore `pg_dump` / Render dashboard backup **before** re-running old app |
| **Uploads / PDFs** | Restore `/var/data/uploads` disk snapshot or S3 prefix |
| **Env vars** | Document previous values in change log; revert in Render Dashboard |

**Order matters:**

1. Put app in maintenance or stop traffic if data is inconsistent  
2. Restore database from backup  
3. Restore uploads if report PDFs/images affected  
4. Deploy known-good git commit  
5. Run [TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md) on restored environment  

---

## 6. Approval matrix (recommended)

| Change type | Who approves |
|-------------|--------------|
| Docs only | Author self-merge |
| Low-risk UI | Lab manager review |
| API / permissions | Admin + one developer |
| Schema / migrate | Admin + backup confirmed |
| Reports / devices / barcode (prod) | Admin + checklist signed off |

---

## 7. Related documents

| Document | Use when |
|----------|----------|
| [LIMS_ENTERPRISE_V2_ARCHITECTURE.md](./LIMS_ENTERPRISE_V2_ARCHITECTURE.md) | Planning multi-phase work |
| [DEPENDENCY_MAP.md](./DEPENDENCY_MAP.md) | Assessing blast radius |
| [DEAD_CODE_REPORT.md](./DEAD_CODE_REPORT.md) | Planning removals (Phase A+) |
| [DATABASE_DOCUMENTATION.md](./DATABASE_DOCUMENTATION.md) | Schema changes |
| [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) | API contract changes |

---

## 8. Change log

### 2026-07-03 — Phase 1: Reference Range Engine

| Field | Value |
|-------|-------|
| **Category** | refactor (reference ranges) |
| **Risk** | medium |
| **Backup taken** | Recommended before prod deploy — no schema migration |
| **Migration** | **None** — uses existing `test_reference_ranges` columns (`sex`, `age_*`, `device_id`, `is_active`) from prior patches |
| **Checklist** | `node backend/src/scripts/verify-reference-range-engine.js` |
| **Files** | `reference-range-engine.service.js` (new), `reference-ranges.service.js`, `reference-range.js`, `reports.service.js`, `results.service.js`, `verify-reference-range-engine.js` |
| **Rollback** | `git revert` Phase 1 commit; reports fall back to lateral-join + LIMS-only logic |

**Summary:** Centralized reference selection in `reference-range-engine.service.js` with `resolveReferenceRange`, `formatReferenceRange`, `evaluateResultFlag`. Reports use engine only; `result_values.notes` (Norma) kept as legacy metadata, not bounds.

### 2026-07-03 — Phase 2: Device Mapping Engine

| Field | Value |
|-------|-------|
| **Category** | refactor (device mapping) |
| **Risk** | medium |
| **Backup taken** | Recommended before prod deploy — no schema migration |
| **Migration** | **None** — uses existing `device_parameter_mappings` table |
| **Checklist** | `node backend/src/scripts/verify-device-mapping-engine.js` + `verify-norma-ref-chain.js` |
| **Files** | `device-mapping-engine.service.js` (new), `device-import.service.js`, `device-parameter-mappings.service.js`, `verify-device-mapping-engine.js` |
| **Rollback** | `git revert` Phase 2 commit |

**Summary:** Centralized Norma/device OBX → LIMS mapping in `device-mapping-engine.service.js`. Ingest unchanged structurally; engine validates each row before import (blocks WBC↔LYM% confusion). Reference ranges remain in reference-range-engine.

### 2026-07-03 — Phase 3: Result Engine

| Field | Value |
|-------|-------|
| **Category** | refactor (result evaluation) |
| **Risk** | medium |
| **Backup taken** | Recommended before prod deploy — no schema migration |
| **Migration** | **None** — uses existing `results` / `result_values` tables |
| **Checklist** | `node backend/src/scripts/verify-result-engine.js` + Phase 1/2 scripts |
| **Files** | `result-engine.service.js` (new), `reports.service.js`, `results.service.js`, `verify-result-engine.js` |
| **Rollback** | `git revert` Phase 3 commit |

**Summary:** Centralized value normalization, reference display, flags, and report row building in `result-engine.service.js`. Reports use `buildReportResultRow`; manual entry uses `evaluateResult`. Never uses `result_values.notes` for reference bounds.

### 2026-07-03 — Phase 4: Dynamic Report Builder

| Field | Value |
|-------|-------|
| **Category** | refactor (report sections) |
| **Risk** | medium |
| **Backup taken** | Recommended before prod deploy — no schema migration |
| **Migration** | **None** — sections built from existing sample_tests / results / attachments |
| **Checklist** | `node backend/src/scripts/verify-report-builder.js` + Phase 1–3 scripts + manual PDF preview |
| **Files** | `report-builder.service.js` (expanded), `reports.service.js`, `verify-report-builder.js` |
| **Rollback** | `git revert` Phase 4 commit |

**Summary:** Dynamic sections in `report-builder.service.js` — CBC/Chemistry/Parasites/images only when ordered + has results/images. PDF (design-3) and Preview share the same `sections` array. No PDF layout redesign.

### 2026-07-03 — Phase 4.1: PDF / Preview Consistency Check

| Field | Value |
|-------|-------|
| **Category** | verification (no design change) |
| **Risk** | low |
| **Migration** | **None** |
| **Checklist** | `node backend/src/scripts/verify-report-preview-pdf-consistency.js` |
| **Files** | `verify-report-preview-pdf-consistency.js`, `extractSectionSignature` in report-builder |
| **Rollback** | N/A — script + helper only |

**Summary:** Confirms buildReportData → buildPdfPayload → getPreview → portal preview → Design 3 PDF all share identical `sections` signatures. No CSS/PDF layout changes.

### 2026-07-03 — Phase 5: Barcode Engine

| Field | Value |
|-------|-------|
| **Category** | refactor (barcode / ZPL labels) |
| **Risk** | medium — affects Zebra print + USB scan + Norma PID |
| **Backup taken** | Recommended before prod deploy |
| **Migration** | **None** — logic-only; sample IDs unchanged |
| **Checklist** | `verify-barcode-engine.js` + `verify-barcode-norma-chain.js` + physical label scan |
| **Files** | `barcode-engine.service.js` (new), `barcode.js`, `labelPanel.js`, `zebraPrint.js`, `BarcodeLabel.jsx` |
| **Rollback** | `git revert` Phase 5 commit |

**Summary:** Code128 barcode = sample digits only; Arabic customer/animal/type/date as separate ZPL text (^CI28). Quiet zones enforced. Norma/scanner chain unchanged.

### 2026-07-03 — Phase 6: Portal Synchronization

| Field | Value |
|-------|-------|
| **Category** | refactor (portal + preview sync) |
| **Risk** | medium |
| **Migration** | **None** — lifecycle derived from existing `reports` + `results.is_validated` |
| **Checklist** | `node backend/src/scripts/verify-portal-sync.js` + portal manual login |
| **Files** | `portal-sync.service.js` (new), `portal.service.js`, `reports.service.js`, portal/staff `LaboratoryReport.jsx` |
| **Env** | `PORTAL_SHOW_REVIEWED=true` to show reviewed (preliminary) reports |
| **Rollback** | `git revert` Phase 6 commit |

**Summary:** Single report view via `getPreview` → `buildUnifiedReportView`. Portal lists/filters use `portalVisibilitySql`. PDF download uses `pdf_url` (official file). Sections/attachments from Report Builder only.

### 2026-07-03 — Phase 7: Laboratory Workflow Engine

| Field | Value |
|-------|-------|
| **Category** | feature (workflow overlay) |
| **Risk** | medium — new inference layer; no change to core flows when disabled |
| **Backup taken** | Recommended before prod deploy |
| **Migration** | **None** — timeline stored in existing `audit_logs` (`module: laboratory_workflow`) |
| **Checklist** | `node backend/src/scripts/verify-laboratory-workflow.js` + Phase 1–6 scripts |
| **Files** | `laboratory-workflow.service.js` (new), `samples.service.js`, `samples.routes.js`, `dashboard.service.js`, `env.js`, `verify-laboratory-workflow.js` |
| **Env** | `WORKFLOW_ENGINE_ENABLED=true` to activate recording + API enrichment |
| **Rollback** | Set `WORKFLOW_ENGINE_ENABLED=false` or `git revert` Phase 7 commit |

**Summary:** Read/infer workflow layer over existing LIMS data. 13 states from customer registration through archive. Validates transitions, role-based allowed actions, timeline via audit_logs. Dashboard adds workflow counts when enabled. Legacy `workflow` object on sample detail unchanged; optional `workflowSummary` when flag on.

### 2026-07-03 — Phase 9A: Security Hardening (P0)

| Field | Value |
|-------|-------|
| **Category** | security (P0 fixes only) |
| **Risk** | medium — device key format change in JSON config (no schema migration) |
| **Migration** | **None** — bcrypt hash stored in existing `device_integrations.config` JSONB |
| **Checklist** | `node backend/src/scripts/verify-security-phase9.js` |
| **Files** | `auth.service.js`, `device-api-key.js`, `deviceAuth.js`, `devices.service.js`, `loginRateLimit.js`, `database.js`, `backup-uploads.js`, `verify-security-phase9.js`, `SECURITY_FIX_REPORT.md` |
| **Env** | `UPLOAD_BACKUP_ENABLED`, `DATABASE_SSL_REJECT_UNAUTHORIZED`, `DATABASE_CA_CERT` |
| **Rollback** | `git revert` Phase 9A commit; legacy device keys still in DB until re-hashed |

**Summary:** Removed resetToken from forgot-password API. Device API keys bcrypt-hashed in config JSON with lazy legacy upgrade. Production DB SSL defaults to rejectUnauthorized=true. Login rate limit 5/15min. Uploads backup script (opt-in).

---

*Phase 0 — documentation only. No operational code was modified to create this file.*
