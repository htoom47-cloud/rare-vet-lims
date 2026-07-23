#!/usr/bin/env node
/**
 * Write a design-3 demo report HTML (boxed CBC / CHEM / parasites) for browser preview.
 * Usage: node src/scripts/write-demo-report-html.js [outPath]
 */
const fs = require('fs');
const path = require('path');
const builder = require('../services/report-builder.service');
const { buildReportHtml } = require('../utils/report-designs/design-3/build-html');

const outPath = path.resolve(
  process.argv[2]
  || path.join(__dirname, '../../../tools/demo-report-section-boxes.html')
);

const results = [
  {
    testCode: 'CBC-FULL', categoryCode: 'CBC', testNameAr: 'صورة الدم', testNameEn: 'CBC',
    code: 'WBC', nameAr: 'كريات الدم البيضاء', nameEn: 'WBC', value: '12.4', unit: '10³/µL',
    reference: '6.0 - 12.0', flag: 'HIGH',
  },
  {
    testCode: 'CBC-FULL', categoryCode: 'CBC', testNameAr: 'صورة الدم', testNameEn: 'CBC',
    code: 'RBC', nameAr: 'كريات الدم الحمراء', nameEn: 'RBC', value: '7.8', unit: '10⁶/µL',
    reference: '7.0 - 12.0', flag: 'NORMAL',
  },
  {
    testCode: 'CBC-FULL', categoryCode: 'CBC', testNameAr: 'صورة الدم', testNameEn: 'CBC',
    code: 'PLT', nameAr: 'الصفائح الدموية', nameEn: 'PLT', value: '98', unit: '10³/µL',
    reference: '150 - 400', flag: 'LOW',
  },
  {
    testCode: 'CHEM-BASIC', categoryCode: 'CHEM', testNameAr: 'كيمياء الدم', testNameEn: 'Chemistry',
    code: 'GLU', nameAr: 'الجلوكوز', nameEn: 'Glucose', value: '95', unit: 'mg/dL',
    reference: '60 - 120', flag: 'NORMAL',
  },
  {
    testCode: 'CHEM-BASIC', categoryCode: 'CHEM', testNameAr: 'كيمياء الدم', testNameEn: 'Chemistry',
    code: 'BUN', nameAr: 'نيتروجين اليوريا', nameEn: 'BUN', value: '38', unit: 'mg/dL',
    reference: '10 - 30', flag: 'HIGH',
  },
  {
    testCode: 'CHEM-BASIC', categoryCode: 'CHEM', testNameAr: 'كيمياء الدم', testNameEn: 'Chemistry',
    code: 'CREA', nameAr: 'الكرياتينين', nameEn: 'Creatinine', value: '1.4', unit: 'mg/dL',
    reference: '0.8 - 2.0', flag: 'NORMAL',
  },
  {
    testCode: 'PARAS-BLOOD', categoryCode: 'MICRO', testNameAr: 'طفيليات الدم', testNameEn: 'Blood Parasites',
    code: 'RESULT', nameAr: 'النتيجة', nameEn: 'Result',
    value: 'لم يتم العثور على أي طفيلي بعد الفحص', unit: '—',
    reference: '—', flag: 'NEG',
  },
  {
    testCode: 'PARAS-STOOL', categoryCode: 'MICRO', testNameAr: 'طفيليات البراز', testNameEn: 'Stool Parasites',
    code: 'RESULT', nameAr: 'النتيجة', nameEn: 'Result',
    value: 'لم يتم العثور على أي طفيلي بعد الفحص', unit: '—',
    reference: '—', flag: 'NEG',
  },
  {
    testCode: 'BRUCELLA', categoryCode: 'MICRO', testNameAr: 'المالطية روز بنغال', testNameEn: 'Brucella Rose Bengal',
    code: 'RESULT', nameAr: 'روز بنغال', nameEn: 'Rose Bengal',
    value: 'لا توجد مالطيه', unit: '—',
    reference: '—', flag: 'NEG',
  },
];

const orderedTests = [
  { test_code: 'CBC-FULL', category_code: 'CBC' },
  { test_code: 'CHEM-BASIC', category_code: 'CHEM' },
  { test_code: 'PARAS-BLOOD', category_code: 'MICRO' },
  { test_code: 'PARAS-STOOL', category_code: 'MICRO' },
  { test_code: 'BRUCELLA', category_code: 'MICRO' },
];

(async () => {
  const sections = builder.buildReportSections({
    language: 'ar',
    orderedTests,
    results,
    attachments: [],
  });

  const html = await buildReportHtml({
    language: 'ar',
    reportNumber: 'RPT-DEMO-BOXES',
    sampleCode: 'SMP-DEMO-0042',
    barcode: 'SMP-DEMO-0042',
    status: 'final',
    issuedAt: new Date().toISOString(),
    customer: { name: 'عميل تجريبي' },
    animal: {
      name: 'نادر',
      type: 'camel',
      code: 'ANM-DEMO',
      gender: 'male',
      age: '4 سنوات',
    },
    sample: { type: 'Blood + Stool', collectionDate: new Date().toISOString() },
    sections,
    results,
    approvals: {
      lab: { approved: true, name: 'د. فاطمة الزهراني', approvedAt: new Date().toISOString() },
      vet: { approved: true, name: 'د. خالد المنصور', approvedAt: new Date().toISOString() },
    },
  });

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html, 'utf8');
  console.log(outPath);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
