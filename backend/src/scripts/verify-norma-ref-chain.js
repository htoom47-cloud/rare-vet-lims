/**
 * Triple-check Norma → LIMS reference range chain (parse → map → sync logic).
 * Usage: node src/scripts/verify-norma-ref-chain.js
 */
const assert = require('assert');
const { parseReferenceRange } = require('../utils/reference-range');
const { parseHl7 } = require('../utils/hl7');
const { parseAstm } = require('../utils/astm');
const { buildNormaCbcHl7, buildFullNormaPanelValues } = require('../utils/norma-hl7-builder');
const {
  NORMA_CBC_ORDER,
  resolveNormaResultLimsCode,
  mapNormaCode,
} = require('../utils/norma-cbc-map');
const { NORMA_CBC_REFERENCES } = require('../utils/norma-cbc-references');

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${label}: ${err.message}`);
  }
}

console.log('\n=== Review 1: parseReferenceRange ===');
for (const [input, min, max] of [
  ['4.0-15.0', 4, 15],
  ['4.0^15.0', 4, 15],
  ['4 - 15', 4, 15],
  ['4,0-15,0', 4, 15],
  ['(4.0-12.0)', 4, 12],
  ['4.0-12.0 10^9/L', 4, 12],
]) {
  check(`"${input}" → ${min}-${max}`, () => {
    const r = parseReferenceRange(input);
    assert(r, 'expected parse result');
    assert.strictEqual(r.min, min);
    assert.strictEqual(r.max, max);
  });
}

console.log('\n=== Review 2: HL7 parse → limsCode + refs ===');
check('LYM% maps to LYM_PCT with ref', () => {
  const hl7 = 'PID|||SMP-TEST\rOBX|1|NM|LYM%^LYM%^Norma||25.6|%|20.0-40.0|N';
  const row = parseHl7(hl7).results[0];
  assert.strictEqual(row.limsCode, 'LYM_PCT');
  assert.strictEqual(row.referenceMin, 20);
  assert.strictEqual(row.referenceMax, 40);
});

check('LYM + unit % maps to LYM_PCT', () => {
  const hl7 = 'PID|||SMP-TEST\rOBX|1|NM|LYM^LYM^Norma||25.6|%|20.0^40.0|N';
  const row = parseHl7(hl7).results[0];
  assert.strictEqual(row.limsCode, 'LYM_PCT');
  assert.strictEqual(row.referenceMin, 20);
  assert.strictEqual(row.referenceMax, 40);
});

check('WBC keeps absolute ref', () => {
  const hl7 = 'PID|||SMP-TEST\rOBX|1|NM|WBC^WBC^Norma||8.2|10^9/L|4.0-12.0|N';
  const row = parseHl7(hl7).results[0];
  assert.strictEqual(row.limsCode, 'WBC');
  assert.strictEqual(row.referenceMin, 4);
  assert.strictEqual(row.referenceMax, 12);
});

check('full Norma panel HL7 — all refs extracted', () => {
  const hl7 = buildNormaCbcHl7('SMP-VERIFY', buildFullNormaPanelValues(), 'camel');
  const parsed = parseHl7(hl7);
  const withRefs = parsed.results.filter((r) => r.referenceMin != null && r.referenceMax != null);
  assert.strictEqual(parsed.results.length, NORMA_CBC_ORDER.length);
  assert.strictEqual(withRefs.length, parsed.results.length, 'every OBX should have refs');
});

console.log('\n=== Review 3: code mapping consistency (import ↔ sync) ===');
const mappingCases = [
  { code: 'LYM%', unit: '%', expected: 'LYM_PCT' },
  { code: 'LYM', unit: '%', expected: 'LYM_PCT' },
  { code: 'LYM', unit: '10^3/uL', expected: 'LYM' },
  { code: 'LYM_PCT', unit: '%', expected: 'LYM_PCT' },
  { code: 'NEU%', unit: '%', expected: 'NEU_PCT' },
  { code: 'RDW-CV', unit: '%', expected: 'RDW-CV' },
  { code: 'PDW-SD', unit: 'fL', expected: 'PDW-SD' },
];

for (const c of mappingCases) {
  check(`${c.code} (${c.unit}) → ${c.expected}`, () => {
    const lims = resolveNormaResultLimsCode({ code: c.code, unit: c.unit });
    assert.strictEqual(lims, c.expected);
  });
}

check('resolveNormaResultLimsCode matches hl7 limsCode', () => {
  const hl7 = buildNormaCbcHl7('SMP-VERIFY', buildFullNormaPanelValues(), 'camel');
  const parsed = parseHl7(hl7);
  for (const row of parsed.results) {
    const fromHelper = resolveNormaResultLimsCode(row);
    assert.strictEqual(fromHelper, row.limsCode, `mismatch for ${row.code}`);
  }
});

check('ASTM R record sets limsCode + refs', () => {
  const astm = 'O|1|SMP-TEST\rR|1|LYM%|25.6|%|20.0-40.0|N';
  const row = parseAstm(astm).results[0];
  assert.strictEqual(row.limsCode, 'LYM_PCT');
  assert.strictEqual(row.referenceMin, 20);
  assert.strictEqual(row.referenceMax, 40);
});

check('horse species from PID.10', () => {
  const hl7 = 'PID|1||SMP-TEST||PATIENT^TEST|||20200101|M|||horse\rOBX|1|NM|WBC^WBC^Norma||8.2|10^9/L|5.0-14.0|N';
  const parsed = parseHl7(hl7);
  assert.strictEqual(parsed.animalType, 'horse');
  assert.strictEqual(parsed.results[0].referenceMin, 5);
});

check('profile refs align with HL7 builder for camel', () => {
  const refs = NORMA_CBC_REFERENCES.camel;
  const hl7 = buildNormaCbcHl7('SMP-VERIFY', buildFullNormaPanelValues(), 'camel');
  const parsed = parseHl7(hl7);
  for (const row of parsed.results) {
    const profile = refs[row.limsCode];
    if (!profile) continue;
    assert.strictEqual(row.referenceMin, profile.min, `${row.limsCode} min`);
    assert.strictEqual(row.referenceMax, profile.max, `${row.limsCode} max`);
  }
});

console.log('\n=== Review 4: report display — LIMS manual ranges ===');
const { resolveReportReferenceDisplay, resolveReportReferenceBounds, verbatimFromResultNotes } = require('../utils/reference-range');

check('resolveReportReferenceDisplay uses LIMS test_reference_ranges', () => {
  const row = { trr_min: 8, trr_max: 15, rv_notes: 'Norma: 4.0-12.0' };
  assert.strictEqual(resolveReportReferenceDisplay(row), '8-15');
});

check('resolveReportReferenceDisplay returns null when LIMS range missing', () => {
  const row = { rv_notes: 'Norma: 4.0-12.0' };
  assert.strictEqual(resolveReportReferenceDisplay(row), null);
});

check('resolveReportReferenceBounds uses LIMS min/max', () => {
  const row = { trr_min: 4, trr_max: 15, rv_notes: 'Norma: 8.0-15.0' };
  const bounds = resolveReportReferenceBounds(row);
  assert.strictEqual(bounds.min, 4);
  assert.strictEqual(bounds.max, 15);
});

check('LYMP maps to LYM_PCT with ref', () => {
  const lims = resolveNormaResultLimsCode({ code: 'LYMP', unit: '%', referenceMin: 19.8, referenceMax: 58.9 });
  assert.strictEqual(lims, 'LYM_PCT');
});

check('MONP maps to MON_PCT', () => {
  assert.strictEqual(resolveNormaResultLimsCode({ code: 'MONP', unit: '%' }), 'MON_PCT');
});

check('stored limsCode LYMP still resolves to LYM_PCT', () => {
  assert.strictEqual(resolveNormaResultLimsCode({ code: 'LYMP', limsCode: 'LYMP', unit: '%' }), 'LYM_PCT');
});

check('PDF fmtRef prefers reference over min/max formatting', () => {
  const fmtRef = (row) => {
    const verbatim = row.reference && row.reference !== '-' ? String(row.reference).trim() : null;
    if (verbatim) return verbatim;
    if (row.minValue != null && row.maxValue != null) {
      return `${Number(row.minValue).toFixed(2)} - ${Number(row.maxValue).toFixed(2)}`;
    }
    return '-';
  };
  const row = { reference: '4.0-12.0', minValue: 4, maxValue: 12 };
  assert.strictEqual(fmtRef(row), '4.0-12.0');
  assert.notStrictEqual(fmtRef(row), '4.00 - 12.00');
});

check('verbatimFromResultNotes strips Norma: prefix only', () => {
  assert.strictEqual(verbatimFromResultNotes('Norma: 20.0-40.0'), '20.0-40.0');
  assert.strictEqual(verbatimFromResultNotes('LIMS default'), null);
});

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
