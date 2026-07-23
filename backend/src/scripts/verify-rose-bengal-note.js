/**
 * Rose Bengal positive confirmation note (no DB).
 * Usage: node src/scripts/verify-rose-bengal-note.js
 */
const assert = require('assert');
const {
  NOTE_AR,
  hasPositiveRoseBengal,
  isPositiveRoseBengalRow,
  isRoseBengalTestCode,
  roseBengalConfirmNote,
} = require('../utils/rose-bengal-note');
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
  console.log('\n=== Rose Bengal confirmation note ===\n');

  check('recognizes BRUCELLA / BRU-ROSE-BENGAL, not ELISA', () => {
    assert.strictEqual(isRoseBengalTestCode('BRUCELLA'), true);
    assert.strictEqual(isRoseBengalTestCode('BRU-ROSE-BENGAL'), true);
    assert.strictEqual(isRoseBengalTestCode('BRU-ELISA'), false);
    assert.strictEqual(isRoseBengalTestCode('ELISA-FMD'), false);
  });

  check('positive only when POS / إيجابي', () => {
    assert.strictEqual(isPositiveRoseBengalRow({ testCode: 'BRUCELLA', flag: 'POS', value: 'إيجابي' }), true);
    assert.strictEqual(isPositiveRoseBengalRow({ testCode: 'BRUCELLA', flag: 'NEG', value: 'سلبي' }), false);
    assert.strictEqual(isPositiveRoseBengalRow({
      testCode: 'BRUCELLA',
      value: 'لا توجد مالطيه',
    }), false);
    assert.strictEqual(hasPositiveRoseBengal([{ testCode: 'BRUCELLA', flag: 'NEG' }]), false);
  });

  check('note Arabic text matches lab wording', () => {
    assert.strictEqual(roseBengalConfirmNote('ar'), NOTE_AR);
    assert.ok(roseBengalConfirmNote('ar').includes('ELISA'));
  });

  await checkAsync('report HTML includes note when Rose Bengal POS', async () => {
    const html = await buildReportHtml({
      language: 'ar',
      sampleCode: 'RVC-TEST',
      reportNumber: 'RPT-TEST',
      results: [{
        testCode: 'BRUCELLA',
        categoryCode: 'MICRO',
        nameAr: 'روز بنغال',
        nameEn: 'Rose Bengal',
        testNameAr: 'المالطية',
        testNameEn: 'Brucella',
        value: 'إيجابي',
        unit: '—',
        reference: 'سلبي',
        flag: 'POS',
      }],
    });
    assert.ok(html.includes(NOTE_AR), 'expected Arabic note in HTML');
  });

  await checkAsync('report HTML omits note when NEG', async () => {
    const html = await buildReportHtml({
      language: 'ar',
      sampleCode: 'RVC-TEST',
      reportNumber: 'RPT-TEST',
      results: [{
        testCode: 'BRUCELLA',
        categoryCode: 'MICRO',
        nameAr: 'روز بنغال',
        value: 'سلبي',
        flag: 'NEG',
      }],
    });
    assert.ok(!html.includes(NOTE_AR), 'note must not appear for NEG');
  });

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed ? 1 : 0);
})();
