/**
 * Culture / smear AST — unit verification (no DB).
 * Usage: node src/scripts/verify-culture-ast-report.js
 */
const assert = require('assert');
const {
  isCultureTest,
  isCultureRow,
  isNoGrowthValue,
  hasCulturePayload,
  mapCultureToValues,
  CULTURE_ANTIBIOTICS,
} = require('../utils/culture-ast');
const {
  buildCultureCard,
  isCultureRecommendationDuplicate,
} = require('../utils/culture-report');
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

console.log('\n=== Culture AST report ===\n');

check('CULT-BACT is a culture test', () => {
  assert.strictEqual(isCultureTest({ test_code: 'CULT-BACT', category_code: 'CULT' }), true);
});

check('uterine smear name is a culture test', () => {
  assert.strictEqual(isCultureTest({
    test_code: 'CEC-UTERINE',
    category_code: 'OTHER',
    test_name_ar: 'المسحات الرحمية',
  }), true);
});

check('blood parasites stay out of culture', () => {
  assert.strictEqual(isCultureTest({
    test_code: 'PARAS-BLOOD',
    category_code: 'MICRO',
    test_name_ar: 'طفيليات الدم',
  }), false);
});

check('flag off keeps CULT in other section', () => {
  assert.strictEqual(builder.resolveSectionType('CULT-BACT', 'CULT'), 'other');
});

check('No growth detection', () => {
  assert.strictEqual(isNoGrowthValue('No growth'), true);
  assert.strictEqual(isNoGrowthValue('لا نمو'), true);
  assert.strictEqual(isNoGrowthValue('Growth'), false);
});

check('legacy single GROWTH row builds a no-growth card', () => {
  const card = buildCultureCard([
    {
      testCode: 'CULT-BACT',
      categoryCode: 'CULT',
      testNameAr: 'المسحات الرحمية',
      testNameEn: 'Uterine smears',
      systemCode: 'CEC',
      value: 'No growth',
    },
  ], 'ar');
  assert.ok(card.noGrowth);
  assert.strictEqual(card.growth, 'لا نمو');
  assert.strictEqual(card.specimen, 'المسحات الرحمية');
  assert.strictEqual(card.hasAst, false);
});

check('AST card splits three columns', () => {
  const card = buildCultureCard([
    { testCode: 'CULT-BACT', categoryCode: 'CULT', testNameEn: 'Milk culture', systemCode: 'SPECIMEN', value: 'Milk' },
    { testCode: 'CULT-BACT', categoryCode: 'CULT', systemCode: 'GROWTH', value: 'Growth' },
    { testCode: 'CULT-BACT', categoryCode: 'CULT', systemCode: 'ORGANISM', value: 'Coliform Bacilli' },
    { testCode: 'CULT-BACT', categoryCode: 'CULT', systemCode: 'GRAM', value: 'Gram-negative Bacilli' },
    { testCode: 'CULT-BACT', categoryCode: 'CULT', systemCode: 'SENS_HIGH', value: 'Enrofloxacin\nCiprofloxacin' },
    { testCode: 'CULT-BACT', categoryCode: 'CULT', systemCode: 'SENS_WEAK', value: 'Doxycycline' },
    { testCode: 'CULT-BACT', categoryCode: 'CULT', systemCode: 'SENS_RES', value: 'Penicillin, Ampicillin' },
  ], 'en');
  assert.strictEqual(card.noGrowth, false);
  assert.strictEqual(card.organism, 'Coliform Bacilli');
  assert.deepStrictEqual(card.highly, ['Enrofloxacin', 'Ciprofloxacin']);
  assert.deepStrictEqual(card.weak, ['Doxycycline']);
  assert.deepStrictEqual(card.resistant, ['Penicillin', 'Ampicillin']);
  assert.strictEqual(card.hasAst, true);
});

check('mapCultureToValues writes growth and AST params', () => {
  const byCode = new Map([
    ['SPECIMEN', { id: 'p1' }],
    ['GROWTH', { id: 'p2' }],
    ['ORGANISM', { id: 'p3' }],
    ['SENS_HIGH', { id: 'p4' }],
    ['SENS_RES', { id: 'p5' }],
  ]);
  const values = mapCultureToValues({
    specimen: 'Milk',
    growth: 'Growth',
    organism: 'Coliform Bacilli',
    highly_sensitive: ['Enrofloxacin'],
    weak_sensitive: [],
    resistant: ['Penicillin'],
  }, { byCode, growthCode: 'GROWTH' });
  const byId = Object.fromEntries(values.map((v) => [v.parameter_id, v.value]));
  assert.strictEqual(byId.p1, 'Milk');
  assert.strictEqual(byId.p2, 'Growth');
  assert.strictEqual(byId.p3, 'Coliform Bacilli');
  assert.strictEqual(byId.p4, 'Enrofloxacin');
  assert.strictEqual(byId.p5, 'Penicillin');
});

check('no-growth payload clears AST lists', () => {
  const byCode = new Map([
    ['GROWTH', { id: 'p2' }],
    ['ORGANISM', { id: 'p3' }],
    ['SENS_HIGH', { id: 'p4' }],
  ]);
  const values = mapCultureToValues({
    growth: 'No growth',
    organism: 'should-clear',
    highly_sensitive: ['Enrofloxacin'],
  }, { byCode, growthCode: 'GROWTH' });
  assert.strictEqual(values.length, 1);
  assert.strictEqual(values[0].value, 'No growth');
});

check('recommendation duplicate of No growth is detected', () => {
  assert.strictEqual(isCultureRecommendationDuplicate('No growth', [
    { testCode: 'CULT-BACT', categoryCode: 'CULT', value: 'No growth' },
  ]), true);
  assert.strictEqual(isCultureRecommendationDuplicate('Give fluids', [
    { testCode: 'CULT-BACT', categoryCode: 'CULT', value: 'No growth' },
  ]), false);
});

check('hasCulturePayload and antibiotic list length', () => {
  assert.strictEqual(hasCulturePayload({ growth: 'No growth' }), true);
  assert.strictEqual(hasCulturePayload({}), false);
  assert.ok(CULTURE_ANTIBIOTICS.includes('Enrofloxacin'));
  assert.ok(CULTURE_ANTIBIOTICS.includes('Penicillin'));
});

check('isCultureRow uses test name', () => {
  assert.strictEqual(isCultureRow({
    testCode: 'X1',
    categoryCode: 'OTHER',
    testNameAr: 'المسحات الرحمية',
    value: 'No growth',
  }), true);
});

(async () => {
  await checkAsync('HTML no-growth culture box has no AST columns', async () => {
    const html = await buildReportHtml({
      language: 'ar',
      sampleCode: '26000717',
      reportNumber: 'RPT-CULT',
      sections: [{
        sectionType: 'culture',
        title: 'المزرعة وحساسية المضادات',
        results: [{
          testCode: 'CULT-BACT',
          categoryCode: 'CULT',
          testNameAr: 'المسحات الرحمية',
          systemCode: 'CEC',
          value: 'No growth',
        }],
      }],
    });
    assert.ok(html.includes('section--culture'));
    assert.ok(html.includes('لا نمو'));
    assert.ok(html.includes('المسحات الرحمية'));
    assert.ok(!html.includes('Highly Sens'));
  });

  await checkAsync('HTML growth card has three AST columns', async () => {
    const html = await buildReportHtml({
      language: 'en',
      sampleCode: 'MILK-1',
      reportNumber: 'RPT-AST',
      sections: [{
        sectionType: 'culture',
        title: 'Culture & Antibiotic Sensitivity',
        results: [
          { testCode: 'CULT-BACT', categoryCode: 'CULT', testNameEn: 'Bacterial Culture', systemCode: 'SPECIMEN', value: 'Milk' },
          { testCode: 'CULT-BACT', categoryCode: 'CULT', systemCode: 'GROWTH', value: 'Growth' },
          { testCode: 'CULT-BACT', categoryCode: 'CULT', systemCode: 'ORGANISM', value: 'Coliform Bacilli' },
          { testCode: 'CULT-BACT', categoryCode: 'CULT', systemCode: 'SENS_HIGH', value: 'Enrofloxacin' },
          { testCode: 'CULT-BACT', categoryCode: 'CULT', systemCode: 'SENS_WEAK', value: 'Doxycycline' },
          { testCode: 'CULT-BACT', categoryCode: 'CULT', systemCode: 'SENS_RES', value: 'Penicillin' },
        ],
      }],
    });
    assert.ok(html.includes('Antibiotic Sensitivity'));
    assert.ok(html.includes('Coliform Bacilli'));
    assert.ok(html.includes('Enrofloxacin'));
    assert.ok(html.includes('Doxycycline'));
    assert.ok(html.includes('Penicillin'));
    assert.ok(html.includes('Highly Sens'));
    assert.ok(html.includes('Weak Sens'));
    assert.ok(html.includes('Resistant'));
  });

  await checkAsync('flag-off generic table still used for other sections', async () => {
    const html = await buildReportHtml({
      language: 'ar',
      sampleCode: 'X',
      reportNumber: 'RPT-X',
      sections: [{
        sectionType: 'other',
        title: 'نتائج المختبر',
        results: [{
          testCode: 'CULT-BACT',
          categoryCode: 'CULT',
          testNameAr: 'المسحات الرحمية',
          nameAr: 'CEC',
          value: 'No growth',
        }],
      }],
    });
    assert.ok(html.includes('نتائج المختبر'));
    assert.ok(!html.includes('section section--culture'));
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed) process.exit(1);
})();
