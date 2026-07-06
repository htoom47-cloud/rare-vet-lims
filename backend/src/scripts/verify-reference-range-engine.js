/**
 * Reference Range Engine — unit verification (no DB required).
 * Usage: node src/scripts/verify-reference-range-engine.js
 */
const assert = require('assert');
const { NORMA_CBC_REFERENCES } = require('../utils/norma-cbc-references');
const engine = require('../services/reference-range-engine.service');

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

const limsRow = (code, min, max, notes = null, extras = {}) => ({
  parameter_code: code,
  trr_id: `id-${code}`,
  trr_min: min,
  trr_max: max,
  trr_critical_low: extras.critical_low ?? null,
  trr_critical_high: extras.critical_high ?? null,
  trr_notes: notes,
  trr_text_reference: extras.text_reference ?? null,
  trr_is_active: true,
  trr_animal_type: extras.animal_type ?? 'camel',
  trr_created_by: extras.created_by ?? null,
  rv_notes: extras.rv_notes ?? null,
});

console.log('\n=== Reference Range Engine — Phase 1 ===\n');

const camel = NORMA_CBC_REFERENCES.camel;

check('CBC camel WBC — resolves 4-15', () => {
  const row = limsRow('WBC', camel.WBC.min, camel.WBC.max, 'Manual WBC range');
  const range = engine.resolveReferenceRangeFromRow({ row });
  assert(range, 'expected range');
  assert.strictEqual(range.source, engine.RANGE_SOURCES.LIMS_MANUAL);
  assert.strictEqual(engine.formatReferenceRange(range), `${camel.WBC.min}-${camel.WBC.max}`);
  const flag = engine.evaluateResultFlag(10, range);
  assert.strictEqual(flag.flag, 'NORMAL');
});

check('CBC camel LYM% — LYM_PCT 15-65', () => {
  const ref = camel.LYM_PCT;
  const row = limsRow('LYM_PCT', ref.min, ref.max, null, { notes: 'Synced from norma-profile' });
  const range = engine.resolveReferenceRangeFromRow({ row });
  assert(range, 'expected range');
  assert.strictEqual(range.source, engine.RANGE_SOURCES.LIMS_SPECIES);
  assert.strictEqual(engine.formatReferenceRange(range), `${ref.min}-${ref.max}`);
});

check('CBC camel NEU% — NEU_PCT 25-80', () => {
  const ref = camel.NEU_PCT;
  const row = limsRow('NEU_PCT', ref.min, ref.max);
  const range = engine.resolveReferenceRangeFromRow({ row });
  assert(range);
  assert.strictEqual(range.min_value, ref.min);
  assert.strictEqual(range.max_value, ref.max);
});

check('Result without reference — returns null, no invented range', () => {
  const row = { parameter_code: 'X', trr_min: null, trr_max: null, trr_text_reference: null };
  const range = engine.resolveReferenceRangeFromRow({ row });
  assert.strictEqual(range, null);
  const flag = engine.evaluateResultFlag(99, range);
  assert.strictEqual(flag.flag, '');
});

check('High flag — value above max', () => {
  const row = limsRow('WBC', 4, 15);
  const range = engine.resolveReferenceRangeFromRow({ row });
  const flag = engine.evaluateResultFlag(20, range);
  assert.strictEqual(flag.flag, 'HIGH');
});

check('Low flag — value below min', () => {
  const row = limsRow('WBC', 4, 15);
  const range = engine.resolveReferenceRangeFromRow({ row });
  const flag = engine.evaluateResultFlag(2, range);
  assert.strictEqual(flag.flag, 'LOW');
});

check('Norma result_values.notes ignored — bounds from LIMS only', () => {
  const row = limsRow('WBC', 4, 15);
  row.rv_notes = 'Norma: 99-999';
  const range = engine.resolveReferenceRangeFromRow({ row });
  assert.strictEqual(range.min_value, 4);
  assert.strictEqual(range.max_value, 15);
  const flag = engine.evaluateResultFlag(10, range);
  assert.strictEqual(flag.flag, 'NORMAL');
});

check('Manual range beats Synced from for same parameter', () => {
  const manual = {
    parameter_id: 'p1',
    animal_type: 'camel',
    min_value: 8,
    max_value: 15,
    notes: 'Clinician override',
    is_active: true,
  };
  const synced = {
    parameter_id: 'p1',
    animal_type: 'camel',
    min_value: 4,
    max_value: 15,
    notes: 'Synced from norma-profile',
    is_active: true,
  };
  const picked = engine.pickBestLimsRow([synced, manual], {
    parameter_id: 'p1',
    animal_type: 'camel',
  });
  assert.strictEqual(picked.source, engine.RANGE_SOURCES.LIMS_MANUAL);
  assert.strictEqual(picked.min_value, 8);
});

check('Admin created_by range beats seed defaults', () => {
  const admin = {
    parameter_id: 'p1',
    animal_type: 'camel',
    min_value: 6,
    max_value: 18,
    notes: 'Species default',
    created_by: 'user-uuid',
    is_active: true,
  };
  const seed = {
    parameter_id: 'p1',
    animal_type: 'camel',
    min_value: 4,
    max_value: 15,
    notes: 'Species default',
    is_active: true,
  };
  const picked = engine.pickBestLimsRow([seed, admin], {
    parameter_id: 'p1',
    animal_type: 'camel',
  });
  assert.strictEqual(picked.source, engine.RANGE_SOURCES.LIMS_MANUAL);
  assert.strictEqual(picked.min_value, 6);
});

check('Text reference shown when no numeric bounds', () => {
  const row = limsRow('FINDINGS', null, null, null, { text_reference: 'Negative' });
  const range = engine.resolveReferenceRangeFromRow({ row });
  assert.strictEqual(engine.formatReferenceRange(range), 'Negative');
});

check('resolveReportReferenceBounds delegates to engine', () => {
  const row = limsRow('HGB', 80, 180);
  const bounds = engine.resolveReportReferenceBounds(row);
  assert.strictEqual(bounds.min, 80);
  assert.strictEqual(bounds.max, 180);
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed ? 1 : 0);
