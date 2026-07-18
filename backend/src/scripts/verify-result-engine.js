/**
 * Result Engine — unit verification (no DB required).
 * Usage: node src/scripts/verify-result-engine.js
 */
const assert = require('assert');
const engine = require('../services/result-engine.service');

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

const limsRow = (code, min, max, extras = {}) => ({
  parameter_code: code,
  trr_min: min,
  trr_max: max,
  trr_critical_low: extras.critical_low ?? null,
  trr_critical_high: extras.critical_high ?? null,
  trr_text_reference: extras.text_reference ?? null,
  trr_is_active: true,
  trr_animal_type: extras.animal_type ?? 'camel',
  rv_notes: extras.rv_notes ?? null,
  unit: extras.unit ?? null,
  value: extras.value,
  numeric_value: extras.numeric_value,
});

console.log('\n=== Result Engine — Phase 3 ===\n');

check('WBC within range → NORMAL', () => {
  const row = limsRow('WBC', 4, 15, { value: '10', unit: '10^3/uL' });
  const ev = engine.evaluateResult(row);
  assert.strictEqual(ev.valueType, engine.VALUE_TYPES.COUNT);
  assert.strictEqual(ev.flag, engine.RESULT_FLAGS.NORMAL);
  assert.strictEqual(ev.reference, '4-15');
});

check('WBC High', () => {
  const row = limsRow('WBC', 4, 15, { value: '20', unit: '10^3/uL' });
  const ev = engine.evaluateResult(row);
  assert.strictEqual(ev.flag, engine.RESULT_FLAGS.HIGH);
});

check('WBC Low', () => {
  const row = limsRow('WBC', 4, 15, { value: '2', unit: '10^3/uL' });
  const ev = engine.evaluateResult(row);
  assert.strictEqual(ev.flag, engine.RESULT_FLAGS.LOW);
});

check('LYM% percentage — value_type percentage, not count', () => {
  const row = limsRow('LYM_PCT', 15, 65, { value: '30', unit: '%' });
  const ev = engine.evaluateResult(row);
  assert.strictEqual(ev.valueType, engine.VALUE_TYPES.PERCENTAGE);
  assert.strictEqual(ev.numericValue, 30);
  assert.notStrictEqual(ev.valueType, engine.VALUE_TYPES.COUNT);
  assert.strictEqual(ev.flag, engine.RESULT_FLAGS.NORMAL);
});

check('Result without reference → NORMAL_WITHOUT_REF', () => {
  const row = { parameter_code: 'WBC', value: '8', unit: '10^3/uL', trr_min: null, trr_max: null };
  const ev = engine.evaluateResult(row);
  assert.strictEqual(ev.reference, null);
  assert.strictEqual(ev.flag, engine.RESULT_FLAGS.NORMAL_WITHOUT_REF);
});

check('Missing value → MISSING (not LOW)', () => {
  const row = limsRow('WBC', 4, 15, { value: '', unit: '10^3/uL' });
  const ev = engine.evaluateResult(row);
  assert.strictEqual(ev.isMissing, true);
  assert.strictEqual(ev.flag, engine.RESULT_FLAGS.MISSING);
  assert.notStrictEqual(ev.flag, engine.RESULT_FLAGS.LOW);
  const v = engine.validateResultBeforeApproval(row);
  assert.ok(v.valid || v.warnings.length > 0);
  assert.strictEqual(v.evaluated.flag, engine.RESULT_FLAGS.MISSING);
});

check('Positive qualitative', () => {
  const ev = engine.evaluateResult({ value: 'positive', unit: 'qual', parameter_code: 'PARAS' });
  assert.strictEqual(ev.flag, engine.RESULT_FLAGS.POS);
});

check('Negative qualitative', () => {
  const ev = engine.evaluateResult({ value: 'negative', unit: 'qual', parameter_code: 'PARAS' });
  assert.strictEqual(ev.flag, engine.RESULT_FLAGS.NEG);
});

check('Critical flag when above critical_high', () => {
  const row = limsRow('WBC', 4, 15, {
    value: '50',
    unit: '10^3/uL',
    critical_high: 30,
  });
  const ev = engine.evaluateResult(row);
  assert.strictEqual(ev.flag, engine.RESULT_FLAGS.CRITICAL);
  assert.strictEqual(ev.isCritical, true);
  assert.strictEqual(ev.detailFlag, engine.RESULT_FLAGS.CRIT_HIGH);
});

check('Notes (Norma:) not used as reference display', () => {
  const row = limsRow('WBC', 4, 15, {
    value: '10',
    rv_notes: 'Norma: 99-999',
  });
  const ev = engine.evaluateResult(row);
  assert.strictEqual(ev.reference, '4-15');
  assert.notStrictEqual(ev.reference, '99-999');
  const v = engine.validateResultBeforeApproval(row);
  assert.strictEqual(v.valid, true);
});

check('Notes only — no LIMS range — reference null', () => {
  const row = {
    parameter_code: 'WBC',
    value: '10',
    rv_notes: 'Norma: 4.0-12.0',
    trr_min: null,
    trr_max: null,
  };
  const ev = engine.evaluateResult(row);
  assert.strictEqual(ev.reference, null);
  assert.strictEqual(ev.flag, engine.RESULT_FLAGS.NORMAL_WITHOUT_REF);
});

check('buildReportResultRow preserves PDF shape', () => {
  const row = limsRow('WBC', 4, 15, {
    value: '10',
    test_code: 'CBC-FULL',
    parameter_name: 'WBC',
    test_name: 'CBC',
    test_method: 'Automated',
    category_code: 'CBC',
  });
  const reportRow = engine.buildReportResultRow(row, { language: 'ar', instrumentResolver: () => 'Norma Icon' });
  assert.strictEqual(reportRow.code, 'WBC');
  assert.ok(reportRow.value);
  assert.strictEqual(reportRow.reference, '4-15');
  assert.strictEqual(reportRow.instrument, 'Norma Icon');
  assert.strictEqual(reportRow.flag, engine.RESULT_FLAGS.NORMAL);
});

check('normalizeResultValue keeps percentage numeric', () => {
  const n = engine.normalizeResultValue('25.5', engine.VALUE_TYPES.PERCENTAGE);
  assert.strictEqual(n.numericValue, 25.5);
  assert.strictEqual(n.isMissing, false);
});

check('Numeric value + text_reference only → show text, no HIGH/LOW', () => {
  const text = 'Negative: S/P% < 40\nSuspect: 40–50\nPositive: S/P% ≥ 50';
  const row = limsRow('SP-RATIO', null, null, {
    value: '62',
    unit: '%',
    text_reference: text,
  });
  const ev = engine.evaluateResult(row);
  assert.strictEqual(ev.hasReference, true);
  assert.strictEqual(ev.reference, text);
  assert.notStrictEqual(ev.flag, engine.RESULT_FLAGS.HIGH);
  assert.notStrictEqual(ev.flag, engine.RESULT_FLAGS.LOW);
  const reportRow = engine.buildReportResultRow(row, { language: 'ar' });
  assert.strictEqual(reportRow.hasReference, true);
  assert.strictEqual(reportRow.reference, text);
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed ? 1 : 0);
