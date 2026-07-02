# Dead Code Report — Rare Vet LIMS

> **Generated:** 2026-07-03  
> **Scope:** Static analysis of imports, routes, boot scripts, and runtime paths.  
> **Companion docs:** `PROJECT_INVENTORY.md`, `DEPENDENCY_MAP.md`, `LIMS_ENTERPRISE_V2_ARCHITECTURE.md`

---

## Executive summary

| Category | Count | Risk if removed now |
|----------|------:|-------------------|
| Orphan modules (no importers) | 4 | Low — safe after quick grep |
| Disabled Norma device-ref sync path | 6 symbols + 1 API + 1 cron | Low — intentionally off |
| Legacy report PDF designs (non-default) | 5 files + helpers | Medium — env override `REPORT_DESIGN=1\|2` |
| Parallel client PDF / print paths | 3 frontend utils | Medium — still used by preview UI |
| Unused exports in live files | 5 | Low |
| Orphan service (never wired) | 1 | Low |
| Stale documentation | 2 | None |
| Dev / scratch scripts (mostly untracked) | ~30+ | None (workspace clutter) |

**Default production report path today:**

```
Reports UI → reports.service.buildReportData()
  → reference-ranges.service + reference-range.js
  → report-builder.service.buildReportSections()
→ pdf.js → design-3 (Puppeteer HTML → PDF)
```

**Not dead (common false positives):**

- `design-2-clinical.js`, `design-2-sparkline.js` — imported by **design-3** and design-2
- `pdf-arabic.js` — used by invoices, quotes, closing PDFs, and legacy report designs
- `norma-ref-debug.service.js` — debug UI + ingest audit (still active)
- `sync-norma-references.js` — boot script; seeds **LIMS** `test_reference_ranges`, not device table
- `DeviceReferenceRanges.jsx` + manual CRUD — active admin UI (Norma auto-sync is what stopped)

---

## Methodology

1. Ripgrep for `require()` / `import` chains from each suspected file.
2. Cross-check Express routes and `App.jsx` routes for UI reachability.
3. Compare against `cloud-start.js` boot scripts and `render.yaml` crons.
4. Mark **orphan** only when **zero** production or script importers exist (excluding self-reference and docs).

Confidence levels:

| Label | Meaning |
|-------|---------|
| **Confirmed dead** | No importers; not reachable |
| **Disabled** | Code exists; entry point removed or returns 410 |
| **Legacy path** | Reachable only via env flag or dev route |
| **Duplicate** | Two implementations of the same feature |
| **Stale doc** | Describes behaviour that no longer exists |

---

## 1. Confirmed dead — safe delete candidates

### 1.1 Orphan PDFKit template stack

| File | Lines (approx.) | Notes |
|------|----------------:|-------|
| `backend/src/utils/pdf-template.js` | ~120 | Exports `renderReportBody`; **zero importers** |
| `backend/src/utils/pdf-results-table.js` | ~100 | Only imported by `pdf-template.js` |
| `backend/src/utils/pdf-i18n.js` | ~80 | Only imported by the two files above |

**Evidence:** No `require('./pdf-template')` anywhere in `backend/`.

**Also drags in:** `pdf-arabic` usage inside these orphans only (pdf-arabic itself stays — invoices use it).

**Recommended action:** Delete all three after one visual PDF regression on design 3 (CBC + chem + paras images).

---

### 1.2 Orphan AI interpretation generator

| File | Symbol | Notes |
|------|--------|-------|
| `backend/src/services/ai-interpretation.service.js` | `generateInterpretation()` | **Never imported** |

**Evidence:** `reports` table has `ai_interpretation` column; `reports.service` **reads** it into report DTO, but nothing calls `generateInterpretation()` to populate it.

**Recommended action:** Either wire generation on report finalize, or delete service + stop exposing unused column in API (schema cleanup is separate migration).

---

### 1.3 Unused export — `flattenSectionResults`

| File | Symbol | Notes |
|------|--------|-------|
| `backend/src/services/report-builder.service.js` | `flattenSectionResults` | Exported; only `buildReportSections` is imported |

**Recommended action:** Remove export (or use it inside report-builder if planned for trends).

---

### 1.4 Unused export — `resolveNormaReferenceOnly`

| File | Symbol | Notes |
|------|--------|-------|
| `backend/src/utils/reference-range.js` | `resolveNormaReferenceOnly` | Alias of `resolveLimsReferenceDisplay`; **zero external callers** |

**Recommended action:** Delete alias + export.

---

### 1.5 Frontend orphan — HTML iframe label print

| File | Symbols | Notes |
|------|---------|-------|
| `frontend/src/utils/labelPrintHtml.js` | `printLabelsViaIframe`, `printLabelViaIframe`, `printLabelFromPreview` | **Zero imports** in `frontend/src` |

**Active label path:** `printLabel.js` → `zebraPrint.js` → `labelPanel.js` (used from `Samples.jsx`, `WorkflowCase.jsx`).

**Recommended action:** Delete `labelPrintHtml.js` or merge any unique CSS into `zebraPrint.js` if needed.

---

## 2. Disabled — Norma device reference auto-sync

Auto-sync from HL7 ingest was **removed**; ranges are manual in LIMS UI. The following remain as dead branches:

### 2.1 Service functions (no runtime callers)

| Symbol | File | Status |
|--------|------|--------|
| `syncFromParsedMessage` | `device-reference-ranges.service.js` | Only called by `syncFromRecentMessages` internally |
| `syncFromRecentMessages` | same | No route, no ingest, no cron |
| `DEVICE_REF_LATERAL_SQL` | same | Exported; **never interpolated** into any query |
| `formatEffectiveReference` | same | Exported; **never imported** |
| `getEffectiveRangeForParameter` | same | Now wraps LIMS only; **never imported** (reports use `reference-ranges.service` directly) |

**Evidence:** `devices.service.js` and `device-import.service.js` no longer `require` device-reference-ranges for sync.

### 2.2 API & scripts

| Entry | Status |
|-------|--------|
| `POST /devices/reference-ranges/sync` | Returns **410 Gone** |
| `backend/src/scripts/sync-device-reference-ranges.js` | Stub — prints disabled message, exits 0 |
| Render cron `rare-vet-device-refs-sync` | **Removed** from `render.yaml` |
| `npm run sync-device-refs` | Runs stub only |

### 2.3 Boot noise

`cloud-start.js` still runs `sync-device-reference-ranges.js` on every deploy. Harmless (exits 0) but adds log clutter.

**Recommended action (phased):**

1. Remove stub from `bootScripts` in `cloud-start.js`.
2. Delete `syncFromParsedMessage` / `syncFromRecentMessages` + dead SQL helpers after confirming no external scripts call them.
3. Keep manual CRUD + `DeviceReferenceRanges` UI until `device_reference_ranges` table is archived (v2 phase 6).
4. Update `docs/norma-device-reference-ranges.md` (see §6).

**Do not delete yet:** `device_reference_ranges` table, list/create/update/delete routes, audit logs — still used for manual device ref admin.

---

## 3. Legacy paths — reachable but not default

### 3.1 Report PDF designs 1 & 2

| Design | Trigger | Files | Default? |
|--------|---------|-------|----------|
| **3** | `REPORT_DESIGN` unset or `=3` | `design-3/*` | **Yes** |
| **1** | `REPORT_DESIGN=1` | `design-1.js`, `design-1-single-page.js`, `layout-mode.js` | No |
| **2** | `REPORT_DESIGN=2` | `design-2.js` (+ shared clinical/sparkline) | No |

Registry: `backend/src/utils/report-designs/index.js` — default id **3**.

**Cursor rule** `.cursor/rules/report-design-1.mdc` still documents design 1 restore path (intentional).

**Recommended action:** Archive design 1/2 PDF generators after unified HTML renderer (v2 phase 2). Keep `design-2-clinical.js` until design 3 no longer imports it.

---

### 3.2 Triple report rendering (dual-path debt)

Three separate ways to produce a “report PDF” or print view:

| Path | Stack | Used when |
|------|-------|-----------|
| **A — Server PDF** | `reports.service` → design-3 Puppeteer | Download / email / stored PDF |
| **B — HTML preview** | `LaboratoryReport.jsx` + `index.css` + `reportLayout.js` | Staff `/reports/:id/view`, portal preview |
| **C — Client PDF** | `labReportPrint.js` + `html2canvas` + `html2pdf.js` | “Download PDF” / print from preview pages |

Paths B and C mirror **design 1 layout**, not design 3 — visual mismatch is architectural debt, not dead code.

**Duplicate files:**

- `frontend/src/pages/LaboratoryReport.jsx`
- `frontend-portal/src/pages/LaboratoryReport.jsx` (~duplicate)
- `frontend/src/utils/labReportPrint.js`
- `frontend-portal/src/utils/labReportPrint.js` (~duplicate)

**Recommended action:** Unify to server PDF only (v2); then remove path C and dedupe portal copy.

---

### 3.3 Dev-only report routes

| Route | Page | Reachability |
|-------|------|--------------|
| `/report-demo` | `ReportDemo.jsx` | `import.meta.env.DEV` only |
| `/report-live/:id` | `ReportLive.jsx` | Always (public-ish preview) |

Not dead — intentional dev/demo tooling.

---

### 3.4 Dual reference-range admin UIs

| UI | API | Purpose |
|----|-----|---------|
| `Tests.jsx` | `PUT/DELETE /tests/parameters/ranges/:id` | Edit ranges while managing test catalog |
| `ReferenceRanges.jsx` | `/reference-ranges/*` (admin service) | Dedicated CRUD + audit log |

**Not dead** — overlapping but both wired. Consolidation is a UX refactor, not deletion.

---

### 3.5 `referenceFromResultNotes` — audit-only

Still exported from `reference-range.js`. **Reports no longer call it** (they use `resolveReportReferenceDisplay` / LIMS joins).

Still used by:

- `norma-ref-debug.service.js` (via `verbatimFromResultNotes`)
- `production-audit-norma-refs.js` script

**Recommended action:** Keep until Norma notes snapshot column exists; then narrow to debug scripts only.

---

## 4. Dev / scratch artifacts (workspace clutter)

These are mostly **untracked** in git (see repo `git status`). Not imported by the app; safe to `.gitignore` or move to `tools/scratch/`:

### 4.1 Backend one-off scripts (untracked)

| Pattern | Examples |
|---------|----------|
| Arabic/PDF experiments | `ar-final-compare.js`, `ar-pdfkit-compare.js`, `ar-shape-test*.js`, `ar-rtla-test.js`, `canvas-*-test.js` |
| Header/layout probes | `banner-align-test.js`, `header-check.js`, `width-check.js`, `raster-header-test.js`, `min-size-test.js` |
| Report API smoke | `generate-report-api.js`, `norma-triple-compare.js`, `complete-norma-sample-report.js` |
| Misc debug | `debug-paras-queue.js`, `verify-ar.js`, `test-qual-flag.js`, `pdf-to-png.js`, `merge-ministry-docs.js` |

**Tracked scripts that are operational (not dead):**

- `verify-norma-ref-chain.js`, `verify-barcode-norma-chain.js`, `verify-system-health.js`
- `clear-device-reference-ranges.js`, `migrate.js`, `seed.js`, E2E flows

### 4.2 Tools folder bundles (untracked)

| File | Notes |
|------|-------|
| `tools/_portal-bundle.js`, `_portal-bundle2.js`, `_prod-bundle.js` | Likely build/debug dumps |
| `tools/*.zpl`, `tools/test-raw-send.js` | Label printer experiments |
| `tools/parasitology-agent/*` | LAN agent prototype |

### 4.3 Root / backend output files (untracked)

`01-1716195.txt`, `USB008`, `backend/_schema-out.txt`, `backend/pdf-test-out.txt`, `backend/test-out.jpg`, `backend/audit-output/*`, `frontend/test-output/*`

**Recommended action:** Add to `.gitignore`; do not commit.

---

## 5. npm scripts pointing at stubs or niche tools

| Script | Target | Status |
|--------|--------|--------|
| `sync-device-refs` | disabled stub | Misleading name — document or remove script |
| `pull-norma-refs` | `pull-norma-species-refs.js` | Active — exports Norma species refs from HL7 history |
| `sync-norma-refs` | `sync-norma-references.js` | Active — seeds **LIMS** CBC refs from static `norma-cbc-references.js`; runs on cloud boot |
| `verify-device-refs` | verification script | Niche — keep for audits |

---

## 6. Stale documentation

| Doc | Issue |
|-----|-------|
| `docs/norma-device-reference-ranges.md` | Still describes `syncFromParsedMessage` on ingest and reports preferring `device_reference_ranges` |
| `DEPENDENCY_MAP.md` § ingest | Correctly notes disabled sync — **contradicts** older norma doc |

**Recommended action:** Update norma doc to reflect manual LIMS refs + disabled device sync (doc-only).

---

## 7. Recommended removal order

```
Phase A — zero user impact (grep + delete)
  ├── pdf-template.js + pdf-results-table.js + pdf-i18n.js
  ├── ai-interpretation.service.js (if not wiring AI)
  ├── labelPrintHtml.js
  └── Unused exports: flattenSectionResults, resolveNormaReferenceOnly

Phase B — after design-3 PDF visual diff passes
  ├── design-1.js, design-1-single-page.js, layout-mode.js (PDF path)
  ├── design-2.js (keep design-2-clinical until design-3 refactored)
  └── labReportPrint.js + html2pdf dependency (staff + portal)

Phase C — device ref cleanup (after prod manual migration confirmed)
  ├── syncFromParsedMessage, syncFromRecentMessages
  ├── DEVICE_REF_LATERAL_SQL, formatEffectiveReference
  ├── sync-device-refs npm script + cloud-start stub entry
  └── Eventually: device_reference_ranges table (v2 architecture phase 6)

Phase D — repo hygiene
  ├── gitignore scratch scripts / test outputs
  └── Update docs/norma-device-reference-ranges.md
```

---

## 8. Do NOT delete before regression

| Item | Reason |
|------|--------|
| `design-3/build-html.js` | Production PDF |
| `reference-ranges.service.js` | Report refs + flags |
| `norma-cbc-map.js` | Ingest + workbench ordering |
| `barcode.js` / `zebraPrint.js` | Sample labels |
| `design-2-clinical.js` | Imported by design-3 |
| Manual device ref CRUD | Admin UI still live |
| `LaboratoryReport.jsx` | Preview until SSR/unified HTML |

---

## 9. Quick reference — file disposition

| File / area | Verdict |
|-------------|---------|
| `pdf-template.js`, `pdf-results-table.js`, `pdf-i18n.js` | **Delete** |
| `ai-interpretation.service.js` | **Delete or wire** |
| `labelPrintHtml.js` | **Delete** |
| `device-reference-ranges` sync functions | **Delete** (phase C) |
| `sync-device-reference-ranges.js` | **Remove from boot**; keep stub or delete |
| `design-1` / `design-2` PDF | **Archive** (env override only) |
| `labReportPrint.js` (×2) | **Remove** after server-PDF-only |
| `LaboratoryReport.jsx` (×2) | **Merge** later, not delete yet |
| `sync-norma-references.js` | **Keep** (LIMS seed boot) |
| `norma-ref-debug` | **Keep** |
| Untracked `ar-*` / `canvas-*` scripts | **Ignore / gitignore** |

---

*End of DEAD_CODE_REPORT — static analysis snapshot; re-run import grep after major refactors.*
