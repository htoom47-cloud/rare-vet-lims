# UAT Test Book — Rare Vet LIMS v1.0

**Laboratory:** AL NAWADER VETERINARY CARE CENTER  
**Version:** 1.0  
**Total test cases:** 225  
**Date:** 2026-07-03

---

## How to use

| Column | Usage |
|--------|-------|
| **Pass/Fail** | Mark ☐ before test → ✓ Pass or ✗ Fail after execution |
| **ملاحظات** | Record environment, tester name, date, bug ID if failed |
| **Bug link** | Log failures in [BUG_TRACKER.md](./BUG_TRACKER.md) |

**Run header (copy per session):**

```text
UAT Session: __________ | Tester: __________ | Env: staging/prod | Date: __________ | Git SHA: __________
```

**Pass criteria:** Actual result matches expected result with no data loss, security violation, or blocking error.

---

## Test case index

| Section | ID prefix | Count |
|---------|-----------|-------|
| Customers | UAT-CUS | 8 |
| Animals | UAT-ANI | 8 |
| Orders | UAT-ORD | 7 |
| Samples | UAT-SMP | 12 |
| Devices (general) | UAT-DEV | 6 |
| Norma | UAT-NRM | 12 |
| Diasys | UAT-DIA | 8 |
| Mini Vidas | UAT-MIN | 6 |
| ELISA | UAT-ELI | 6 |
| PCR | UAT-PCR | 6 |
| Barcode | UAT-BAR | 10 |
| Zebra | UAT-ZEB | 8 |
| Reports | UAT-RPT | 12 |
| PDF | UAT-PDF | 10 |
| Customer Portal | UAT-PRT | 12 |
| Workflow | UAT-WFL | 10 |
| Billing | UAT-BIL | 12 |
| Inventory | UAT-INV | 8 |
| Users | UAT-USR | 8 |
| Roles | UAT-ROL | 8 |
| Notifications | UAT-NOT | 8 |
| Backup | UAT-BAK | 8 |
| Restore | UAT-RES | 6 |
| Deploy | UAT-DEP | 6 |
| Performance | UAT-PRF | 8 |
| Security | UAT-SEC | 12 |
| **Total** | | **225** |

---

## 1. Customers (العملاء)

| Test ID | القسم | الهدف | خطوات التنفيذ | النتيجة المتوقعة | Pass/Fail | ملاحظات |
|---------|-------|-------|---------------|------------------|-----------|---------|
| UAT-CUS-001 | Customers | إنشاء عميل جديد | Reception → Customers → Add → أدخل الاسم والجوال → Save | العميل يُحفظ ويظهر في القائمة | ☐ | |
| UAT-CUS-002 | Customers | البحث بالجوال | ابحث عن جوال عميل موجود | نتيجة واحدة صحيحة | ☐ | |
| UAT-CUS-003 | Customers | منع duplicate mobile | حاول إنشاء عميل بنفس الجوال | رسالة خطأ duplicate | ☐ | |
| UAT-CUS-004 | Customers | تعديل بيانات عميل | Edit → غيّر العنوان → Save | التعديل محفوظ | ☐ | |
| UAT-CUS-005 | Customers | الاسم العربي | أدخل full_name_ar | يظهر في الواجهة والتقارير | ☐ | |
| UAT-CUS-006 | Customers | حذف/تعطيل عميل | Delete أو deactivate حسب الصلاحية | العميل لا يظهر في البحث النشط | ☐ | |
| UAT-CUS-007 | Customers | Audit log | أنشئ عميل → راجع Audit | حدث create مسجّل | ☐ | |
| UAT-CUS-008 | Customers | صلاحيات Reception | سجّل دخول reception → Customers | يرى ويعدّل حسب permissions | ☐ | |

---

## 2. Animals (الحيوانات)

| Test ID | القسم | الهدف | خطوات التنفيذ | النتيجة المتوقعة | Pass/Fail | ملاحظات |
|---------|-------|-------|---------------|------------------|-----------|---------|
| UAT-ANI-001 | Animals | تسجيل حيوان | Customers → Animal → Add → نوع camel | حيوان م linked للعميل | ☐ | |
| UAT-ANI-002 | Animals | animal_code فريد | أنشئ حيوانين | codes مختلفة | ☐ | |
| UAT-ANI-003 | Animals | animal_type للمراجع | حدد camel | يُستخدم في ref ranges | ☐ | |
| UAT-ANI-004 | Animals | RFID/chip | أدخل rfid إن وُجد | محفوظ وقابل للبحث | ☐ | |
| UAT-ANI-005 | Animals | صورة حيوان | Upload image | تظهر في الملف | ☐ | |
| UAT-ANI-006 | Animals | تعديل جنس/عمر | Edit gender/age | محفوظ | ☐ | |
| UAT-ANI-007 | Animals | ربط بالعينات | أنشئ sample للحيوان | owner صحيح | ☐ | |
| UAT-ANI-008 | Animals | Audit | Create animal | audit logged | ☐ | |

---

## 3. Orders (الطلبات)

| Test ID | القسم | الهدف | خطوات التنفيذ | النتيجة المتوقعة | Pass/Fail | ملاحظات |
|---------|-------|-------|---------------|------------------|-----------|---------|
| UAT-ORD-001 | Orders | طلب CBC فقط | WorkflowCase → اختر CBC-FULL | sample_tests row created | ☐ | |
| UAT-ORD-002 | Orders | طلب Chemistry | اختر CHEM panel | tests linked | ☐ | |
| UAT-ORD-003 | Orders | Package | اختر package | tests expanded from package | ☐ | |
| UAT-ORD-004 | Orders | CBC + Chem | اختر كلاهما | multiple sample_tests | ☐ | |
| UAT-ORD-005 | Orders | Parasitology order | اختر فحص طفيليات | queue parasitology | ☐ | |
| UAT-ORD-006 | Orders | Price snapshot | راجع price على sample_test | matches catalog price | ☐ | |
| UAT-ORD-007 | Orders | Quote to order | Price list quote → sample | quote linked if applicable | ☐ | |

---

## 4. Samples (العينات)

| Test ID | القسم | الهدف | خطوات التنفيذ | النتيجة المتوقعة | Pass/Fail | ملاحظات |
|---------|-------|-------|---------------|------------------|-----------|---------|
| UAT-SMP-001 | Samples | إنشاء عينة | WorkflowCase complete flow | sample_id + barcode assigned | ☐ | |
| UAT-SMP-002 | Samples | sample_code 12 digit | راجع التفاصيل | YYMMDD + 6 digits | ☐ | |
| UAT-SMP-003 | Samples | barcode = sample_code | Compare fields | identical digits | ☐ | |
| UAT-SMP-004 | Samples | status initial | new sample | pending/received | ☐ | |
| UAT-SMP-005 | Samples | Sample list filter | filter by status | correct subset | ☐ | |
| UAT-SMP-006 | Samples | Sample detail | open sample | tests + workflow visible | ☐ | |
| UAT-SMP-007 | Samples | Scan barcode | Samples → scan | opens correct sample | ☐ | |
| UAT-SMP-008 | Samples | Update status | patch status running | saved | ☐ | |
| UAT-SMP-009 | Samples | Reject sample | reject with reason | status rejected | ☐ | |
| UAT-SMP-010 | Samples | Lab queue | technician queue | sample appears | ☐ | |
| UAT-SMP-011 | Samples | Link invoice | create with invoice_id | invoice.sample_id set | ☐ | |
| UAT-SMP-012 | Samples | API GET /samples/:id | via API or UI | 200 + data | ☐ | |

---

## 5. Devices — General (الأجهزة)

| Test ID | القسم | الهدف | خطوات التنفيذ | النتيجة المتوقعة | Pass/Fail | ملاحظات |
|---------|-------|-------|---------------|------------------|-----------|---------|
| UAT-DEV-001 | Devices | List devices | Devices page | configured + supported lists | ☐ | |
| UAT-DEV-002 | Devices | Activate Norma | Setup Norma button | device active | ☐ | |
| UAT-DEV-003 | Devices | API key regenerate | Regenerate key | api_key_once shown once | ☐ | |
| UAT-DEV-004 | Devices | Key not in list API | refresh list | only api_key_masked | ☐ | |
| UAT-DEV-005 | Devices | Device messages | view messages tab | HL7 messages listed | ☐ | |
| UAT-DEV-006 | Devices | Inactive device | deactivate → ingest | 401/404 | ☐ | |

---

## 6. Norma (CBC)

| Test ID | القسم | الهدف | خطوات التنفيذ | النتيجة المتوقعة | Pass/Fail | ملاحظات |
|---------|-------|-------|---------------|------------------|-----------|---------|
| UAT-NRM-001 | Norma | Bridge connectivity | norma-listener running | listens :21110 | ☐ | |
| UAT-NRM-002 | Norma | HL7 ingest | send CBC from Norma | device_message imported | ☐ | |
| UAT-NRM-003 | Norma | Sample ID in PID | barcode on Norma = LIMS ID | match sample | ☐ | |
| UAT-NRM-004 | Norma | WBC mapping | import CBC | WBC numeric correct | ☐ | |
| UAT-NRM-005 | Norma | LYM% not WBC | import CBC | LYM% separate parameter | ☐ | |
| UAT-NRM-006 | Norma | Full panel import | 20+ parameters | all mapped or flagged | ☐ | |
| UAT-NRM-007 | Norma | Wrong sample ID | send unknown ID | message unmatched | ☐ | |
| UAT-NRM-008 | Norma | Replay import | replay endpoint | re-imports from stored HL7 | ☐ | |
| UAT-NRM-009 | Norma | Flags applied | high WBC value | flag HIGH | ☐ | |
| UAT-NRM-010 | Norma | Ref range species | camel sample | camel ranges used | ☐ | |
| UAT-NRM-011 | Norma | Sample status update | after import | running/completed as expected | ☐ | |
| UAT-NRM-012 | Norma | Invalid API key | wrong X-Device-Key | 401 | ☐ | |

---

## 7. Diasys (Respons 910)

| Test ID | القسم | الهدف | خطوات التنفيذ | النتيجة المتوقعة | Pass/Fail | ملاحظات |
|---------|-------|-------|---------------|------------------|-----------|---------|
| UAT-DIA-001 | Diasys | Register device | add Diasys ASTM TCP | device saved | ☐ | N/A if not used |
| UAT-DIA-002 | Diasys | ASTM message ingest | send ASTM sample | message received | ☐ | |
| UAT-DIA-003 | Diasys | Parameter mapping | CHEM results | mapped to LIMS codes | ☐ | |
| UAT-DIA-004 | Diasys | Sample link | sample ID in message | results on correct sample | ☐ | |
| UAT-DIA-005 | Diasys | Unmapped code | unknown OBX | blocked or flagged | ☐ | |
| UAT-DIA-006 | Diasys | Manual fallback | enter Diasys results manually | report shows chem section | ☐ | |
| UAT-DIA-007 | Diasys | Device messages log | view messages | ASTM stored | ☐ | |
| UAT-DIA-008 | Diasys | Connection failure | disconnect device | graceful error | ☐ | |

---

## 8. Mini Vidas

| Test ID | القسم | الهدف | خطوات التنفيذ | النتيجة المتوقعة | Pass/Fail | ملاحظات |
|---------|-------|-------|---------------|------------------|-----------|---------|
| UAT-MIN-001 | Mini Vidas | Device catalog | Devices → supported | Mini Vidas listed | ☐ | |
| UAT-MIN-002 | Mini Vidas | Register serial device | add Mini Vidas | config saved | ☐ | |
| UAT-MIN-003 | Mini Vidas | Manual immuno result | enter qualitative result | saved | ☐ | |
| UAT-MIN-004 | Mini Vidas | Report section | approve report | immuno row visible | ☐ | |
| UAT-MIN-005 | Mini Vidas | ASTM ingest (if configured) | send message | import or N/A documented | ☐ | |
| UAT-MIN-006 | Mini Vidas | Reference range | positive/negative | flag correct | ☐ | |

---

## 9. ELISA

| Test ID | القسم | الهدف | خطوات التنفيذ | النتيجة المتوقعة | Pass/Fail | ملاحظات |
|---------|-------|-------|---------------|------------------|-----------|---------|
| UAT-ELI-001 | ELISA | Order ELISA test | add ELISA test to sample | test on sample | ☐ | |
| UAT-ELI-002 | ELISA | Manual entry positive | enter Positive | flag set | ☐ | |
| UAT-ELI-003 | ELISA | Manual entry negative | enter Negative | NORMAL/negative flag | ☐ | |
| UAT-ELI-004 | ELISA | Text reference | qualitative ref | displays correctly | ☐ | |
| UAT-ELI-005 | ELISA | Report PDF | generate PDF | ELISA row in report | ☐ | |
| UAT-ELI-006 | ELISA | Portal visibility | publish report | customer sees result | ☐ | |

---

## 10. PCR

| Test ID | القسم | الهدف | خطوات التنفيذ | النتيجة المتوقعة | Pass/Fail | ملاحظات |
|---------|-------|-------|---------------|------------------|-----------|---------|
| UAT-PCR-001 | PCR | Order PCR test | add PCR panel | test linked | ☐ | |
| UAT-PCR-002 | PCR | Manual Ct value | enter numeric Ct | saved | ☐ | |
| UAT-PCR-003 | PCR | Detected/Not detected | qualitative | flag correct | ☐ | |
| UAT-PCR-004 | PCR | Validation | validate results | is_validated true | ☐ | |
| UAT-PCR-005 | PCR | Report section | approve | PCR in report | ☐ | |
| UAT-PCR-006 | PCR | Portal | customer view | matches staff | ☐ | |

---

## 11. Barcode

| Test ID | القسم | الهدف | خطوات التنفيذ | النتيجة المتوقعة | Pass/Fail | ملاحظات |
|---------|-------|-------|---------------|------------------|-----------|---------|
| UAT-BAR-001 | Barcode | Code128 content | inspect label barcode | digits only = sample ID | ☐ | |
| UAT-BAR-002 | Barcode | No Arabic in barcode | scan visually | Arabic outside bars | ☐ | |
| UAT-BAR-003 | Barcode | Preview matches print | compare screen vs label | same ID | ☐ | |
| UAT-BAR-004 | Barcode | USB scan into LIMS | scan label | sample opens | ☐ | |
| UAT-BAR-005 | Barcode | Camera scan (if used) | BarcodeScanner component | resolves sample | ☐ | |
| UAT-BAR-006 | Barcode | Invalid scan | scan random barcode | not found handled | ☐ | |
| UAT-BAR-007 | Barcode | Multiple label copies | set copies=2 | two labels print | ☐ | |
| UAT-BAR-008 | Barcode | Norma PID chain | scan → Norma | same ID accepted | ☐ | |
| UAT-BAR-009 | Barcode | API /samples/scan/:barcode | call endpoint | returns sample | ☐ | |
| UAT-BAR-010 | Barcode | verify-barcode-engine script | run script | 15/15 pass | ☐ | |

---

## 12. Zebra

| Test ID | القسم | الهدف | خطوات التنفيذ | النتيجة المتوقعة | Pass/Fail | ملاحظات |
|---------|-------|-------|---------------|------------------|-----------|---------|
| UAT-ZEB-001 | Zebra | Bridge running | localhost:9101 | bridge responds | ☐ | |
| UAT-ZEB-002 | Zebra | Print from WorkflowCase | auto print after register | label prints | ☐ | |
| UAT-ZEB-003 | Zebra | Print from Samples modal | print button | ZPL sent | ☐ | |
| UAT-ZEB-004 | Zebra | 50×25mm label size | measure label | correct dimensions | ☐ | |
| UAT-ZEB-005 | Zebra | Arabic customer name | Arabic on label | readable ^CI28 | ☐ | |
| UAT-ZEB-006 | Zebra | Test names on label | multi-test sample | tests listed | ☐ | |
| UAT-ZEB-007 | Zebra | Bridge offline | stop bridge → print | error toast/log | ☐ | |
| UAT-ZEB-008 | Zebra | No browser print fallback | verify ZPL only path | no iframe print | ☐ | |

---

## 13. Reports

| Test ID | القسم | الهدف | خطوات التنفيذ | النتيجة المتوقعة | Pass/Fail | ملاحظات |
|---------|-------|-------|---------------|------------------|-----------|---------|
| UAT-RPT-001 | Reports | Preview CBC | Reports → preview | hematology section | ☐ | |
| UAT-RPT-002 | Reports | Dynamic sections CBC only | CBC sample no chem | no chem section | ☐ | |
| UAT-RPT-003 | Reports | CBC + Chem | both ordered | two sections | ☐ | |
| UAT-RPT-004 | Reports | Parasite images | upload + include_in_report | microscopy section | ☐ | |
| UAT-RPT-005 | Reports | Flags display | high result | HIGH flag visible | ☐ | |
| UAT-RPT-006 | Reports | Reference column | numeric result | ref range shown | ☐ | |
| UAT-RPT-007 | Reports | Validate results | technician validate | is_validated | ☐ | |
| UAT-RPT-008 | Reports | Doctor approve | approve report | approval section | ☐ | |
| UAT-RPT-009 | Reports | Return for edit | return to lab | status reverts | ☐ | |
| UAT-RPT-010 | Reports | Public verify | /verify/:code | metadata shown | ☐ | |
| UAT-RPT-011 | Reports | Report list filter | filter by status | correct rows | ☐ | |
| UAT-RPT-012 | Reports | verify-report-builder | run script | 12/12 pass | ☐ | |

---

## 14. PDF

| Test ID | القسم | الهدف | خطوات التنفيذ | النتيجة المتوقعة | Pass/Fail | ملاحظات |
|---------|-------|-------|---------------|------------------|-----------|---------|
| UAT-PDF-001 | PDF | Generate server PDF | Open PDF from report | PDF downloads | ☐ | |
| UAT-PDF-002 | PDF | Design 3 layout | visual inspect | branding correct | ☐ | |
| UAT-PDF-003 | PDF | Arabic in PDF | Arabic headers | renders correctly | ☐ | |
| UAT-PDF-004 | PDF | Sections match preview | compare preview vs PDF | identical content | ☐ | |
| UAT-PDF-005 | PDF | pdf_url stored | check report record | pdf_url populated | ☐ | |
| UAT-PDF-006 | PDF | Protected PDF path | access without auth | blocked | ☐ | |
| UAT-PDF-007 | PDF | Invoice PDF | billing invoice PDF | generates | ☐ | |
| UAT-PDF-008 | PDF | Large report perf | CBC+Chem+images | < 20s generation | ☐ | |
| UAT-PDF-009 | PDF | verify consistency script | run script | 13/13 pass | ☐ | |
| UAT-PDF-010 | PDF | Re-generate after edit | edit result → new PDF | updated values | ☐ | |

---

## 15. Customer Portal

| Test ID | القسم | الهدف | خطوات التنفيذ | النتيجة المتوقعة | Pass/Fail | ملاحظات |
|---------|-------|-------|---------------|------------------|-----------|---------|
| UAT-PRT-001 | Portal | OTP request | enter mobile → request OTP | SMS received | ☐ | |
| UAT-PRT-002 | Portal | OTP verify | enter OTP | logged in | ☐ | |
| UAT-PRT-003 | Portal | Wrong OTP | invalid code | error message | ☐ | |
| UAT-PRT-004 | Portal | Dashboard | view animals | list loads | ☐ | |
| UAT-PRT-005 | Portal | Published report only | draft report sample | not visible | ☐ | |
| UAT-PRT-006 | Portal | Report sections | open report | matches staff sections | ☐ | |
| UAT-PRT-007 | Portal | PDF download | download PDF | official pdf_url file | ☐ | |
| UAT-PRT-008 | Portal | Logout | logout | session cleared | ☐ | |
| UAT-PRT-009 | Portal | Mobile layout | phone browser | usable layout | ☐ | |
| UAT-PRT-010 | Portal | OTP rate limit | 11 requests in 15 min | rate limited | ☐ | |
| UAT-PRT-011 | Portal | PORTAL_SHOW_REVIEWED off | reviewed not approved | hidden | ☐ | |
| UAT-PRT-012 | Portal | verify-portal-sync script | run script | 15/15 pass | ☐ | |

---

## 16. Workflow

| Test ID | القسم | الهدف | خطوات التنفيذ | النتيجة المتوقعة | Pass/Fail | ملاحظات |
|---------|-------|-------|---------------|------------------|-----------|---------|
| UAT-WFL-001 | Workflow | Engine disabled default | WORKFLOW_ENGINE_ENABLED=false | no workflowSummary | ☐ | |
| UAT-WFL-002 | Workflow | Engine enabled | set flag true | workflowSummary on sample | ☐ | |
| UAT-WFL-003 | Workflow | Infer SAMPLE_CREATED | open sample | state inferred | ☐ | |
| UAT-WFL-004 | Workflow | Infer REPORT_APPROVED | completed sample | correct state | ☐ | |
| UAT-WFL-005 | Workflow | GET /samples/:id/workflow | API call | summary returned | ☐ | |
| UAT-WFL-006 | Workflow | Block publish before approve | POST publish_portal early | 400 error | ☐ | |
| UAT-WFL-007 | Workflow | Reception allowed actions | reception role | no approve_report | ☐ | |
| UAT-WFL-008 | Workflow | Timeline | view timeline | inferred + audit events | ☐ | |
| UAT-WFL-009 | Workflow | Dashboard counts | admin dashboard | workflow counts if enabled | ☐ | |
| UAT-WFL-010 | Workflow | verify script | verify-laboratory-workflow | 36/36 pass | ☐ | |

---

## 17. Billing

| Test ID | القسم | الهدف | خطوات التنفيذ | النتيجة المتوقعة | Pass/Fail | ملاحظات |
|---------|-------|-------|---------------|------------------|-----------|---------|
| UAT-BIL-001 | Billing | Create invoice | Billing → new invoice | invoice created | ☐ | |
| UAT-BIL-002 | Billing | Link to sample | sample invoice | sample_id linked | ☐ | |
| UAT-BIL-003 | Billing | Invoice items | add tests | line items correct | ☐ | |
| UAT-BIL-004 | Billing | VAT calculation | check total | VAT correct | ☐ | |
| UAT-BIL-005 | Billing | Record payment | add payment | balance updated | ☐ | |
| UAT-BIL-006 | Billing | Partial payment | partial amount | status partial | ☐ | |
| UAT-BIL-007 | Billing | Invoice PDF | generate PDF | pdf_url set | ☐ | |
| UAT-BIL-008 | Billing | Cancel invoice | cancel | status cancelled | ☐ | |
| UAT-BIL-009 | Billing | Price quote | create quote | quote saved | ☐ | |
| UAT-BIL-010 | Billing | Daily closing | run closing | closing record | ☐ | |
| UAT-BIL-011 | Billing | Permissions | reception billing | allowed per role | ☐ | |
| UAT-BIL-012 | Billing | Auto-invoice on sample | if enabled | invoice auto-created | ☐ | |

---

## 18. Inventory

| Test ID | القسم | الهدف | خطوات التنفيذ | النتيجة المتوقعة | Pass/Fail | ملاحظات |
|---------|-------|-------|---------------|------------------|-----------|---------|
| UAT-INV-001 | Inventory | Add item | Inventory → add | item saved | ☐ | |
| UAT-INV-002 | Inventory | Stock in | receive stock | quantity increased | ☐ | |
| UAT-INV-003 | Inventory | Stock out | consume reagent | quantity decreased | ☐ | |
| UAT-INV-004 | Inventory | Low stock alert | below minimum | warning if configured | ☐ | |
| UAT-INV-005 | Inventory | Transaction log | view history | transactions listed | ☐ | |
| UAT-INV-006 | Inventory | Edit item | update name/unit | saved | ☐ | |
| UAT-INV-007 | Inventory | Permissions | lab tech access | per role | ☐ | |
| UAT-INV-008 | Inventory | Search | search by name | found | ☐ | |

---

## 19. Users

| Test ID | القسم | الهدف | خطوات التنفيذ | النتيجة المتوقعة | Pass/Fail | ملاحظات |
|---------|-------|-------|---------------|------------------|-----------|---------|
| UAT-USR-001 | Users | Admin create user | Users → add | user created | ☐ | |
| UAT-USR-002 | Users | Assign role | set lab_technician | role saved | ☐ | |
| UAT-USR-003 | Users | Deactivate user | is_active false | cannot login | ☐ | |
| UAT-USR-004 | Users | Change password | admin reset | new password works | ☐ | |
| UAT-USR-005 | Users | Profile update | user edits language | saved | ☐ | |
| UAT-USR-006 | Users | Last login | login → check field | updated | ☐ | |
| UAT-USR-007 | Users | Duplicate username | create duplicate | error | ☐ | |
| UAT-USR-008 | Users | /auth/me | login → me endpoint | permissions returned | ☐ | |

---

## 20. Roles

| Test ID | القسم | الهدف | خطوات التنفيذ | النتيجة المتوقعة | Pass/Fail | ملاحظات |
|---------|-------|-------|---------------|------------------|-----------|---------|
| UAT-ROL-001 | Roles | Reception menu | login reception | reception menus only | ☐ | |
| UAT-ROL-002 | Roles | Technician no billing admin | try billing settings | 403/denied | ☐ | |
| UAT-ROL-003 | Roles | Doctor approve | approve report | success | ☐ | |
| UAT-ROL-004 | Roles | Reception no approve | try approve | denied | ☐ | |
| UAT-ROL-005 | Roles | Manager dashboard | admin stats | full dashboard | ☐ | |
| UAT-ROL-006 | Roles | Admin all permissions | admin login | all menus | ☐ | |
| UAT-ROL-007 | Roles | API authorize | call forbidden endpoint | 403 | ☐ | |
| UAT-ROL-008 | Roles | Custom role permissions | modify role perms | enforced on login | ☐ | |

---

## 21. Notifications

| Test ID | القسم | الهدف | خطوات التنفيذ | النتيجة المتوقعة | Pass/Fail | ملاحظات |
|---------|-------|-------|---------------|------------------|-----------|---------|
| UAT-NOT-001 | Notifications | Queue SMS | trigger report notify | queued | ☐ | |
| UAT-NOT-002 | Notifications | SMS delivery | Msegat enabled | status sent | ☐ | |
| UAT-NOT-003 | Notifications | SMS disabled | SMS_ENABLED=false | graceful skip | ☐ | |
| UAT-NOT-004 | Notifications | Notification list | admin view queue | rows shown | ☐ | |
| UAT-NOT-005 | Notifications | Failed notification | invalid recipient | status failed | ☐ | |
| UAT-NOT-006 | Notifications | Report SMS Arabic | read message body | Arabic template | ☐ | |
| UAT-NOT-007 | Notifications | Metadata sample_id | check queue row | sample linked | ☐ | |
| UAT-NOT-008 | Notifications | Poller running | wait 60s | pending processed | ☐ | |

---

## 22. Backup

| Test ID | القسم | الهدف | خطوات التنفيذ | النتيجة المتوقعة | Pass/Fail | ملاحظات |
|---------|-------|-------|---------------|------------------|-----------|---------|
| UAT-BAK-001 | Backup | DB manual backup | npm run backup | .sql.gz created | ☐ | |
| UAT-BAK-002 | Backup | DB cron | check Render cron log | daily success | ☐ | |
| UAT-BAK-003 | Backup | Uploads backup script | UPLOAD_BACKUP_ENABLED=true → run | tar.gz created | ☐ | |
| UAT-BAK-004 | Backup | S3 upload (if configured) | backup with S3 keys | s3 URI logged | ☐ | |
| UAT-BAK-005 | Backup | Retention prune | old backups | removed per policy | ☐ | |
| UAT-BAK-006 | Backup | Backup file size | inspect file | size > 0 | ☐ | |
| UAT-BAK-007 | Backup | Pre-deploy backup | follow DEPLOYMENT_CHECKLIST | backup before deploy | ☐ | |
| UAT-BAK-008 | Backup | Documentation | BACKUP_AND_ROLLBACK.md | procedure clear | ☐ | |

---

## 23. Restore

| Test ID | القسم | الهدف | خطوات التنفيذ | النتيجة المتوقعة | Pass/Fail | ملاحظات |
|---------|-------|-------|---------------|------------------|-----------|---------|
| UAT-RES-001 | Restore | DB restore staging | pg_restore on copy | data restored | ☐ | |
| UAT-RES-002 | Restore | Uploads restore | extract tar to uploads path | files accessible | ☐ | |
| UAT-RES-003 | Restore | App rollback | Render previous deploy | app runs | ☐ | |
| UAT-RES-004 | Restore | Post-restore health | GET /api/health | healthy | ☐ | |
| UAT-RES-005 | Restore | Post-restore smoke | login + sample list | works | ☐ | |
| UAT-RES-006 | Restore | Order of operations | restore DB before app | documented followed | ☐ | |

---

## 24. Deploy

| Test ID | القسم | الهدف | خطوات التنفيذ | النتيجة المتوقعة | Pass/Fail | ملاحظات |
|---------|-------|-------|---------------|------------------|-----------|---------|
| UAT-DEP-001 | Deploy | build:cloud | run build | staff+portal dist | ☐ | |
| UAT-DEP-002 | Deploy | start:cloud | boot server | migrations complete | ☐ | |
| UAT-DEP-003 | Deploy | Health after deploy | /api/health | 200 ok | ☐ | |
| UAT-DEP-004 | Deploy | Env vars | verify Render dashboard | JWT, DB, URLs set | ☐ | |
| UAT-DEP-005 | Deploy | Both domains | lims + portal | both serve SPA | ☐ | |
| UAT-DEP-006 | Deploy | DEPLOYMENT_CHECKLIST | follow checklist | all P0 ✓ | ☐ | |

---

## 25. Performance

| Test ID | القسم | الهدف | خطوات التنفيذ | النتيجة المتوقعة | Pass/Fail | ملاحظات |
|---------|-------|-------|---------------|------------------|-----------|---------|
| UAT-PRF-001 | Performance | Sample list 100+ | load samples page | < 3s | ☐ | |
| UAT-PRF-002 | Performance | Norma import time | time CBC import | < 15s | ☐ | |
| UAT-PRF-003 | Performance | PDF generation | time PDF | < 20s | ☐ | |
| UAT-PRF-004 | Performance | Portal dashboard | login → dashboard | < 5s | ☐ | |
| UAT-PRF-005 | Performance | Concurrent users | 5 staff simultaneous | no errors | ☐ | |
| UAT-PRF-006 | Performance | Dashboard stats | admin dashboard load | < 3s | ☐ | |
| UAT-PRF-007 | Performance | Large parasitology images | upload 5MB image | succeeds | ☐ | |
| UAT-PRF-008 | Performance | API health under load | 50 req/min | stable | ☐ | |

---

## 26. Security

| Test ID | القسم | الهدف | خطوات التنفيذ | النتيجة المتوقعة | Pass/Fail | ملاحظات |
|---------|-------|-------|---------------|------------------|-----------|---------|
| UAT-SEC-001 | Security | Login rate limit | 6 failed logins | 429 RATE_LIMITED | ☐ | |
| UAT-SEC-002 | Security | Forgot password no token | POST forgot-password | no resetToken in JSON | ☐ | |
| UAT-SEC-003 | Security | Device key hashed | list devices API | no full api_key | ☐ | |
| UAT-SEC-004 | Security | Invalid device key | ingest wrong key | 401 | ☐ | |
| UAT-SEC-005 | Security | JWT required | API without token | 401 | ☐ | |
| UAT-SEC-006 | Security | Portal token on staff route | portal JWT on /api/samples | 401 | ☐ | |
| UAT-SEC-007 | Security | CORS blocked | origin not in list | CORS error | ☐ | |
| UAT-SEC-008 | Security | Protected PDF URL | /uploads/reports/ no auth | denied | ☐ | |
| UAT-SEC-009 | Security | SQL injection attempt | `' OR 1=1 --` in search | no leak/error safe | ☐ | |
| UAT-SEC-010 | Security | XSS in customer name | `<script>` in name field | escaped in UI | ☐ | |
| UAT-SEC-011 | Security | verify-security-phase9 | run script | 20/20 pass | ☐ | |
| UAT-SEC-012 | Security | Swagger hidden prod | GET /api/docs | 404 unless enabled | ☐ | |

---

## UAT summary sheet

| Section | Total | Passed | Failed | Blocked | % Pass |
|---------|-------|--------|--------|---------|--------|
| Customers | 8 | | | | |
| Animals | 8 | | | | |
| Orders | 7 | | | | |
| Samples | 12 | | | | |
| Devices | 6 | | | | |
| Norma | 12 | | | | |
| Diasys | 8 | | | | |
| Mini Vidas | 6 | | | | |
| ELISA | 6 | | | | |
| PCR | 6 | | | | |
| Barcode | 10 | | | | |
| Zebra | 8 | | | | |
| Reports | 12 | | | | |
| PDF | 10 | | | | |
| Portal | 12 | | | | |
| Workflow | 10 | | | | |
| Billing | 12 | | | | |
| Inventory | 8 | | | | |
| Users | 8 | | | | |
| Roles | 8 | | | | |
| Notifications | 8 | | | | |
| Backup | 8 | | | | |
| Restore | 6 | | | | |
| Deploy | 6 | | | | |
| Performance | 8 | | | | |
| Security | 12 | | | | |
| **TOTAL** | **225** | | | | |

**UAT sign-off:** ☐ Approved for go-live ☐ Conditional ☐ Rejected

**Signatories:** _______________ Date: _______________

---

## Related documents

- [GO_LIVE_CHECKLIST.md](./GO_LIVE_CHECKLIST.md)
- [POST_GO_LIVE_CHECKLIST.md](./POST_GO_LIVE_CHECKLIST.md)
- [BUG_TRACKER.md](./BUG_TRACKER.md)
- [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md)
- [TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md)
