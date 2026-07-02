# LIMS Enterprise v2 — وثيقة التصميم المعماري

**المختبر:** مركز رعاية النوادر البيطري  
**النطاق:** تصميم هندسي فقط — بدون تنفيذ، بدون migration، بدون refactor  
**التاريخ:** 2026-07-03  
**المرجع:** مراجعة الكود الحالي في `rare-vet-lims` (reports, reference ranges, Norma, barcode, portal)

---

## 1. الهدف من LIMS v2

بناء نظام LIMS بيطري **Enterprise-grade** يحقق:

| الهدف | المعنى العملي |
|-------|----------------|
| **تقرير حسب الطلب** | PDF/HTML يعرض فقط ما طلبه العميل + ما له نتيجة + ما فُعّل للعرض |
| **مصدر حقيقة واحد للنتائج** | `result_values` هي القيمة النهائية؛ المرجعيات من LIMS فقط |
| **أجهزة قابلة للتوسع** | Mapping في DB وليس hardcoded JS |
| **تدقيق كامل** | كل تعديل بعد الاعتماد يُسجّل |
| **بوابة عميل متطابقة** | نفس Report Builder، نفس الأقسام، بدون جداول فارغة |
| **استمرارية التشغيل** | Migration تدريجية بدون إيقاف الاستقبال أو Norma |

**مبدأ التصميم:** v2 = طبقة domain واضحة فوق schema موجود، مع إعادة تنظيم تدريجية وليس "big bang rewrite".

---

## 2. المشاكل الحالية في المشروع

### 2.1 التقارير

| المشكلة | الوصف |
|---------|--------|
| **مساران للعرض** | PDF (Design 3 Puppeteer) ≠ HTML preview (Design 1 في `LaboratoryReport.jsx`) |
| **كود يتيم** | `pdf-template.js` + `pdf-results-table.js` غير موصولين |
| **Sections في الكود** | `norma-cbc-panel.js` — غير قابلة للإدارة من DB |
| **panelName ثابت** | كان يأخذ أول test فقط |

### 2.2 القيم المرجعية

| المشكلة | الوصف |
|---------|--------|
| **مصدران متوازيان** | `test_reference_ranges` + `device_reference_ranges` |
| **species مزدوج** | enum LIMS vs string keys في device refs |
| **notes كـ OBX-7** | `result_values.notes` تحمل `Norma: ...` — خلط بين snapshot وdisplay |
| **sync Norma** | كان يملأ device refs تلقائياً (تم تعطيله جزئياً) |

### 2.3 الأجهزة

| المشكلة | الوصف |
|---------|--------|
| **Mapping في JS** | `norma-cbc-map.js` — تغيير analyzer = deploy |
| **لا value_type في DB** | count vs percentage يُستنتج في الكود |
| **device_flag غير محفوظ** | flag من Norma لا يُ persist |

### 2.4 الباركود

| المشكلة | الوصف |
|---------|--------|
| **Code128 vs Code128-C** | backend API vs Zebra ZPL مسارات مختلفة |
| **legacy BC/SMP** | عينات قديمة بمعرّفين مختلفين |
| **QR payload ثقيل** | JSON في QR بينما Norma يحتاج digits فقط |

### 2.5 الصور والبوابة

| المشكلة | الوصف |
|---------|--------|
| **مرفقات على result فقط** | لا `sample_images` مستقل |
| **include_in_report** | أُضيف حديثاً — UI غير مكتمل |
| **Portal** | نسخة من staff HTML — drift محتمل |

### 2.6 الصلاحيات وسير العمل

| المشكلة | الو描述 |
|---------|--------|
| **حالات التقرير** | `is_final` + approvals — لا Draft/Published/Portal pipeline كامل |
| **Permissions في code** | `permissions.js` + sync — جيد لكن بدون policy layer |
| **Audit** | middleware موجود — coverage غير شامل لـ results/refs |

---

## 3. الهيكلية الجديدة المقترحة

```
┌─────────────────────────────────────────────────────────────────┐
│                     Presentation Layer                          │
│  Staff SPA │ Portal SPA │ Reception Display │ Zebra Bridge      │
└────────────────────────────┬────────────────────────────────────┘
                             │ REST / WebSocket (devices)
┌────────────────────────────▼────────────────────────────────────┐
│                     API Gateway (Express)                       │
│  Auth │ RBAC │ Validation │ Rate limit │ Audit hook             │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                     Application Services (Modules)              │
│  Orders │ Samples │ Results │ RefRanges │ Devices │ Reports     │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                     Domain Core                                 │
│  ReportBuilder │ ReferenceRangeEngine │ DeviceIngestEngine      │
│  FlagEvaluator │ BarcodeService │ ApprovalWorkflow              │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  PostgreSQL │ Object Storage (S3/local) │ Job Queue (cron)      │
└─────────────────────────────────────────────────────────────────┘
```

**قواعد v2:**

1. **Domain services** لا تستورد Express.
2. **Report Builder** مصدر واحد لـ PDF + HTML + Portal.
3. **Reference Range Engine** مصدر واحد للعرض والـ flags.
4. **Device Engine** adapter pattern لكل analyzer.
5. **Feature flags** للانتقال التدريجي من v1 paths.

---

## 4. تقسيم النظام إلى Modules

### 4.1 Owners (Customers)

**المسؤولية:** بيانات المالك، الجوال، VAT، ربط بالحيوانات والفواتير.

| كيان | ملاحظات v2 |
|------|------------|
| `customers` | إبقاء الجدول؛ إضافة `portal_enabled`, `preferred_language` |
| Portal OTP | `customer_otp_codes` — موجود |

**API:** CRUD + search + merge duplicates (لاحقاً).

---

### 4.2 Animals

**المسؤولية:** هوية الحيوان، species، breed، age، chip، صورة.

| كيان | ملاحظات v2 |
|------|------------|
| `animals` | `animal_type` enum LIMS |
| `species` (جدول مستقل لاحقاً) | v2.1 — توسيع beyond enum |

**Trends:** module فرعي يقرأ `result_values` history — لا يدخل PDF إلا بطلب صريح.

---

### 4.3 Orders

**المسؤولية:** **مصدر الحقيقة لما طُلب** — أساس Report Builder.

| كيان مقترح | الغرض |
|------------|--------|
| `orders` | رأس الطلب (customer, date, status) |
| `order_lines` | test/package + price + quantity |

**الوضع الحالي:** `invoices` + `sample_tests` — v2 يُ formalize كـ Order مرتبط بـ Sample.

**قاعدة:** Report Builder يقرأ `order_lines` أولاً، ثم ي intersect مع validated results.

---

### 4.4 Samples

**المسؤولية:** دورة حياة العينة، barcode، ربط order، status pipeline.

```
pending → received → running → completed → archived
         ↘ rejected
```

| حقل | v2 |
|-----|-----|
| `sample_code` / `barcode` | unified 12-digit (موجود) |
| `order_id` | FK جديد (nullable during migration) |
| `report_status` | draft \| entered \| reviewed \| approved \| published |

---

### 4.5 Tests

**المسؤولية:** كatalog الفحوصات، categories، packages، pricing.

| موجود | v2 |
|--------|-----|
| `tests`, `test_categories`, `packages` | إبقاء + `report_section_type` على test |

**`report_section_type`:** hematology \| chemistry \| parasites_blood \| fecal \| hormones \| elisa \| pcr \| microscopy \| other

---

### 4.6 Parameters

**المسؤولية:** معاملات قابلة للقياس لكل test.

| موجود | v2 |
|--------|-----|
| `test_parameters` | + `value_type`: count \| percentage \| numeric \| text \| qual |
| | + `default_unit`, `report_sort_order` |

---

### 4.7 Results

**المسؤولية:** قيم نهائية + flags + validation lock.

```
sample_tests (1) ── (1) results ── (*) result_values
                              └── (*) result_attachments / sample_images
```

| قاعدة v2 | التفاصيل |
|----------|----------|
| **Value** | `result_values.value` + `numeric_value` |
| **Flag** | `result_values.flag` — HIGH/LOW/NORMAL/Missing |
| **Notes** | human notes فقط — لا OBX-7 display |
| **Norma snapshot** | عمود منفصل `device_reference_snapshot` (JSON/text) — اختياري v2.1 |
| **Lock** | `results.is_validated` — Manager override + audit |

---

### 4.8 Reference Ranges

**Module:** `ReferenceRangeEngine`

**مصدر العرض:** `reference_ranges` (v2 unified table) — أو توسيع `test_reference_ranges` during bridge.

**Matching priority (أعلى → أ lowest):**

1. parameter + species + sex + age band + device
2. parameter + species + sex + age band
3. parameter + species + device
4. parameter + species (generic)
5. لا match → display empty / "Not defined" — **لا flag H/L**

---

### 4.9 Devices

**Module:** `DeviceIngestEngine`

| مكون | الغرض |
|------|--------|
| `device_integrations` | config, protocol, API key |
| `device_messages` | raw + parsed JSON |
| `device_parameter_mappings` | device_code → parameter_id + value_type |
| Adapters | Norma, Diasys, MiniVidas, ELISA, PCR |

**Pipeline:**

```
Raw HL7/ASTM → Parser → Adapter.mapRows() → FlagEvaluator → enterResults()
                      ↘ DeviceMessageStore
```

---

### 4.10 Report Builder

**Module:** `ReportBuilderService` — **single renderer registry**

| Output | Engine |
|--------|--------|
| PDF | Puppeteer HTML (Design 3+) أو PDFKit fallback |
| Staff HTML | نفس HTML template |
| Portal HTML | sanitized subset |
| Comparison report | optional section + trend tables |

**Input DTO:**

```typescript
ReportBuildRequest {
  sampleId, reportId?, language,
  mode: 'standard' | 'comparison',
  includeSections?: string[],
}
ReportBuildResult {
  sections: ReportSection[],
  patient: PatientBlock,
  approvals: ApprovalBlock,
  attachments: ImageBlock[],
  metadata: { reportNumber, verificationCode, issuedAt }
}
```

---

### 4.11 Barcode

**Module:** `BarcodeService`

| Rule | Value |
|------|-------|
| Symbology | Code128-C |
| Payload | Sample ID digits only |
| Quiet zone | ZPL + PNG padding |
| Display | human-readable unpadded |
| Lookup | `normalizeSampleScanId()` chain |

**UI:** Label Designer page — preview + reprint + copies from test catalog.

---

### 4.12 Customer Portal

**Module:** `PortalService` — read-only views over approved + published reports.

| Rule | Detail |
|------|--------|
| Visibility | `report.published_at IS NOT NULL` |
| PDF | same stored file from Report Builder |
| Preview | same section filter |
| Images | `include_in_report = true` only |

---

### 4.13 Billing

**Module:** existing `billing` — link orders ↔ invoices ↔ samples.

v2: Order total = sum(order_lines); sample creation copies lines to `sample_tests`.

---

### 4.14 Inventory

**Module:** existing — no structural change in v2.0.

---

### 4.15 Users & Roles

**Module:** RBAC via `permissions` + `role_permissions`.

v2 adds policy objects:

| Policy | Roles |
|--------|-------|
| `results.enter` | lab_technician, lab_specialist |
| `results.validate` | lab_specialist, veterinarian |
| `reports.approve` | lab_specialist, veterinarian, manager |
| `reference_ranges.manage` | manager, admin, veterinarian |
| `results.override_validated` | manager, admin only |

---

### 4.16 Audit Logs

**Module:** `AuditService` — append-only.

| Event | Entities |
|-------|----------|
| result.change | result_values |
| report.approve | reports |
| ref_range.change | reference_ranges |
| device.import | device_messages |
| sample.status | samples |

---

## 5. تصميم قاعدة البيانات المقترح

### 5.1 جداول جديدة (v2 target)

```sql
-- Orders
orders (id, customer_id, order_number, status, total, created_by, created_at)
order_lines (id, order_id, test_id, package_id, quantity, unit_price, line_total)

-- Unified reference ranges (target — may bridge from test_reference_ranges)
reference_ranges (
  id, parameter_id, species_id, test_id,
  device_id, sex, age_min, age_max, age_unit,
  unit, min_value, max_value, text_reference,
  critical_low, critical_high,
  is_active, created_by, updated_by, created_at, updated_at
)

-- Device mapping (exists — extend)
device_parameter_mappings (
  id, device_id, device_name, device_parameter_code,
  system_parameter_id, display_name_ar, display_name_en,
  unit, value_type, is_active, created_at, updated_at
)

-- Sample images (target — may bridge from result_attachments)
sample_images (
  id, sample_id, test_id, result_id, parameter_id,
  image_url, caption, uploaded_by,
  include_in_report, sort_order, created_at
)

-- Report artifacts
report_sections (
  id, report_id, section_type, title_ar, title_en,
  sort_order, is_visible, payload_json, created_at
)

-- Result flags (optional normalized)
result_flags (
  id, result_value_id, flag_type, message, evaluated_at
)

-- Species catalog (v2.1)
species (id, code, name_ar, name_en, is_active)
```

### 5.2 جداول موجودة — إبقاء وتوسيع

| جدول | v2 action |
|------|-----------|
| `customers`, `animals`, `samples` | extend FKs + status fields |
| `tests`, `test_parameters`, `test_categories` | add section_type, value_type |
| `sample_tests`, `results`, `result_values` | add snapshot columns optional |
| `reports` | add `published_at`, `report_status`, `comparison_mode` |
| `device_integrations`, `device_messages` | keep |
| `permissions`, `roles`, `audit_logs` | extend coverage |

### 5.3 جداول legacy — deprecate تدريجياً

| جدول | مصير |
|------|------|
| `device_reference_ranges` | read-only archive → stop writes (done) |
| `device_reference_range_logs` | archive |

---

## 6. العلاقات بين الجداول (ERD نصي)

```
customers 1──* animals
customers 1──* orders
orders    1──* order_lines ──* tests
orders    1──* samples (optional 1:1 or 1:*)
customers 1──* samples

samples   1──* sample_tests ──* tests
sample_tests 1──0..1 results 1──* result_values ──* test_parameters
results   1──* result_attachments  ──(migrate to)── sample_images

animals   *──1 species (v2.1)
test_parameters *──1 tests *──1 test_categories

reference_ranges *──1 test_parameters
reference_ranges *──0..1 device_integrations
reference_ranges *──0..1 species

device_integrations 1──* device_messages
device_integrations 1──* device_parameter_mappings *──1 test_parameters

samples   1──* reports 1──* report_sections
reports   *──1 users (generated_by, approvers)

audit_logs *──0..1 users (polymorphic entity_type + entity_id)
```

**Cardinality rules:**

- One `results` row per `sample_test`.
- One `result_value` per parameter per result.
- One active `reference_range` match per parameter context (engine picks best).

---

## 7. تصميم Report Builder ديناميكي

### 7.1 Algorithm

```
function buildReport(sampleId, options):
  orderTests = getOrderedTests(sampleId)          // from order_lines or sample_tests
  validatedResults = getValidatedResults(sampleId) // result_values join
  images = getReportableImages(sampleId)           // include_in_report=true

  sections = []

  for each test in orderTests:
    rows = resultsForTest(validatedResults, test)
    if rows.isEmpty(): continue
    sections.add(makeSection(test.report_section_type, rows))

  if images.notEmpty():
    sections.add(makeImageSection(images))

  if options.mode == 'comparison':
    sections.add(makeTrendSection(animalId, orderTests))

  return render(sections, patientBlock, approvals)
```

### 7.2 Scenarios

| Scenario | Sections emitted |
|----------|------------------|
| **CBC only** | Patient + Hematology + Signatures |
| **Chemistry only** | Patient + Chemistry + Signatures |
| **Full package** | Patient + Hema + Chem + Hormones + ELISA + PCR + (Paras if ordered) + Signatures |
| **Parasites + images** | Patient + Blood Parasites + Microscopy images + Signatures |
| **Comparison report** | Standard sections + Trend tables/charts (no default in standard PDF) |

### 7.3 Empty section rule

**Never render** a section when:

- Test not on order **AND** no validated results **AND** no reportable images.

### 7.4 Renderer unification (v2 target)

```
ReportBuilder
  ├── buildDto()           // shared
  ├── renderHtml(dto)      // staff + portal + puppeteer input
  ├── renderPdf(dto)       // puppeteer(renderHtml)
  └── renderPreviewJson(dto) // API response
```

**Eliminate:** separate `LaboratoryReport` grouping logic diverging from backend.

---

## 8. تصميم Device Engine

### 8.1 Adapter interface

```javascript
interface DeviceAdapter {
  deviceType: string;
  parse(raw: string): ParsedMessage;
  mapToLimsRows(parsed, context): LimsResultRow[];
  supportedProtocols: ('HL7' | 'ASTM' | 'CSV')[];
}
```

### 8.2 Norma CBC

| Aspect | Design |
|--------|--------|
| Parser | `hl7.js` + `norma-csv.js` |
| Mapping | `device_parameter_mappings` first, fallback `norma-cbc-map.js` |
| WBC vs LYM% | `value_type` + `%` unit disambiguation |
| Enrichment | abs↔pct pairs, PLC-C from PLT |
| Species | `norma-species-map` → LIMS animal_type |
| Ref snapshot | store OBX-7 in `device_reference_snapshot` — **not** display column |

### 8.3 Chemistry Analyzer (Diasys Respons 910)

| Aspect | Design |
|--------|--------|
| Protocol | ASTM |
| Mapping | DB rows per analyte code |
| Panel | test `CHEM-PANEL` parameters |
| Ref | LIMS reference_ranges only |

### 8.4 MiniVidas (ELISA)

| Aspect | Design |
|--------|--------|
| Protocol | ASTM |
| value_type | qual + numeric (S/CO, IU) |
| Flags | POS/NEG from cutoff refs |

### 8.5 ELISA (generic)

Same adapter family as MiniVidas with config-driven cutoff parameters.

### 8.6 PCR

| Aspect | Design |
|--------|--------|
| value_type | text \| qual (Detected/Not Detected) |
| text_reference | from reference_ranges.text_reference |
| Sections | `pcr` report section |

### 8.7 Ingest orchestrator

```
DeviceIngestService.receive(deviceId, raw):
  msg = store(device_messages)
  adapter = AdapterRegistry.get(device)
  parsed = adapter.parse(raw)
  rows = adapter.mapToLimsRows(parsed, { sample, mappings })
  flagged = ReferenceRangeEngine.evaluate(rows, animal)
  ResultsService.enterResults(flagged)
  msg.status = imported | unmatched | failed
```

---

## 9. تصميم Reference Range Engine

### 9.1 API

```javascript
ReferenceRangeEngine.resolve(context): ReferenceRange | null
ReferenceRangeEngine.evaluateValue(value, range): Flag
ReferenceRangeEngine.formatDisplay(range, language): string
```

**Context:**

```javascript
{
  parameterId, species, sex?, ageYears?, deviceId?, at?: Date
}
```

### 9.2 SQL strategy (conceptual)

```sql
SELECT * FROM reference_ranges
WHERE parameter_id = $1
  AND species matches
  AND (sex IS NULL OR sex = $sex)
  AND (age band matches)
  AND (device_id IS NULL OR device_id = $device)
  AND is_active
ORDER BY specificity_score DESC
LIMIT 1
```

### 9.3 Display rules

| Case | Report column |
|------|---------------|
| numeric range | `min-max unit` |
| text only | `text_reference` |
| no match | empty / "Not defined" |
| wrong species | **never** fall back to another species |

### 9.4 Admin

CRUD via `/api/reference-ranges` with audit log — manager/admin/vet.

**Duplicate prevention:** unique (parameter_id, species, sex, device_id, age band).

---

## 10. تصميم صلاحيات المستخدمين

| Role | Create sample | Enter results | Validate | Approve report | Manage refs | Override validated | Portal publish |
|------|:-------------:|:-------------:|:--------:|:--------------:|:-----------:|:------------------:|:--------------:|
| Reception | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Lab Technician | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Lab Specialist | ✗ | ✓ | ✓ | ✓ (lab) | ✗ | ✗ | ✗ |
| Veterinarian | ✗ | ✓ | ✓ | ✓ (vet) | ✓ | ✗ | ✗ |
| Manager | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

**Implementation:** keep `permissions.js` catalog + add middleware `requirePolicy('reports.publish')`.

---

## 11. تصميم Audit Log

### 11.1 Schema (extend existing)

```sql
audit_logs (
  id, user_id, entity_type, entity_id,
  action,           -- create | update | delete | approve | unapprove | publish
  old_value JSONB,
  new_value JSONB,
  ip_address, user_agent,
  created_at
)
```

### 11.2 Mandatory events

- Result value change after validation attempt (blocked or manager override)
- Reference range CRUD
- Report approval / unapproval
- Portal publish
- Device message import failure with sample link
- Barcode reprint (optional)

### 11.3 Retention

- Hot: 24 months in DB
- Cold: export to object storage yearly

---

## 12. تصميم بوابة العميل

```
Portal Auth (OTP) → Portal API → ReportBuilder (read-only DTO)
                              → PDF download (ownership check)
                              → Notification on publish
```

| Endpoint | Purpose |
|----------|---------|
| `GET /portal/reports` | list published |
| `GET /portal/reports/:id/preview` | sections JSON |
| `GET /portal/reports/download/:file` | PDF stream |
| `GET /portal/animals/:id/trends` | optional v2.1 |

**Security:** customer_id scope on every query; no staff permissions.

---

## 13. تصميم API Endpoints

### 13.1 Core REST map (v2 target)

| Module | Endpoints |
|--------|-----------|
| **Orders** | `POST /orders`, `GET /orders/:id`, `POST /orders/:id/lines` |
| **Samples** | `POST /samples`, `PATCH /samples/:id/status`, `GET /samples/scan/:barcode` |
| **Results** | `GET /results/sample-test/:id`, `POST /results/enter`, `POST /results/validate/:id` |
| **Images** | `POST /samples/:id/images`, `PATCH /sample-images/:id` |
| **Reference** | `GET/POST/PUT/DELETE /reference-ranges` |
| **Devices** | `POST /devices/ingest/:id`, `GET /devices/mappings` |
| **Reports** | `POST /reports/generate/:sampleId`, `GET /reports/:id/preview`, `POST /reports/:id/approve`, `POST /reports/:id/publish` |
| **Barcode** | `GET /samples/:id/barcode?label=1`, `POST /samples/:id/reprint` |
| **Portal** | `/portal/*` namespace |
| **Trends** | `GET /animals/:id/trends?test_code=` |

### 13.2 Versioning

- v1: current `/api/*` — maintained during bridge
- v2: `/api/v2/*` for new order/report contracts (optional)

---

## 14. خطة Migration من النظام الحالي إلى v2

### Phase 0 — Freeze & document (أسبوع 0)

- [ ] تجميد `device_reference_ranges` writes (✓ جزئياً)
- [ ] توثيق report paths
- [ ] Feature flag `REPORT_BUILDER_V2=1`

### Phase 1 — Data bridge (أسبوع 1–2)

| Step | Action |
|------|--------|
| 1 | Add columns only (`include_in_report`, ref range extensions) — **done partially** |
| 2 | Seed `device_parameter_mappings` from Norma map |
| 3 | Backfill `report_section_type` on tests from category code |
| 4 | Dual-write: new ref admin → `test_reference_ranges` |

### Phase 2 — Report unification (أسبوع 3–4)

| Step | Action |
|------|--------|
| 1 | Single `ReportBuilderService.buildDto()` |
| 2 | Puppeteer consumes same HTML as staff preview |
| 3 | Portal consumes same DTO |
| 4 | Deprecate client-side html2canvas PDF |

### Phase 3 — Orders formalization (أسبوع 5–6)

| Step | Action |
|------|--------|
| 1 | Create `orders` from existing `invoices` |
| 2 | Link samples → orders |
| 3 | Report Builder reads order_lines |

### Phase 4 — Device engine refactor (أسبوع 7–8)

| Step | Action |
|------|--------|
| 1 | Adapter registry |
| 2 | Chemistry + ELISA adapters |
| 3 | Remove hardcoded map fallback (keep as emergency) |

### Phase 5 — Portal publish pipeline (أسبوع 9)

| Step | Action |
|------|--------|
| 1 | `published_at` + notification |
| 2 | Hide unpublished from portal |

### Phase 6 — Cleanup (أسبوع 10+)

- Archive `device_reference_ranges`
- Remove orphan `pdf-template.js` after parity test
- Consolidate `norma-cbc-map.js` into DB seeds

---

## 15. خطة تنفيذ على مراحl بدون تعطيل النظام

| Principle | Implementation |
|-----------|----------------|
| **Strangler fig** | New services wrap old; switch via env flag |
| **Backward compatible API** | Old endpoints delegate to new builder |
| **No destructive DDL** | ADD COLUMN only until Phase 6 |
| **Norma always on** | Device ingest path unchanged until adapter swap |
| **PDF cache** | Regenerate on demand; keep old PDFs until regen |
| **Parallel run** | Compare v1 vs v2 PDF hash in staging |

**Rollout:**

1. Staging full regression
2. Production: enable `REPORT_BUILDER_V2` for internal preview only
3. Production: new reports use v2 PDF
4. Batch regen old reports optional

---

## 16. المخاطر المتوقعة وكيف نتجنبها

| Risk | Impact | Mitigation |
|------|--------|------------|
| PDF/HTML drift | Client confusion | Single HTML template |
| Wrong ref range species | Medical/legal | Engine unit tests per species |
| Norma mapping break | Missing results | DB mapping + JS fallback flag |
| Barcode unreadable | Sample loss | Code128-C standard + verify script in CI |
| Migration downtime | Reception stop | Online DDL, no table drops |
| Portal leak unpublished | Privacy | `published_at` gate + integration test |
| Performance (Puppeteer) | Slow PDF | Pool browsers, cache PDFs |
| Arabic RTL layout | Broken PDF | Shared CSS, visual regression snapshots |

---

## 17. قائمة الملفات الحالية — الإبقاء مؤقتاً

### Backend — critical path

| File | Reason |
|------|--------|
| `backend/src/services/reports.service.js` | Report orchestration |
| `backend/src/services/report-builder.service.js` | Section logic (v2 seed) |
| `backend/src/services/device-import.service.js` | Norma ingest |
| `backend/src/services/results.service.js` | Result entry |
| `backend/src/services/reference-ranges.service.js` | LIMS ref join |
| `backend/src/utils/norma-cbc-map.js` | Fallback mapping |
| `backend/src/utils/hl7.js`, `device-parsers/*` | Parsers |
| `backend/src/utils/barcode-scan.js` | Scan normalization |
| `backend/src/utils/report-designs/design-3/*` | Active PDF |
| `backend/src/services/portal.service.js` | Portal |
| `backend/migrations/init.sql`, `migrate.js` | Schema evolution |

### Frontend — critical path

| File | Reason |
|------|--------|
| `frontend/src/pages/LaboratoryReport.jsx` | Staff preview |
| `frontend-portal/src/pages/LaboratoryReport.jsx` | Portal preview |
| `frontend/src/utils/zebraPrint.js`, `labelPanel.js` | Barcode print |
| `frontend/src/pages/TechnicianWorkbench.jsx` | Results entry |
| `frontend/src/pages/ReferenceRanges.jsx` | Ref admin |
| `bridge/norma-listener.js` | Device bridge |

---

## 18. قائمة الملفات — دمج أو حذف لاحقاً

| File | Action | When |
|------|--------|------|
| `backend/src/utils/pdf-template.js` | Delete | After Design 3 parity |
| `backend/src/utils/pdf-results-table.js` | Delete | With pdf-template |
| `backend/src/utils/report-designs/design-1.js` | Archive | After HTML unification |
| `backend/src/utils/report-designs/design-2*.js` | Archive | Unused |
| `backend/src/services/device-reference-ranges.service.js` | Archive writes | Phase 6 |
| `backend/src/scripts/sync-device-reference-ranges.js` | Keep stub | Already disabled |
| `frontend/src/utils/labReportPrint.js` (html2canvas path) | Remove | After server PDF only |
| Duplicate `normaCbcPanel.js` (frontend) | Merge to API metadata | v2.1 |
| Multiple `ar-*-test.js` scripts in backend | Move to `tools/` | Cleanup sprint |

**Do NOT delete before:** automated PDF visual diff passes for CBC, Chem, paras images.

---

## 19. خطة اختبار لكل مرحلة

### Phase 0 — Baseline

| Test | Pass criteria |
|------|---------------|
| Norma full CBC import | ≥26 params mapped |
| Barcode scan chain | `verify-barcode-norma-chain.js` green |
| Generate CBC report | PDF opens, no empty chem section |

### Phase 1 — Reference & mapping

| Test | Pass criteria |
|------|---------------|
| Admin adds ref for camel WBC | Report shows range |
| Wrong species | Empty ref, no H/L |
| Device mapping row | Import uses DB code |

### Phase 2 — Report Builder

| Test | Pass criteria |
|------|---------------|
| CBC only order | 1 section |
| CBC+Chem order, chem empty | 1 section |
| Full package all validated | All sections |
| Paras + 2 images (1 excluded) | 1 image in PDF |
| Staff HTML = Puppeteer PDF | Visual diff < threshold |

### Phase 3 — Orders

| Test | Pass criteria |
|------|---------------|
| Invoice → order backfill | order_lines match sample_tests |
| Report respects order not catalog | Removed test not in report |

### Phase 4 — Devices

| Test | Pass criteria |
|------|---------------|
| Norma LYM% vs WBC | Separate parameters |
| Diasys chem panel | Import + report section |
| Failed import | message status failed + audit |

### Phase 5 — Portal

| Test | Pass criteria |
|------|---------------|
| Unpublished report | Portal 404 |
| Published report | PDF + preview match staff |
| Customer scope | Cannot access other customer report |

### Phase 6 — Regression suite (CI)

```
npm run test:report-scenarios   // matrix: cbc, chem, full, paras, comparison
npm run test:norma-import
npm run test:barcode-chain
npm run test:reference-engine
```

---

## ملحق A — Mapping Report Section Types

| test code pattern | section_type |
|-------------------|--------------|
| CBC*, HEM* | hematology |
| CHEM*, BIOCHEM* | chemistry |
| PARAS-BLOOD* | blood_parasites |
| PARAS-STOOL*, FECAL* | fecal |
| HORM* | hormones |
| ELISA*, SERO* | elisa |
| PCR* | pcr |
| attachments | microscopy |

---

## ملحق B — Environment flags (مقترح)

| Flag | Default | Purpose |
|------|---------|---------|
| `REPORT_BUILDER_V2` | 0→1 | Dynamic sections |
| `REPORT_RENDERER` | puppeteer | pdf engine |
| `DEVICE_MAPPING_DB` | 1 | Use device_parameter_mappings |
| `NORMA_MAP_FALLBACK` | 1 | JS map if DB miss |
| `PORTAL_PUBLISH_GATE` | 0→1 | Require published_at |

---

## ملحق C — قرارات معمارية مُ lock مسبقاً

1. **PostgreSQL** يبقى RDBMS الرئيسي.
2. **Express monolith** يبقى في v2.0 — microservices لاحقاً إذا لزم.
3. **result_values** = source of truth for displayed values.
4. **reference_ranges (LIMS)** = source of truth for report refs and flags.
5. **No auto-import of device reference ranges into reports.**
6. **Sample ID only in barcode** — no Arabic in encoded payload.

---

*نهاية وثيقة التصميم — LIMS Enterprise v2 Architecture*  
*الحالة: DESIGN ONLY — لا تنفيذ حتى اعتماد الوثيقة*
