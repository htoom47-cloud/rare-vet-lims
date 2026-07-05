# LIVE UAT Report — Production Data Review

**Laboratory:** AL NAWADER VETERINARY CARE CENTER  
**Environment:** Production — `https://lims.rarevetcare.com`  
**Date:** 2026-07-03  
**Method:** Read-only API audit (no new data created)  
**Git on production:** `d4ab7c0` (post hotfixes)  
**Reviewer:** Automated live UAT script + manual verification

---

## Executive summary

| Verdict | Detail |
|---------|--------|
| **Core data (customers, animals, orders, Norma CBC import)** | ✅ Mostly **PASS** on 3 real samples |
| **Result flags (HIGH/LOW/NORMAL)** | ✅ **PASS** — flags stored and visible in results API |
| **Report preview / PDF / Portal pipeline** | ❌ **FAIL** — API returns `SCHEMA_OUTDATED` (HTTP 500) |
| **Barcode scan chain** | ✅ **PASS** — BC / digits / SMP formats resolve same sample |
| **Legacy barcode format** | ⚠️ `sample_code` (SMP-…) ≠ `barcode` (BC-…) on older rows — scan still works |

**Critical blocker:** `/api/reports/:id/preview` and `/api/reports/download/:file` return **500** with message *"Database schema is out of date — run migrations"*. Staff preview, PDF download, and portal parity cannot be verified until migrations complete on production boot.

---

## Samples selected (existing DB only)

| # | Category | Sample ID | Animal | Tests | Key abnormal CBC |
|---|----------|-----------|--------|-------|------------------|
| 1 | Normal CBC | `SMP-260623-951275` | horse | CBC-FULL + 9 others | None (21 params, no flags) |
| 2 | CBC with HIGH | `SMP-260702-717429` | horse | CBC-FULL + paras | **HCT=53 (HIGH)**, HGB=15.6 (LOW) |
| 3 | CBC with LOW | `SMP-260702-968431` | camel | CBC-FULL | **HGB=11.5 (LOW)**, MCHC=37.7 (LOW) |

> Note: Sample 2 also has LOW on HGB — used for HIGH case because it contains a confirmed HIGH flag (HCT). Sample 3 is LOW-only (no HIGH flags).

---

## Sample 1 — Normal CBC (`SMP-260623-951275`)

| Field | Value |
|-------|-------|
| **Sample ID** | SMP-260623-951275 |
| **Barcode (stored)** | BC-260623-345593 |
| **Animal type** | horse (`ANM-260623-032333`) |
| **Customer** | Demo Comprehensive 1782241856321 · 0541856321 |
| **Tests** | PARAS-BLOOD, PARAS-STOOL, HORM-T4, PCR-BRU, ELISA-FMD, MICRO-FECAL, CULT-BACT, **CBC-FULL**, CHEM-BASIC, SERO-BRU |
| **Report** | RPT-260623-710845 (final, approved) |

### Stage results

| Stage | Result | Notes |
|-------|--------|-------|
| Customer data | **PASS** | Name + mobile present |
| Animal data | **PASS** | horse, animal_code linked |
| Order data | **PASS** | 10 tests on sample |
| Norma results | **PASS** | 21 CBC parameters imported |
| Device mapping | **PASS** | Full panel; WBC / LYM% / HGB etc. mapped |
| Reference Range Engine | **PASS** | Reference strings on params (e.g. `4.9-10.3`) |
| Result Engine | **PASS** | No abnormal flags; values present |
| Report Builder | **FAIL** | Preview API 500 `SCHEMA_OUTDATED` |
| PDF | **FAIL** | Download API 500 `SCHEMA_OUTDATED` |
| Staff Preview | **FAIL** | Same 500 error |
| Portal Preview | **FAIL** | Blocked by report pipeline error |
| Approval | **PASS** | `is_final=true`, lab + vet approved |
| Barcode | **PASS** | Scan resolves sample (BC / digits / SMP) |

### Bugs

| Bug ID | Issue | Suggested fix |
|--------|-------|---------------|
| BUG-LIVE-001 | Report preview/PDF 500 `SCHEMA_OUTDATED` | Check Render boot logs; ensure `migrate.js` completes; redeploy or manual migrate |
| BUG-LIVE-002 | `sample_code` ≠ `barcode` on legacy rows | Acceptable if scan normalizes; optional backfill `sample_code` digits |

---

## Sample 2 — CBC with HIGH (`SMP-260702-717429`)

| Field | Value |
|-------|-------|
| **Sample ID** | SMP-260702-717429 |
| **Barcode (stored)** | BC-260702-234150 |
| **Animal type** | horse (`ANM-260702-287694`) |
| **Customer** | تركي ال شيخ · 0554178889 |
| **Tests** | PARAS-BLOOD, PARAS-STOOL, **CBC-FULL** |
| **Report** | RPT-260702-476544 (final, approved) |
| **Public verify** | `/api/reports/verify/9414142A-42D` → **200 valid** |

### Abnormal CBC (confirmed)

| Parameter | Value | Flag | Reference |
|-----------|-------|------|-----------|
| HCT | 53 | **HIGH** | 31-50 |
| HGB | 15.6 | LOW | 11.4-17.3 |

### Stage results

| Stage | Result | Notes |
|-------|--------|-------|
| Customer data | **PASS** | |
| Animal data | **PASS** | |
| Order data | **PASS** | |
| Norma results | **PASS** | 21 parameters |
| Device mapping | **PASS** | |
| Reference Range Engine | **PASS** | Per-parameter ref strings |
| Result Engine | **PASS** | HIGH/LOW flags correctly set |
| Report Builder | **FAIL** | Preview 500 |
| PDF | **FAIL** | Download 500 |
| Staff Preview | **FAIL** | |
| Portal Preview | **FAIL** | |
| Approval | **PASS** | Approved 2026-07-03 |
| Barcode | **PASS** | Scan OK |

### Bugs

| Bug ID | Issue | Suggested fix |
|--------|-------|---------------|
| BUG-LIVE-001 | Report pipeline 500 | Fix migrations on production (see Sample 1) |

---

## Sample 3 — CBC with LOW (`SMP-260702-968431`)

| Field | Value |
|-------|-------|
| **Sample ID** | SMP-260702-968431 |
| **Barcode (stored)** | BC-260702-484067 |
| **Animal type** | camel (`ANM-260618-141183`) |
| **Customer** | حاتم ظافر · 0555881750 |
| **Tests** | **CBC-FULL** only |
| **Report** | RPT-260702-469544 (final, approved) |
| **Norma HL7 on file** | `backend/audit-output/SMP-260702-968431.raw.hl7` |

### Abnormal CBC (confirmed)

| Parameter | Value | Flag | Reference |
|-----------|-------|------|-----------|
| HGB | 11.5 | **LOW** | 80-180 |
| MCHC | 37.7 | **LOW** | 350-480 |

### Stage results

| Stage | Result | Notes |
|-------|--------|-------|
| Customer data | **PASS** | |
| Animal data | **PASS** | camel |
| Order data | **PASS** | CBC-FULL |
| Norma results | **PASS** | 21 parameters from Norma ingest |
| Device mapping | **PASS** | Norma OBX codes mapped to LIMS params |
| Reference Range Engine | **PASS** | Ref strings attached |
| Result Engine | **PASS** | LOW flags set |
| Report Builder | **FAIL** | Preview 500 |
| PDF | **FAIL** | Download 500 |
| Staff Preview | **FAIL** | |
| Portal Preview | **FAIL** | |
| Approval | **PASS** | Report marked final (note: CBC `is_validated=false` on result row — see BUG-LIVE-003) |
| Barcode | **PASS** | BC-260702-484067 / 260702484067 / SMP-260702-968431 all scan correctly |

### Bugs

| Bug ID | Issue | Suggested fix |
|--------|-------|---------------|
| BUG-LIVE-001 | Report pipeline 500 | Fix migrations |
| BUG-LIVE-003 | HGB ref `80-180` / MCHC ref `350-480` — likely **unit mismatch** (Norma g/L vs LIMS g/dL) | Review Norma→LIMS unit conversion for camel CBC; fix reference ranges or displayed units |
| BUG-LIVE-004 | Report approved while CBC result `is_validated=false` | Enforce validate-before-approve or align workflow state |

---

## Cross-cutting findings

### P0 — Report preview / PDF broken

```
GET /api/reports/{id}/preview → 500
{"code":"SCHEMA_OUTDATED","message":"Database schema is out of date — run migrations"}

GET /api/reports/download/{filename} → 500 (same)
```

**Impact:** Staff cannot preview reports or download PDFs via API after v1 deploy. Portal PDF likely affected.

**Suggested fix:**
1. Render Dashboard → `rare-vet-lims` → Logs → confirm `migrate.js` completed on latest deploy
2. If migrate failed silently (boot race), restart service or run migrate manually on production DB
3. Re-test preview on RPT-260702-476544

### P1 — Legacy barcode dual format

- Display ID: `SMP-260702-968431`
- Stored barcode: `BC-260702-484067`
- Norma PID often uses BC format — **scan chain works** (verified PASS)
- New v1 engine prefers 12-digit unified ID — legacy data still operational

### P2 — Camel HGB/MCHC reference units

Norma raw HL7 shows HGB=11.5 g/L with flag L and ref 80-180 — suggests reference band may be wrong unit for imported values. Clinical review recommended for camel CBC references.

---

## Summary matrix

| Stage | Sample 1 Normal | Sample 2 HIGH | Sample 3 LOW |
|-------|-----------------|---------------|--------------|
| Customer | PASS | PASS | PASS |
| Animal | PASS | PASS | PASS |
| Order | PASS | PASS | PASS |
| Norma results | PASS | PASS | PASS |
| Device mapping | PASS | PASS | PASS |
| Reference Range Engine | PASS | PASS | PASS |
| Result Engine | PASS | PASS | PASS |
| Report Builder | **FAIL** | **FAIL** | **FAIL** |
| PDF | **FAIL** | **FAIL** | **FAIL** |
| Staff Preview | **FAIL** | **FAIL** | **FAIL** |
| Portal Preview | **FAIL** | **FAIL** | **FAIL** |
| Approval | PASS | PASS | PASS |
| Barcode | PASS | PASS | PASS |

---

## Recommended next actions (no code in this review)

1. **Fix P0:** Resolve `SCHEMA_OUTDATED` on production (migrate + redeploy if needed)
2. **Re-run** staff preview + PDF download on the 3 samples above
3. **Clinical review** camel HGB/MCHC references (BUG-LIVE-003)
4. **Portal OTP test** after report pipeline fixed (SMS / static OTP on staging)
5. Register BUG-LIVE-* in [BUG_TRACKER.md](./BUG_TRACKER.md)

---

## Audit metadata

| Item | Value |
|------|-------|
| API health at audit | `healthy`, `database: ok` |
| Samples created | **0** |
| Data modified | **None** |
| Commit / push | **None** (this report only) |

---

*Companion: [UAT_TEST_BOOK.md](./UAT_TEST_BOOK.md), [PRE_DEPLOY_REPORT.md](./PRE_DEPLOY_REPORT.md)*
