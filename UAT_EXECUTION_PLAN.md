# UAT Execution Plan — Rare Vet LIMS v1.0

**Laboratory:** AL NAWADER VETERINARY CARE CENTER  
**Branch:** `release/v1-uat`  
**Commit reference:** `b831aad` — *LIMS v1 release candidate*  
**Environment:** UAT / staging (not production deploy)  
**Total test cases:** 225 ([UAT_TEST_BOOK.md](./UAT_TEST_BOOK.md))  
**Go-live gate:** [GO_LIVE_CHECKLIST.md](./GO_LIVE_CHECKLIST.md)

---

## Purpose

This plan schedules all 225 UAT test cases across **5 working days**, assigns owners, defines required test data, success criteria, and failure handling. It does **not** replace the detailed steps in `UAT_TEST_BOOK.md` — testers must mark Pass/Fail there and log defects in [BUG_TRACKER.md](./BUG_TRACKER.md).

---

## Prerequisites (before Day 1)

| Item | Owner | Status |
|------|-------|--------|
| UAT environment deployed from `release/v1-uat` (staging URL, **not** production `main`) | IT / Deploy | ☐ |
| `/api/health` returns `database: ok` | IT | ☐ |
| UAT accounts created: admin, reception ×2, lab_technician ×2, doctor, manager, accountant | IT + Lab Manager | ☐ |
| Test customers seeded or ready to create (Arabic + English names) | Reception lead | ☐ |
| Reference ranges populated (camel, horse minimum) | Lab specialist | ☐ |
| Test catalog verified (CBC-FULL, CHEM panel, Parasitology, ELISA, PCR) | Lab Manager | ☐ |
| `BUG_TRACKER.md` accessible; session header template copied | UAT coordinator | ☐ |

**Session header (copy at start of each day):**

```text
UAT Day: __ | Session: __________ | Tester: __________ | Env: staging | Date: __________ | Git SHA: b831aad
```

---

## Roles (who executes)

| Role | Abbrev | Responsibilities |
|------|--------|------------------|
| **UAT Coordinator** | UC | Schedule, sign-off sheets, Go/No-Go meeting |
| **Reception lead** | REC | Customers, animals, orders, samples, billing, barcode scan at desk |
| **Lab technician** | LAB | Norma, devices, result entry, validation, inventory |
| **Lab specialist / Doctor** | DOC | Report approve, ref ranges spot-check, medical sign-off |
| **IT / Deploy** | IT | Bridge, Zebra, backup, security scripts, performance, deploy checks |
| **Accountant** | ACC | Billing, VAT, payments, invoice PDF |
| **Lab Manager** | MGR | Permissions spot-check, workflow decision, final approval |

---

## Day overview

| Day | Theme | Test IDs | Count | GO_LIVE sections |
|-----|-------|----------|-------|------------------|
| **1** | العملاء، الحيوانات، الطلبات، العينات | UAT-CUS, UAT-ANI, UAT-ORD, UAT-SMP | 35 | §1 DB (partial), §2 Users (login smoke) |
| **2** | Barcode, Zebra, Norma | UAT-DEV, UAT-BAR, UAT-ZEB, UAT-NRM | 36 | §4 Printers, §5 Scanner, §6 Norma |
| **3** | النتائج، التقارير، PDF، Portal | UAT-DIA*, UAT-MIN*, UAT-ELI, UAT-PCR, UAT-RPT, UAT-PDF, UAT-PRT | 80 | §7–§11 Reports, Portal, SMS |
| **4** | الفواتير، الصلاحيات، Workflow | UAT-BIL, UAT-USR, UAT-ROL, UAT-WFL, UAT-INV, UAT-NOT | 54 | §3 Roles, §12 Billing, §13 Workflow, §10 SMS |
| **5** | Backup, Security, Performance, Go/No-Go | UAT-BAK, UAT-RES, UAT-DEP, UAT-PRF, UAT-SEC + checklist | 40 + review | §14–§16, Final approval |

\* Diasys / Mini Vidas: mark **N/A** in test book if device not present; document in session notes.

---

## Day 1 — العملاء، الحيوانات، الطلبات، العينات

**Date:** _______________  
**Lead:** REC + UC  
**Goal:** End-to-end reception flow from customer registration through sample creation and lab queue visibility.

### الاختبارات المطلوبة

| Block | Test IDs | Count |
|-------|----------|-------|
| Customers | UAT-CUS-001 → UAT-CUS-008 | 8 |
| Animals | UAT-ANI-001 → UAT-ANI-008 | 8 |
| Orders | UAT-ORD-001 → UAT-ORD-007 | 7 |
| Samples | UAT-SMP-001 → UAT-SMP-012 | 12 |

**Critical path (must pass before Day 2):** UAT-CUS-001, UAT-ANI-001, UAT-ORD-001, UAT-SMP-001, UAT-SMP-002, UAT-SMP-003, UAT-SMP-007.

### من ينفذها

| Role | Tests |
|------|-------|
| REC | CUS-001–008, ANI-001–008, ORD-001–007, SMP-001–012 |
| UC | Audit spot-check (CUS-007, ANI-008), summary sheet update |
| LAB | SMP-010 (lab queue visibility) |
| IT | SMP-012 (API GET optional verification) |

### البيانات المطلوبة

- 3 test customers: Arabic name, English name, duplicate-mobile test mobile
- 2 animals per customer minimum (camel + horse for ref-range Day 3 prep)
- WorkflowCase access with CBC-FULL, CHEM panel, package, parasitology catalog entries
- Reception + admin credentials
- USB barcode scanner (keyboard wedge) for SMP-007

### معايير النجاح

- **Day 1 pass rate:** ≥ 90% of executed cases (≥ 32/35 Pass)
- **Zero P0 bugs** open from Day 1 modules
- Sample created with valid 12-digit `sample_code` = `barcode`
- Customer duplicate mobile blocked (CUS-003)
- At least **5 samples** created and retained for Days 2–3 (CBC, CBC+Chem, parasitology, ELISA, PCR)

### ماذا نفعل عند الفشل

| Severity | Action |
|----------|--------|
| **P0** (cannot create customer/animal/sample) | Stop Day 2; log BUG in tracker; IT investigates env/permissions; retry after fix |
| **P1** (feature broken, workaround exists) | Continue Day 2; defer case; fix before Day 5 |
| **Duplicate mobile / validation** | Document expected behavior; if wrong, assign P0/P1 per impact |
| **Audit missing** | Log P2 unless compliance requires P1 |

**End-of-day:** Update UAT summary sheet (Customers, Animals, Orders, Samples rows). REC signs Day 1 section.

---

## Day 2 — Barcode, Zebra, Norma

**Date:** _______________  
**Lead:** IT + LAB  
**Goal:** Physical label chain and Norma CBC import validated on real hardware.

### الاختبارات المطلوبة

| Block | Test IDs | Count |
|-------|----------|-------|
| Devices (general) | UAT-DEV-001 → UAT-DEV-006 | 6 |
| Barcode | UAT-BAR-001 → UAT-BAR-010 | 10 |
| Zebra | UAT-ZEB-001 → UAT-ZEB-008 | 8 |
| Norma | UAT-NRM-001 → UAT-NRM-012 | 12 |

**Critical path:** DEV-002, DEV-003, BAR-001, BAR-004, BAR-008, ZEB-001, ZEB-002, ZEB-005, NRM-001, NRM-002, NRM-004, NRM-005, NRM-010.

**Script gate:** UAT-BAR-010 (`verify-barcode-engine.js` → 15/15).

### من ينفذها

| Role | Tests |
|------|-------|
| IT | DEV-001–006, ZEB-001, ZEB-007–008, NRM-001, NRM-012, BAR-010 |
| REC | BAR-003, BAR-004, BAR-007, ZEB-002–006 (reception PC + printer) |
| LAB | NRM-002–011 (Norma operator + result verification) |
| UC | BAR-006 invalid scan, session documentation |

### البيانات المطلوبة

- Day 1 samples (minimum 3 with CBC ordered)
- Zebra printer loaded with **50×25 mm** labels; bridge on reception PC (`localhost:9101`)
- Norma configured: LIS IP = lab PC, port **21110**; `norma-listener.js` running
- Norma device registered in LIMS; **API key regenerated** and in `bridge.env`
- USB scanner at reception
- Lab PC network access to staging API (not production)

### معايير النجاح

- **Day 2 pass rate:** ≥ 85% (≥ 31/36); **100% on critical path**
- Label prints; Code128 = sample ID digits only; Arabic name on label readable
- Scan label → correct sample opens in LIMS
- Full CBC import: WBC and LYM% **not swapped** (NRM-004, NRM-005)
- Device API key shown once on regenerate; list shows masked key only (DEV-003, DEV-004)
- GO_LIVE §4, §5, §6 items marked ✓ for tested items

### ماذا نفعل عند الفشل

| Failure | Action |
|---------|--------|
| Zebra bridge offline | IT restarts bridge; retry ZEB-001; if hardware fault, use spare PC — **blocks go-live** until resolved |
| Norma no import | Check listener port, API key, PID sample ID match; log P0; do not proceed to report UAT on that sample |
| WBC/LYM% swap | **P0** — stop Norma go-live; log BUG; verify device mapping before Day 3 |
| Barcode scan fails | Calibrate scanner wedge; verify BAR-001 content; IT runs verify-barcode-engine |
| Invalid API key not 401 | **P0 security** — escalate to IT immediately |

**End-of-day:** At least **2 samples with imported CBC results** ready for Day 3 reports. IT signs Norma + Zebra; REC signs barcode.

---

## Day 3 — النتائج، التقارير، PDF، Portal

**Date:** _______________  
**Lead:** LAB + DOC + IT  
**Goal:** Result lifecycle through approved report, official PDF, and customer portal parity.

### الاختبارات المطلوبة

| Block | Test IDs | Count | Notes |
|-------|----------|-------|-------|
| Diasys | UAT-DIA-001 → UAT-DIA-008 | 8 | N/A if no device |
| Mini Vidas | UAT-MIN-001 → UAT-MIN-006 | 6 | N/A if no device |
| ELISA | UAT-ELI-001 → UAT-ELI-006 | 6 | Manual entry |
| PCR | UAT-PCR-001 → UAT-PCR-006 | 6 | Manual entry |
| Reports | UAT-RPT-001 → UAT-RPT-012 | 12 | |
| PDF | UAT-PDF-001 → UAT-PDF-010 | 10 | |
| Portal | UAT-PRT-001 → UAT-PRT-012 | 12 | SMS/OTP required |

**Critical path:** ELI-001–002, PCR-001–003, RPT-001, RPT-005, RPT-007, RPT-008, PDF-001, PDF-004, PRT-005, PRT-006, PRT-007.

**Script gates:** RPT-012 (12/12), PDF-009 (13/13), PRT-012 (15/15).

### من ينفذها

| Role | Tests |
|------|-------|
| LAB | DIA*, MIN*, ELI, PCR, RPT-001–007, RPT-011 |
| DOC | RPT-008, RPT-009, RPT-010 (approve, return, verify link) |
| IT | PDF scripts, PRT-010 rate limit, portal env (`PORTAL_OTP_STATIC`, SMS) |
| REC | PRT-001–003 with real test mobile (OTP) |
| UC | PDF-004 preview vs PDF side-by-side sign-off |

\* Execute or mark N/A with manager approval.

### البيانات المطلوبة

- Day 2 samples with CBC imported + new samples for ELISA/PCR
- Parasitology sample with uploaded microscopy image (`include_in_report`)
- CBC + Chem combined sample
- Staging portal URL; Msegat SMS enabled for OTP tests (or document static OTP for staging only)
- Doctor + technician credentials
- `REPORT_DESIGN=3` on UAT environment

### معايير النجاح

- **Day 3 pass rate:** ≥ 85% of **executed** cases (exclude documented N/A)
- Report preview sections match PDF and portal (PDF-004, PRT-006)
- Doctor approval recorded; public `/verify/:code` works (RPT-010)
- Portal shows **published only**; draft hidden (PRT-005)
- PDF generation **< 20s** (PDF-008, PRF-003 overlap)
- GO_LIVE §9–§11 items for tested scope marked ✓

### ماذا نفعل عند الفشل

| Failure | Action |
|---------|--------|
| Preview ≠ PDF | **P0** for go-live; log BUG; IT runs verify-report-preview-pdf-consistency |
| Portal shows draft | Check publish workflow; P0 if customer data leak risk |
| OTP/SMS fails | Verify Msegat creds; staging may use static OTP — document; P1 if prod SMS required at go-live |
| Arabic broken in PDF | P1 minimum; P0 if unreadable on official report |
| Approve before validate | Process training; if system allows invalid state, log P0 |

**End-of-day:** ≥ 1 **fully approved + portal-published** report package (sample ID documented). DOC signs medical/report section.

---

## Day 4 — الفواتير، الصلاحيات، Workflow

**Date:** _______________  
**Lead:** ACC + MGR + UC  
**Goal:** Financial flow, RBAC enforcement, workflow engine decision documented.

### الاختبارات المطلوبة

| Block | Test IDs | Count |
|-------|----------|-------|
| Billing | UAT-BIL-001 → UAT-BIL-012 | 12 |
| Users | UAT-USR-001 → UAT-USR-008 | 8 |
| Roles | UAT-ROL-001 → UAT-ROL-008 | 8 |
| Workflow | UAT-WFL-001 → UAT-WFL-010 | 10 |
| Inventory | UAT-INV-001 → UAT-INV-008 | 8 |
| Notifications | UAT-NOT-001 → UAT-NOT-008 | 8 |

**Critical path:** BIL-001, BIL-002, BIL-004, BIL-005, ROL-001, ROL-003, ROL-004, WFL-006, WFL-007, USR-003.

**Script gate:** WFL-010 (`verify-laboratory-workflow.js` → 36/36).

### من ينفذها

| Role | Tests |
|------|-------|
| ACC | BIL-001–012 |
| MGR | USR-001–008, ROL-001–008, WFL-001–002 decision |
| REC | BIL-011, ROL-001, ROL-004, WFL-007 |
| LAB | INV-001–008, WFL-003–005 |
| DOC | ROL-003 |
| IT | WFL-005, WFL-010, NOT-008 poller |

### البيانات المطلوبة

- Samples from Days 1–3 for invoice linking
- VAT number `311042487300003` for verification
- Role accounts: reception, technician, doctor, manager, admin (no shared passwords)
- Workflow flag test plan: document `WORKFLOW_ENGINE_ENABLED=true` **or** `false` for go-live
- Inventory test item (reagent name, min stock)
- SMS queue access (admin) for NOT tests

### معايير النجاح

- **Day 4 pass rate:** ≥ 90% (≥ 49/54)
- Invoice linked to sample; VAT correct; payment updates balance
- Reception **cannot** approve report (ROL-004)
- Doctor **can** approve (ROL-003)
- Workflow publish blocked before approve (WFL-006)
- **Written decision** on `WORKFLOW_ENGINE_ENABLED` for production (GO_LIVE §13)
- GO_LIVE §3, §12, §13 marked ✓ for tested items

### ماذا نفعل عند الفشل

| Failure | Action |
|---------|--------|
| Wrong VAT / totals | P0 for billing go-live; ACC verifies catalog prices |
| Permission bypass (reception approves) | **P0 security** — stop; IT fixes before Day 5 |
| Workflow blocks normal ops | Set flag false for go-live; document in KNOWN_LIMITATIONS |
| User can login when deactivated | P0 — USR-003 must Pass |

**End-of-day:** MGR signs roles + workflow decision memo. ACC signs billing.

---

## Day 5 — Backup, Security, Performance, Final Go/No-Go

**Date:** _______________  
**Lead:** IT + UC + MGR  
**Goal:** Operational resilience, security P0 verification, performance baselines, formal Go/No-Go.

### الاختبارات المطلوبة

| Block | Test IDs | Count |
|-------|----------|-------|
| Backup | UAT-BAK-001 → UAT-BAK-008 | 8 |
| Restore | UAT-RES-001 → UAT-RES-006 | 6 |
| Deploy | UAT-DEP-001 → UAT-DEP-006 | 6 |
| Performance | UAT-PRF-001 → UAT-PRF-008 | 8 |
| Security | UAT-SEC-001 → UAT-SEC-012 | 12 |

**Plus:** Full walkthrough of [GO_LIVE_CHECKLIST.md](./GO_LIVE_CHECKLIST.md) (all 16 sections).

**Script gates (must all pass):**

| Script | Expected |
|--------|----------|
| `verify-security-phase9.js` | 20/20 |
| `verify-reference-range-engine.js` | pass |
| `verify-result-engine.js` | pass |
| `verify-report-builder.js` | 12/12 |
| `verify-barcode-engine.js` | 15/15 |
| `verify-portal-sync.js` | 15/15 |
| `verify-laboratory-workflow.js` | 36/36 |

### من ينفذها

| Role | Tests |
|------|-------|
| IT | BAK, RES, DEP, PRF, SEC-001–012, all verify scripts, GO_LIVE §1 §14–§16 |
| MGR | GO_LIVE final approval table, bug P0 review |
| UC | UAT summary sheet totals, Go/No-Go minutes |
| DOC | Medical sign-off if all report tests passed |
| LAB | PRF-002 Norma import timing (if Norma used) |

### البيانات المطلوبة

- Staging DB + uploads path (for backup/restore drill — **never on production patient data without approval**)
- Render dashboard access (read-only for env verification)
- `BACKUP_AND_ROLLBACK.md` printed or shared
- Complete UAT summary sheet from Days 1–4
- BUG_TRACKER with all P0 status

### معايير النجاح

- **Day 5 pass rate:** 100% on **SEC** and **BAK/RES critical** (BAK-001, BAK-006, RES-001, RES-004, SEC-001, SEC-002, SEC-011)
- All verify scripts green on UAT environment
- **BUG_TRACKER P0 = 0 open** (GO_LIVE §16)
- GO_LIVE_CHECKLIST: all **P0 items ✓**
- UAT summary: **≥ 90% overall pass** (≥ 203/225) OR documented conditional acceptance with signed waiver

### ماذا نفعل عند الفشل

| Failure | Action |
|---------|--------|
| Backup fails | **No-Go** until backup cron + manual backup verified |
| Restore drill fails | **No-Go** for production; repeat on staging copy |
| SEC-001 rate limit fails | **No-Go** — P0 security regression |
| verify-security-phase9 fails | **No-Go** — fix on `release/v1-uat`, re-run Day 5 |
| Performance over threshold | P1 unless >2× limit → conditional Go with monitoring plan |
| Any open P0 bug | **No-Go** until closed and verified |

### Final Go/No-Go meeting (end of Day 5)

**Attendees:** UC, MGR, IT, DOC, REC lead, ACC

| Decision | Criteria |
|----------|----------|
| **Go** | P0=0, GO_LIVE checklist complete, ≥90% UAT pass, signed signatories |
| **Conditional Go** | P1 only; written mitigation + date; director approval |
| **No-Go** | Any P0 open, security fail, backup/restore fail, Norma critical path fail |

**Outputs:**

1. Completed UAT summary sheet in `UAT_TEST_BOOK.md`
2. Updated `BUG_TRACKER.md` dashboard
3. Signed GO_LIVE_CHECKLIST final approval section
4. Decision recorded: Go / Conditional / No-Go with reason

---

## Cross-day dependencies

```text
Day 1 samples ──► Day 2 labels + Norma import ──► Day 3 reports/portal
                                                      │
Day 4 billing ◄── linked samples ◄──────────────────┘
Day 5 gates ◄── all days + scripts + GO_LIVE checklist
```

| If Day N fails critically | Impact |
|---------------------------|--------|
| Day 1 | Delay all subsequent days |
| Day 2 | Day 3 report tests blocked for CBC path |
| Day 3 | No-Go likely regardless of Day 4–5 |
| Day 4 | Conditional Go possible if billing not day-1 requirement |
| Day 5 | Blocks production merge of `release/v1-uat` → `main` |

---

## Daily reporting template

Copy to team channel / email at end of each day:

```text
UAT Day N — YYYY-MM-DD
Executed: __ / Planned: __
Passed: __ | Failed: __ | Blocked/N/A: __
P0 opened today: __
P0 closed today: __
Critical path: Pass / Fail
Tomorrow ready: Yes / No — blockers: __________
Signed: __________
```

---

## Related documents

- [UAT_TEST_BOOK.md](./UAT_TEST_BOOK.md) — detailed steps (225 cases)
- [GO_LIVE_CHECKLIST.md](./GO_LIVE_CHECKLIST.md) — production gate
- [BUG_TRACKER.md](./BUG_TRACKER.md) — defect log
- [POST_GO_LIVE_CHECKLIST.md](./POST_GO_LIVE_CHECKLIST.md) — after Go decision
- [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md) — accepted gaps
- [BACKUP_AND_ROLLBACK.md](./BACKUP_AND_ROLLBACK.md) — Day 5 procedures
- [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) — deploy steps (staging only during UAT)

---

*Document version: 1.0 | Created: 2026-07-03 | Branch: release/v1-uat*
