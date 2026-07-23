/**
 * Report design-3: CBC/CHEM boxed sections + one box per parasite test.
 * Usage: node src/scripts/verify-report-section-boxes.js
 */
const assert = require('assert');
const builder = require('../services/report-builder.service');
const { buildReportHtml } = require('../utils/report-designs/design-3/build-html');

let passed = 0;
let failed = 0;

const check = (label, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${label}: ${err.message}`);
  }
};

const checkAsync = async (label, fn) => {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${label}: ${err.message}`);
  }
};

(async () => {
  console.log('\n=== Report section boxes ===\n');

  check('BRUCELLA resolves to brucella section', () => {
    assert.strictEqual(builder.resolveSectionType('BRUCELLA', 'MICRO'), 'brucella');
    assert.strictEqual(builder.resolveSectionType('BRU-ELISA', 'ELISA'), 'elisa');
  });

  check('CBC / CHEM / parasites are distinct section types', () => {
    const sections = builder.buildReportSections({
      language: 'ar',
      orderedTests: [
        { test_code: 'CBC-FULL', category_code: 'CBC', name_ar: 'صورة دم', name: 'CBC' },
        { test_code: 'CHEM-BASIC', category_code: 'CHEM', name_ar: 'كيمياء', name: 'Chem' },
        { test_code: 'PARAS-BLOOD', category_code: 'MICRO', name_ar: 'طفيليات الدم', name: 'Blood Parasites' },
        { test_code: 'PARAS-STOOL', category_code: 'MICRO', name_ar: 'طفيليات البراز', name: 'Stool Parasites' },
        { test_code: 'BRUCELLA', category_code: 'MICRO', name_ar: 'المالطية', name: 'Brucella' },
      ],
      results: [
        { testCode: 'CBC-FULL', categoryCode: 'CBC', testNameAr: 'صورة دم', nameAr: 'WBC', value: '10', flag: 'NORMAL' },
        { testCode: 'CHEM-BASIC', categoryCode: 'CHEM', testNameAr: 'كيمياء الدم', nameAr: 'GLU', value: '90', flag: 'NORMAL' },
        { testCode: 'PARAS-BLOOD', categoryCode: 'MICRO', testNameAr: 'طفيليات الدم', nameAr: 'بابيسيا', value: 'سلبي', flag: 'NEG' },
        { testCode: 'PARAS-STOOL', categoryCode: 'MICRO', testNameAr: 'طفيليات البراز', nameAr: 'كوكسيديا', value: 'سلبي', flag: 'NEG' },
        { testCode: 'BRUCELLA', categoryCode: 'MICRO', testNameAr: 'المالطية روز بنغال', nameAr: 'روز بنغال', value: 'سلبي', flag: 'NEG' },
      ],
    });
    const types = sections.map((s) => s.sectionType);
    assert.ok(types.includes('hematology'));
    assert.ok(types.includes('chemistry'));
    assert.ok(types.includes('blood_parasites'));
    assert.ok(types.includes('fecal'));
    assert.ok(types.includes('brucella'));
  });

  await checkAsync('HTML has boxed CBC + CHEM + one box per parasite test', async () => {
    const html = await buildReportHtml({
      language: 'ar',
      sampleCode: 'RVC-BOX',
      reportNumber: 'RPT-BOX',
      sections: [
        {
          sectionType: 'hematology',
          title: 'صورة الدم',
          results: [{
            testCode: 'CBC-FULL', categoryCode: 'CBC', testNameAr: 'صورة دم كاملة',
            nameAr: 'WBC', value: '10', unit: '10^3/uL', reference: '4-15', flag: 'NORMAL',
          }],
        },
        {
          sectionType: 'chemistry',
          title: 'كيمياء الدم',
          results: [{
            testCode: 'CHEM-BASIC', categoryCode: 'CHEM', testNameAr: 'كيمياء الدم',
            nameAr: 'GLU', value: '90', unit: 'mg/dL', reference: '70-120', flag: 'NORMAL',
          }],
        },
        {
          sectionType: 'blood_parasites',
          title: 'طفيليات الدم',
          results: [{
            testCode: 'PARAS-BLOOD', categoryCode: 'MICRO', testNameAr: 'طفيليات الدم',
            nameAr: 'بابيسيا', value: 'سلبي', flag: 'NEG',
          }],
        },
        {
          sectionType: 'fecal',
          title: 'فحص البراز',
          results: [{
            testCode: 'PARAS-STOOL', categoryCode: 'MICRO', testNameAr: 'طفيليات البراز',
            nameAr: 'كوكسيديا', value: 'سلبي', flag: 'NEG',
          }],
        },
        {
          sectionType: 'brucella',
          title: 'المالطية',
          results: [{
            testCode: 'BRUCELLA', categoryCode: 'MICRO', testNameAr: 'المالطية روز بنغال',
            nameAr: 'روز بنغال', value: 'سلبي', flag: 'NEG',
          }],
        },
      ],
    });

    const boxes = (html.match(/section--results-box/g) || []).length;
    assert.ok(boxes >= 5, `expected ≥5 result boxes, got ${boxes}`);
    assert.ok(html.includes('صورة الدم'));
    assert.ok(html.includes('كيمياء الدم'));
    assert.ok(html.includes('طفيليات الدم'));
    assert.ok(html.includes('طفيليات البراز'));
    assert.ok(html.includes('المالطية روز بنغال'));
    assert.ok(html.includes('section__head--box'));
  });

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed ? 1 : 0);
})();
