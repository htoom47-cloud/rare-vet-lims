# Testing Checklist — Rare Vet LIMS

> **Phase 0 — Safety Baseline**  
> **Use:** Before/after any change to reports, devices, barcode, migrations, or reference ranges  
> **Companion:** [CHANGE_CONTROL.md](./CHANGE_CONTROL.md), [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)

---

## How to use

| Column | Meaning |
|--------|---------|
| ☐ | Not tested |
| ✓ | Passed |
| ✗ | Failed — block deploy |

Record **date**, **tester**, **environment** (local / staging / prod), and **git SHA** at the top of each run.

```markdown
Run: 2026-07-03 | Tester: Name | Env: staging | SHA: abc1234
```

**Pass criteria:** Expected outcome matches without console errors, wrong PDF layout, or data loss.

---

## 0. Pre-flight (optional but recommended)

| ☐ | Step | Pass criteria |
|---|------|---------------|
| ☐ | `GET /api/health` | `database: ok`, `status: healthy` |
| ☐ | `node backend/src/scripts/verify-system-health.js` | Exit code 0 |
| ☐ | Staff login | Dashboard loads for admin |
| ☐ | Portal OTP (if testing portal) | Login succeeds |

---

## 1. إنشاء عميل (Create customer)

| ☐ | Step | Pass criteria |
|---|------|---------------|
| ☐ | Reception → Customers → Add | Form saves without error |
| ☐ | Search by mobile | New customer appears |
| ☐ | API: `POST /api/customers` | `201`, valid UUID returned |

**Data to note:** `customer_id`, mobile number for portal test later.

---

## 2. إنشاء حيوان (Create animal)

| ☐ | Step | Pass criteria |
|---|------|---------------|
| ☐ | Link animal to customer | Owner name correct |
| ☐ | Set `animal_type` (e.g. camel) | Saved and shown in UI |
| ☐ | Animal code generated | Unique code visible |

**Data to note:** `animal_id`, `animal_type` for reference ranges.

---

## 3. إنشاء عينة (Create sample)

| ☐ | Step | Pass criteria |
|---|------|---------------|
| ☐ | Select customer + animal | Required fields enforced |
| ☐ | Order at least one test (or package) | `sample_tests` created |
| ☐ | Sample status | Starts as `pending` / `received` as expected |
| ☐ | Sample code + barcode assigned | Visible on sample detail |

**Data to note:** `sample_id`, `barcode`, ordered test codes.

---

## 4. طباعة باركود (Print barcode label)

| ☐ | Step | Pass criteria |
|---|------|---------------|
| ☐ | Open print label from Samples or Workflow | Modal opens |
| ☐ | Preview shows Code128 + sample fields | Matches sample barcode digits |
| ☐ | Print to Zebra (or save ZPL) | Label readable by scanner |
| ☐ | Re-scan printed barcode | `GET /api/samples/scan/:barcode` returns same sample |

**Scripts:** `node backend/src/scripts/verify-barcode-norma-chain.js` (barcode ↔ Norma PID chain)

---

## 5. استقبال نتيجة Norma (Norma result ingest)

| ☐ | Step | Pass criteria |
|---|------|---------------|
| ☐ | Bridge or `POST /api/devices/ingest/:deviceId` with HL7 | `200`, message stored |
| ☐ | Sample matched by barcode/PID | `device_messages.sample_id` set |
| ☐ | CBC parameters mapped | Values in workbench for `CBC-FULL` |
| ☐ | Flags / units | No mass unmapped parameters |

**Prerequisites:** Norma device active, API key configured, sample barcode matches HL7 PID.

**Scripts:**

```bash
cd backend
node src/scripts/verify-barcode-norma-chain.js
node src/scripts/verify-norma-ref-chain.js
```

---

## 6. إدخال نتيجة يدوي (Manual result entry)

| ☐ | Step | Pass criteria |
|---|------|---------------|
| ☐ | Technician workbench → select sample test | Parameters listed |
| ☐ | Enter values for non-device test (e.g. chemistry or paras) | Save succeeds |
| ☐ | Abnormal value | Flag H/L shown when ref exists |
| ☐ | Re-open sample test | Values persisted |

---

## 7. اعتماد تقرير (Validate / approve results)

| ☐ | Step | Pass criteria |
|---|------|---------------|
| ☐ | Validate results (`POST /api/results/validate/:sampleTestId`) | `is_validated: true` |
| ☐ | Vet review / specialist flow (if used) | Status blocks report until validated |
| ☐ | Optional: lab + vet report approval | Approval fields on report record |

---

## 8. توليد PDF (Generate PDF report)

| ☐ | Step | Pass criteria |
|---|------|---------------|
| ☐ | Reports → Generate for completed sample | `201`, `pdf_url` returned |
| ☐ | Download PDF (staff) | File opens, Arabic renders correctly |
| ☐ | QR / report number | Matches verification code |
| ☐ | Sections match ordered tests only | No empty chemistry block on CBC-only order |

**Design:** Production default `REPORT_DESIGN=3` (Puppeteer HTML).

---

## 9. فتح التقرير من بوابة العميل (Portal report view)

| ☐ | Step | Pass criteria |
|---|------|---------------|
| ☐ | Portal OTP login with customer mobile | Token issued |
| ☐ | Reports list shows new report | Correct animal / date |
| ☐ | Preview (`GET /api/portal/reports/:id/preview`) | JSON loads, sections present |
| ☐ | Download PDF from portal | Same report number as staff PDF |

---

## 10. تقرير CBC فقط (CBC-only report)

| ☐ | Step | Pass criteria |
|---|------|---------------|
| ☐ | Sample with **CBC-FULL** only, validated Norma results | — |
| ☐ | Generate report | PDF contains hematology section |
| ☐ | No spurious sections | Chemistry / paras sections **omitted** |
| ☐ | Reference ranges | Shown for camel (or test species) from LIMS refs |

---

## 11. تقرير Chemistry فقط (Chemistry-only report)

| ☐ | Step | Pass criteria |
|---|------|---------------|
| ☐ | Sample with chemistry panel only, manual validated results | — |
| ☐ | Generate report | Chemistry section present |
| ☐ | CBC section absent | Unless CBC also ordered |

---

## 12. تقرير باقة كاملة (Full panel / package report)

| ☐ | Step | Pass criteria |
|---|------|---------------|
| ☐ | Register sample with multi-test package or multiple panels | All `sample_tests` listed |
| ☐ | Complete + validate all ordered tests | — |
| ☐ | Generate report | Multiple sections appear in correct order |
| ☐ | Pagination | No clipped Arabic text / overlap (Design 3) |

---

## 13. تقرير مع صور طفيليات (Parasitology with images)

| ☐ | Step | Pass criteria |
|---|------|---------------|
| ☐ | Upload attachment on paras sample test | `POST .../attachments` succeeds |
| ☐ | Set `include_in_report: true` (if toggled off first) | PATCH attachment |
| ☐ | Validate paras results | — |
| ☐ | Generate report | Images appear in report (PDF + preview) |
| ☐ | Attachment excluded when `include_in_report: false` | Image not in PDF |

---

## 14. Regression shortcuts (automated)

Run after checklist when scripts are available:

```bash
cd backend
node src/scripts/verify-system-health.js
node src/scripts/verify-barcode-norma-chain.js
node src/scripts/verify-norma-ref-chain.js
node src/scripts/verify-permissions.js
```

Optional PDF smoke:

```bash
node src/scripts/test-pdf-design3.js
```

---

## 15. Sign-off

| Field | Value |
|-------|-------|
| Date | |
| Tester | |
| Environment | local / staging / production |
| Git SHA / deploy ID | |
| Change description | |
| All mandatory items (§1–13) | ☐ Pass / ☐ Fail |
| Approved for deploy | ☐ Yes / ☐ No |

---

*Phase 0 — mandatory manual tests before risky changes. Update this file when new report sections or devices are added.*
