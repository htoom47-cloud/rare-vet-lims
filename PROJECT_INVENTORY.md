# PROJECT_INVENTORY.md

**المشروع:** Rare Vet LIMS — مركز رعاية النوادر البيطري  
**المستودع:** `rare-vet-lims`  
**الإصدار:** 1.0.0  
**آخر جرد:** 2026-07-03  
**الغرض:** جرد هندسي للكود والبنية الحالية — مرجع للتطوير و LIMS v2

---

## 1. ملخص المشروع

| البند | القيمة |
|-------|--------|
| النوع | LIMS بيطري سحابي + بوابة عميل + bridge محلي للأجهزة |
| Backend | Node.js 20, Express, PostgreSQL |
| Staff UI | React 18, Vite, TailwindCSS, i18n (ar/en) |
| Portal UI | React (frontend-portal) + صفحات عامة |
| النشر | Render (`render.yaml`) — `lims.rarevetcare.com` + `portal.rarevetcare.com` |
| التخزين | Local disk أو S3 (`STORAGE_TYPE`) |
| التقارير PDF | Puppeteer Design 3 (افتراضي) + PDFKit Design 1/2 |
| الأجهزة | Norma CBC (HL7), Diasys, Mini Vidas — عبر bridge TCP |

**وثائق تصميم مرتبطة:**

- [`LIMS_ENTERPRISE_V2_ARCHITECTURE.md`](LIMS_ENTERPRISE_V2_ARCHITECTURE.md) — تصميم v2 (بدون تنفيذ)
- [`README.md`](README.md), [`DEPLOYMENT.md`](DEPLOYMENT.md), [`INSTALLATION.md`](INSTALLATION.md)
- [`backend/API.md`](backend/API.md)
- [`docs/norma-device-reference-ranges.md`](docs/norma-device-reference-ranges.md)

---

## 2. هيكل المستودع

```
rare-vet-lims/
├── backend/                 # API + migrations + scripts
├── frontend/                # Staff LIMS (Vite SPA)
├── frontend-portal/         # Customer portal + public site
├── bridge/                  # Norma HL7 listener → cloud API
├── tools/                   # Zebra ZPL, reception USB, parasitology agent
├── docs/                    # Technical docs
├── scripts/                 # Cloud build helpers
├── render.yaml              # Render blueprint
├── docker-compose.yml       # Local stack (if used)
├── LIMS_ENTERPRISE_V2_ARCHITECTURE.md
└── PROJECT_INVENTORY.md     # هذا الملف
```

---

## 3. Backend — نقطة الدخول

| ملف | الدور |
|-----|------|
| `backend/src/index.js` | HTTP server bootstrap |
| `backend/src/app.js` | Express app, middleware, static SPA, `/api` |
| `backend/src/routes/index.js` | Router aggregator + `/api/health` |
| `backend/src/scripts/migrate.js` | Schema init + incremental patches |
| `backend/src/scripts/cloud-start.js` | Production start (migrate + serve) |
| `backend/src/scripts/seed.js` | Seed data |

---

## 4. Backend — Routes (`/api/*`)

| Route file | Prefix | الغرض |
|------------|--------|--------|
| `auth.routes.js` | `/auth` | Login, refresh, staff JWT |
| `customers.routes.js` | `/customers` | العملاء |
| `animals.routes.js` | `/animals` | الحيوانات + `/trends` |
| `samples.routes.js` | `/samples` | العينات، barcode، queue |
| `tests.routes.js` | `/tests` | دليل الفحوصات، parameters، packages |
| `results.routes.js` | `/results` | إدخال/اعتماد النتائج، attachments |
| `reports.routes.js` | `/reports` | توليد PDF، preview، approve، verify |
| `reference-ranges.routes.js` | `/reference-ranges` | CRUD القيم المرجعية (LIMS) |
| `billing.routes.js` | `/billing` | فواتير، مدفوعات |
| `inventory.routes.js` | `/inventory` | مخزون |
| `quality.routes.js` | `/quality` | QC |
| `dashboard.routes.js` | `/dashboard` | إحصائيات |
| `users.routes.js` | `/users` | مستخدمين |
| `audit.routes.js` | `/audit` | سجل التدقيق |
| `notifications.routes.js` | `/notifications` | إشعارات |
| `devices.routes.js` | `/devices` | أجهزة، ingest، ref ranges (legacy UI) |
| `settings.routes.js` | `/settings` | إعدادات النظام |
| `portal.routes.js` | `/portal` | بوابة العميل OTP + reports |
| `public.routes.js` | `/public` | كatalog عام |

---

## 5. Backend — Services

### 5.1 Core LIMS

| Service | الملف | المسؤولية |
|---------|-------|-----------|
| Auth | `auth.service.js` | JWT, login |
| Customers | `customers.service.js` | CRUD عملاء |
| Animals | `animals.service.js` | CRUD + history + **trends** |
| Samples | `samples.service.js` | workflow, barcode, create |
| Tests | `tests.service.js` | catalog, parameters, ref ranges (legacy path) |
| Results | `results.service.js` | enter, validate, attachments, flags |
| Reports | `reports.service.js` | generate, preview, PDF, approve |
| Report Builder | `report-builder.service.js` | **أقسام ديناميكية** للتقرير |
| Reference Ranges | `reference-ranges.service.js` | LIMS join SQL للتقارير |
| Reference Admin | `reference-ranges-admin.service.js` | CRUD + audit log |
| Users | `users.service.js` | staff users |
| Dashboard | `dashboard.service.js` | stats |
| Audit | (middleware `audit.js`) | request logging |

### 5.2 Billing & Accounting

| Service | الملف |
|---------|-------|
| Billing | `billing.service.js` |
| Auto Invoice | `auto-invoice.service.js` |
| Quote | `quote.service.js` |
| Accounting | `accounting.service.js` |
| Ledger | `ledger.service.js` |
| Daily Closing | `daily-closing.service.js` |
| Invoice Settings | `invoice-settings.service.js` |

### 5.3 Devices & Norma

| Service | الملف | ملاحظات |
|---------|-------|---------|
| Devices | `devices.service.js` | ingest HL7، device config |
| Device Import | `device-import.service.js` | Norma CBC → result_values |
| Device Ref Ranges | `device-reference-ranges.service.js` | **sync معطّل** — archive |
| Device Param Mapping | `device-parameter-mappings.service.js` | DB mapping Norma codes |
| Norma Ref Debug | `norma-ref-debug.service.js` | audit/debug UI |

### 5.4 Portal & Other

| Service | الملف |
|---------|-------|
| Portal | `portal.service.js` |
| Notifications | `notifications.service.js` |
| Notification Providers | `notification-providers/*` |
| Inventory | `inventory.service.js` |
| Quality | `quality.service.js` |
| Public Catalog | `public-catalog.service.js` |
| AI Interpretation | `ai-interpretation.service.js` |

---

## 6. Backend — Utils (مختصر)

### 6.1 Reports & PDF

| ملف | الحالة |
|-----|--------|
| `utils/pdf.js` | Router → report design |
| `utils/report-designs/index.js` | Registry (Design 1/2/3) |
| `utils/report-designs/design-3/*` | **PDF نشط** — Puppeteer HTML |
| `utils/report-designs/design-1.js` | PDFKit legacy |
| `utils/report-designs/design-1-single-page.js` | Variant |
| `utils/report-designs/design-2.js` | Premium legacy |
| `utils/pdf-template.js` | **يتيم** — غير موصول |
| `utils/pdf-results-table.js` | **يتيم** — used by pdf-template only |
| `utils/pdf-i18n.js` | Labels ar/en |
| `utils/pdf-logo.js` | Brand logo buffer |
| `utils/pdf-arabic.js` | Arabic shaping |

### 6.2 Norma & Devices

| ملف | الغرض |
|-----|--------|
| `utils/norma-cbc-map.js` | Vendor code → LIMS parameter |
| `utils/norma-cbc-panel.js` | Panel order, HL7 index, sections |
| `utils/norma-cbc-references.js` | Profile reference seeds |
| `utils/norma-species-map.js` | Species aliases |
| `utils/norma-hl7-builder.js` | HL7 builder for tests |
| `utils/norma-ref-extract.js` | OBX-7 extraction |
| `utils/hl7.js` | HL7 parser |
| `utils/astm.js` | ASTM parser |
| `utils/device-parsers/*` | norma-csv, norma-txt, router |

### 6.3 Barcode & Reference

| ملف | الغرض |
|-----|--------|
| `utils/barcode.js` | Code128-C PNG (API) |
| `utils/barcode-scan.js` | normalize, Code128-C encode |
| `utils/barcode-lookup.js` | SQL lookup flexible |
| `utils/reference-range.js` | Parse OBX-7, **LIMS display for reports** |

### 6.4 Other Utils

| ملف | الغرض |
|-----|--------|
| `utils/permissions.js` | PERMISSIONS + ROLE_PERMISSIONS |
| `utils/sync-permissions.js` | DB sync catalog |
| `utils/helpers.js` | codes, pagination, sample ID |
| `utils/vat.js`, `utils/discount.js` | Billing math |
| `utils/closing-pdf.js` | Day close PDF |
| `utils/invoice-settings.js` | Invoice layout |
| `utils/parasitologyTests.js` | Paras test helpers |
| `constants/animal-types.js` | Species enum |
| `constants/brand.js` | Lab name |

---

## 7. Backend — Scripts (تصنيف)

### 7.1 تشغيل / صيانة

| Script | الأمر npm / path |
|--------|------------------|
| `migrate.js` | `npm run migrate` |
| `seed.js` | `npm run seed` |
| `ensure-admin.js` | `npm run ensure-admin` |
| `reset-admin.js` | `npm run reset-admin` |
| `backup-db.js` | `npm run backup` |
| `cloud-start.js` | `npm run start:cloud` |
| `clear-device-reference-ranges.js` | one-time purge |
| `sync-device-reference-ranges.js` | **disabled stub** |

### 7.2 Norma / CBC

| Script | الغرض |
|--------|--------|
| `sync-cbc-params.js` | `npm run sync-cbc` |
| `sync-norma-references.js` | `npm run sync-norma-refs` |
| `pull-norma-species-refs.js` | `npm run pull-norma-refs` |
| `verify-norma-ref-chain.js` | chain audit |
| `verify-barcode-norma-chain.js` | barcode + HL7 |
| `production-audit-norma-refs.js` | production audit |
| `send-norma-hl7.js` | test HL7 send |
| `reimport-norma-sample.js` | reimport sample |

### 7.3 Verify / E2E

| Script | الغرض |
|--------|--------|
| `verify-system-health.js` | health checks |
| `verify-device-reference-ranges.js` | device refs |
| `verify-report-historical-refs.js` | frozen refs |
| `verify-permissions-*.js` | RBAC |
| `e2e-customer-edit-flow.js` | customer flow |
| `e2e-paras-upload-pdf.js` | paras PDF |
| `post-deploy-norma-smoke.js` | smoke |

### 7.4 Report / PDF dev (غير production)

| Script | ملاحظة |
|--------|--------|
| `ar-*`, `canvas-*`, `banner-*`, `header-check.js` | AR/PDF experiments |
| `generate-report-api.js`, `pdf-to-png.js` | dev helpers |
| `test-pdf-design2.js` | design test |

---

## 8. Frontend — Staff (`frontend/`)

### 8.1 Pages & Routes

| Path | Page | Permission |
|------|------|------------|
| `/` | RoleHome / Dashboard | — |
| `/customers` | Customers | customers.view |
| `/animals` | Animals | animals.view |
| `/samples` | Samples | samples.view |
| `/workflow` | WorkflowCase | samples.create |
| `/workbench` | TechnicianWorkbench | results.enter |
| `/parasitology` | Parasitology | results.* |
| `/parasitology/upload` | ParasitologyUpload | results.upload_images |
| `/vet-review` | VetReview | validate/edit |
| `/tests` | Tests | tests.view |
| `/price-list` | PriceList | price_list.view |
| `/reports` | Reports | reports.view |
| `/reports/:id/view` | LaboratoryReport | reports.view |
| `/billing` | Billing | billing.view |
| `/accounting` | AccountingReports | billing.view |
| `/invoice-settings` | InvoiceSettings | billing.view |
| `/inventory` | Inventory | inventory.view |
| `/quality` | Quality | quality.view |
| `/users` | Users | users.view (admin) |
| `/audit` | AuditLogs | audit.view |
| `/settings` | Settings | settings.view |
| `/devices` | Devices | devices.view |
| `/device-reference-ranges` | DeviceReferenceRanges | devices.view |
| `/reference-ranges` | ReferenceRanges | reference_ranges.manage |
| `/animal-trends` | AnimalTrends | results.view |
| `/norma-ref-debug` | NormaRefDebug | devices.view |
| `/verify/:code` | VerifyReport | public |
| `/reception-display` | ReceptionDisplay | public |

### 8.2 Utils & Components (رئيسية)

| Area | Files |
|------|-------|
| API client | `src/services/api.js` |
| Auth | `src/context/AuthContext.jsx` |
| Layout | `src/components/layout/Sidebar.jsx`, `Layout.jsx` |
| Barcode print | `src/utils/zebraPrint.js`, `labelPrintHtml.js`, `labelPanel.js` |
| Barcode scan | `src/utils/barcodeScan.js` |
| Report print | `src/utils/labReportPrint.js`, `reportLayout.js` |
| Report design | `src/index.css` (lab report CSS), `report-designs/design-1-print.js` |
| Norma panel mirror | `src/constants/normaCbcPanel.js` |
| i18n | `src/i18n/index.js` |

---

## 9. Frontend — Portal (`frontend-portal/`)

### 9.1 Portal (authenticated)

| Page | الغرض |
|------|--------|
| `PortalLogin.jsx` | OTP login |
| `PortalDashboard.jsx` | Dashboard |
| `PortalReports.jsx` | Report list |
| `PortalReportView.jsx` | Report wrapper |
| `LaboratoryReport.jsx` | HTML report (mirror staff) |
| `PortalAnimals.jsx` | Animals list |
| `PortalAnimalDetail.jsx` | Animal detail |
| `PortalAnimalCompare.jsx` | Compare results |
| `PortalCompareHub.jsx` | Compare hub |
| `PortalInvoices.jsx` | Invoices |
| `PortalDocuments.jsx` | Documents |

### 9.2 Public site

| Page | Path concept |
|------|--------------|
| `HomePage.jsx` | Landing |
| `ServicesPage.jsx`, `TestsPage.jsx`, `EquipmentPage.jsx` | Marketing |
| `QualityPage.jsx`, `FaqPage.jsx`, `ContactPage.jsx` | Info |
| `ContentPage.jsx` | CMS-like |

---

## 10. Bridge (`bridge/`)

| File | الغرض |
|------|--------|
| `norma-listener.js` | TCP HL7 listener → POST cloud `/api/devices/ingest/:id` |
| `bridge.env.example` | Config template |
| `ecosystem.config.cjs` | PM2 |
| `install-bridge.ps1`, `configure-lab-bridge.ps1` | Windows setup |
| `README.md` | Setup docs |

**Port typical:** 21110 (Norma LIS → lab PC)

---

## 11. Tools (`tools/`)

| Category | Examples |
|----------|----------|
| Zebra printing | `zebra-local-bridge.js`, `*.zpl`, `send-zebra-*.ps1` |
| Reception USB display | `reception-display-usb/` |
| Parasitology LAN agent | `parasitology-agent/` |
| Deploy helpers | `DEPLOY-TO-RECEPTION-NOW.bat`, `test-local-before-deploy.bat` |
| Contacts / misc | `vcf-to-excel.js`, `compare-contacts-by-mobile.js` |

---

## 12. قاعدة البيانات

### 12.1 جداول `init.sql` (base)

```
roles, permissions, role_permissions, users, refresh_tokens
customers, animals
test_categories, tests, test_parameters, test_reference_ranges
samples, sample_tests, results, result_values
reports, packages, package_tests
invoices, invoice_items, payments, refunds
inventory_items, inventory_transactions
qc_records, device_maintenance, calibration_logs, temperature_logs
notification_queue
device_integrations, device_messages
settings, audit_logs
```

### 12.2 جداول `migrate.js` patches

| Table | Added by patch |
|-------|----------------|
| `result_attachments` | microscope/paras images (+ `include_in_report`) |
| `customer_otp_codes` | portal OTP |
| `ledger_accounts`, `journal_entries`, `journal_lines` | accounting |
| `daily_closings`, `accounting_reports` | closing |
| `price_quotes`, `price_quote_items` | quotes |
| `device_reference_ranges` | Norma OBX-7 archive |
| `device_reference_range_logs` | change log |
| `device_parameter_mappings` | Norma → LIMS codes |
| `reference_range_audit_logs` | ref range admin audit |

### 12.3 Extensions on existing tables (patches)

| Table | Columns added (examples) |
|-------|--------------------------|
| `test_reference_ranges` | sex, age_*, device_id, text_reference, is_active, audit cols |
| `reports` | approvals, treatment_recommendations, ai_interpretation |
| `tests` | label_copies |
| `invoices` | pdf_url |

---

## 13. الصلاحيات والأدوار

**مصدر:** `backend/src/utils/permissions.js`

| Role | ملخص |
|------|------|
| `admin` | all permissions |
| `manager` | full lab + billing + devices + ref ranges |
| `reception` | customers, samples, billing create |
| `lab_technician` | enter results, upload images |
| `lab_specialist` | validate, generate reports |
| `veterinarian` | validate, approve, ref ranges |
| `accountant` | billing, accounting |

**Permission جديد:** `reference_ranges.manage`

---

## 14. Report Pipeline (الحالي)

```
Sample completed + validated results
  → reports.service.buildReportData()
      → ordered tests (sample_tests)
      → result_values + LIMS ref join
      → report-builder.service.buildReportSections()
      → attachments (include_in_report)
  → generateReportPDF() → Design 3 (Puppeteer)
  → uploads/reports/*.pdf

Preview (staff/portal):
  → GET /reports/:id/preview OR /portal/reports/:id/preview
  → LaboratoryReport.jsx (Design 1 HTML layout)
```

**ملاحظة:** PDF path ≠ HTML preview path — انظر v2 architecture.

---

## 15. Device Pipeline (Norma)

```
Norma → bridge/norma-listener.js
  → POST /api/devices/ingest/:deviceId
  → devices.service.processInboundMessage()
  → device-import.service.importFromParsed()
      → device_parameter_mappings (DB) + norma-cbc-map (fallback)
      → results.service.enterResults()
  → (device ref sync DISABLED)
```

---

## 16. Barcode Pipeline

| Layer | Implementation |
|-------|----------------|
| Sample ID | 12-digit unified (`helpers.generateSampleDigitsId`) |
| Normalize scan | `barcode-scan.normalizeSampleScanId` |
| Zebra ZPL | `frontend/zebraPrint.js` — Code128-C |
| HTML label | `BarcodeLabel.jsx`, `labelPanel.js` |
| API PNG | `backend/barcode.js` — Code128-C |
| Lookup | `barcode-lookup.js` flexible SQL |

---

## 17. Deployment

| Target | Config |
|--------|--------|
| Render Web | `render.yaml` — build:cloud, start:cloud |
| DB | `rare-vet-db` PostgreSQL |
| Cron | `rare-vet-db-backup` (device-refs cron **removed**) |
| Uploads | `/var/data/uploads` disk 5GB |
| Domains | lims + portal on same service |

**Env highlights:** `REPORT_DESIGN`, `STORAGE_TYPE`, `JWT_*`, `LAB_*`, `PORTAL_*`

---

## 18. Dependencies (رئيسية)

### Backend

`express`, `pg`, `jsonwebtoken`, `puppeteer-core`, `@sparticuz/chromium`, `pdfkit`, `bwip-js`, `qrcode`, `sharp`, `canvas`, `@aws-sdk/client-s3`

### Frontend Staff

`react`, `vite`, `tailwindcss`, `axios`, `i18next`, `recharts`, `react-barcode`, `html2pdf.js`, `framer-motion`

---

## 19. Technical Debt / Known Gaps

| Item | Status |
|------|--------|
| Dual report render (PDF Design 3 vs HTML Design 1) | Open → v2 unification |
| `pdf-template.js` orphan | Remove after parity |
| `device_reference_ranges` auto-sync | Disabled |
| Orders as formal entity | invoices + sample_tests only |
| `report_sections` DB table | Code-only sections |
| Portal publish gate | Partial (`is_final`, no `published_at`) |
| Automated test suite | `npm test` → no tests |
| Many dev scripts in `backend/src/scripts/` | Not in CI |

---

## 20. File Counts (تقريبي)

| Area | Count |
|------|-------|
| Backend JS (src) | ~215 files |
| Staff pages | ~36 |
| Portal pages | ~21 |
| Route modules | 18 (+ reference-ranges) |
| Service modules | ~38 |
| Tools | ~75 files |

---

## 21. Changelog Reference (جلسات حديثة)

| Change | Files touched |
|--------|---------------|
| Dynamic report sections | `report-builder.service.js`, `reports.service.js`, `design-3/build-html.js` |
| Reference ranges admin | `reference-ranges-admin.service.js`, `reference-ranges.routes.js`, `ReferenceRanges.jsx` |
| Device mappings table | `device-parameter-mappings.service.js`, `migrate.js` |
| Disable Norma ref sync | `devices.service.js`, `render.yaml`, `sync-device-reference-ranges.js` |
| Device ref manual UI | `DeviceReferenceRanges.jsx` |
| Barcode Code128-C backend | `barcode.js` |
| Animal trends | `animals.service.js`, `AnimalTrends.jsx` |
| include_in_report | `result_attachments`, `results.service.js` |
| Architecture doc | `LIMS_ENTERPRISE_V2_ARCHITECTURE.md` |

---

*End of PROJECT_INVENTORY — for updates, regenerate sections 12–21 after major merges.*
