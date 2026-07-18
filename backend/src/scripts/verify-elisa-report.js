/**
 * ELISA report — text reference display (no DB).
 * Covers: numeric S/P% + text_reference → report row → matrix Ref. Range.
 * Usage: node src/scripts/verify-elisa-report.js
 */
const assert = require('assert');
const engine = require('../services/result-engine.service');
const { buildElisaMatrixRows } = require('../utils/elisa-report');

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

const TEXT_REF = [
  'Negative: S/P% < 40',
  'Suspect: 40–50',
  'Positive: S/P% ≥ 50',
].join('\n');

const limsRow = (code, extras = {}) => ({
  parameter_id: extras.parameter_id || code,
  parameter_code: code,
  parameter_name: extras.parameter_name || code,
  parameter_name_ar: extras.parameter_name_ar || code,
  test_code: extras.test_code || 'ELISA-FMD',
  test_name: extras.test_name || 'FMD ELISA',
  test_name_ar: extras.test_name_ar || 'إليزا الحمى القلاعية',
  test_method: extras.test_method || 'ELISA',
  category_code: 'ELISA',
  unit: extras.unit || null,
  value: extras.value,
  trr_min: extras.min ?? null,
  trr_max: extras.max ?? null,
  trr_text_reference: extras.text_reference ?? null,
  trr_is_active: true,
  trr_animal_type: extras.animal_type || 'camel',
});

console.log('\n=== ELISA report — text reference ===\n');

check('SP-RATIO numeric + text_reference → hasReference + text', () => {
  const row = limsRow('SP-RATIO', {
    value: '62',
    unit: '%',
    text_reference: TEXT_REF,
  });
  const ev = engine.evaluateResult(row);
  assert.strictEqual(ev.hasReference, true);
  assert.strictEqual(ev.reference, TEXT_REF);
  assert.notStrictEqual(ev.flag, engine.RESULT_FLAGS.HIGH);
  assert.notStrictEqual(ev.flag, engine.RESULT_FLAGS.LOW);
});

check('buildReportResultRow keeps text (not غير متوفر)', () => {
  const row = limsRow('SP-RATIO', {
    value: '62',
    unit: '%',
    text_reference: TEXT_REF,
  });
  const reportRow = engine.buildReportResultRow(row, { language: 'ar' });
  assert.strictEqual(reportRow.hasReference, true);
  assert.strictEqual(reportRow.reference, TEXT_REF);
  assert.notStrictEqual(reportRow.reference, 'غير متوفر');
  assert.notStrictEqual(reportRow.reference, 'N/A');
});

check('ELISA matrix Ref. Range uses SP text_reference', () => {
  const sp = engine.buildReportResultRow(
    limsRow('SP-RATIO', { value: '62', unit: '%', text_reference: TEXT_REF }),
    { language: 'ar' }
  );
  const qual = engine.buildReportResultRow(
    limsRow('RESULT', { value: 'positive', unit: 'qual' }),
    { language: 'ar' }
  );
  const matrix = buildElisaMatrixRows([sp, qual], { sampleCode: 'RVC-001', lang: 'ar' });
  assert.strictEqual(matrix.length, 1);
  assert.strictEqual(matrix[0].spPercent, '62');
  assert.strictEqual(matrix[0].result, 'إيجابي');
  assert.strictEqual(matrix[0].reference, TEXT_REF);
});

check('ELISA matrix falls back to RESULT text_reference', () => {
  const sp = engine.buildReportResultRow(
    limsRow('SP-RATIO', { value: '12', unit: '%' }),
    { language: 'ar' }
  );
  const qual = engine.buildReportResultRow(
    limsRow('RESULT', {
      value: 'negative',
      unit: 'qual',
      text_reference: TEXT_REF,
    }),
    { language: 'ar' }
  );
  const matrix = buildElisaMatrixRows([sp, qual], { sampleCode: 'RVC-002', lang: 'en' });
  assert.strictEqual(matrix.length, 1);
  assert.strictEqual(matrix[0].result, 'Negative');
  assert.strictEqual(matrix[0].reference, TEXT_REF);
});

check('No text_reference → غير متوفر', () => {
  const sp = engine.buildReportResultRow(
    limsRow('SP-RATIO', { value: '10', unit: '%' }),
    { language: 'ar' }
  );
  const qual = engine.buildReportResultRow(
    limsRow('RESULT', { value: 'negative', unit: 'qual' }),
    { language: 'ar' }
  );
  const matrix = buildElisaMatrixRows([sp, qual], { lang: 'ar' });
  assert.strictEqual(matrix[0].reference, 'غير متوفر');
});

check('Non-ELISA rows ignored by matrix', () => {
  const cbc = engine.buildReportResultRow(
    {
      parameter_code: 'WBC',
      value: '10',
      unit: '10^3/uL',
      category_code: 'CBC',
      test_code: 'CBC-FULL',
      trr_min: 4,
      trr_max: 15,
      trr_is_active: true,
    },
    { language: 'ar' }
  );
  assert.strictEqual(buildElisaMatrixRows([cbc], { lang: 'ar' }).length, 0);
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed ? 1 : 0);
