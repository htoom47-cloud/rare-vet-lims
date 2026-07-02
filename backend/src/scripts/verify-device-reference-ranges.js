/**
 * Verify Norma device reference range pipeline (parsers → device table logic).
 * Usage: node src/scripts/verify-device-reference-ranges.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { parseDeviceMessage, parseNormaCsv } = require('../utils/device-parsers');
const { parseHl7 } = require('../utils/hl7');
const { extractRefProfileFromResults } = require('../utils/norma-ref-extract');
const { normalizeResultFlag } = require('../utils/device-parsers/normalize');

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

const fixtureHl7 = fs.readFileSync(
  path.join(__dirname, '../fixtures/norma-cbc-horse.hl7'),
  'utf8'
);

console.log('\n=== Parser: HL7 reference fields ===');
check('HL7 extracts WBC low/high from OBX-7', () => {
  const parsed = parseHl7(fixtureHl7);
  const wbc = parsed.results.find((r) => r.limsCode === 'WBC');
  assert.strictEqual(wbc.referenceMin, 5.5);
  assert.strictEqual(wbc.referenceMax, 12.5);
  assert.strictEqual(wbc.unit, '10^3/uL');
  assert.strictEqual(wbc.flag, 'NORMAL');
});

check('HL7 extracts horse species', () => {
  const parsed = parseHl7(fixtureHl7);
  assert.strictEqual(parsed.animalType, 'horse');
});

check('HL7 extracts observedAt on results', () => {
  const parsed = parseHl7(fixtureHl7);
  assert.ok(parsed.observedAt);
  assert.ok(parsed.results[0].observedAt);
});

check('unified parser detects HL7 format', () => {
  const parsed = parseDeviceMessage(fixtureHl7);
  assert.strictEqual(parsed.protocol, 'HL7');
  assert.ok(parsed.results.length >= 5);
});

console.log('\n=== Parser: CSV reference fields ===');
check('CSV parser reads ref low/high', () => {
  const csv = 'Code,Value,Unit,RefLow,RefHigh,Flag\nWBC,8.2,10^3/uL,5.5,12.5,N\n';
  const parsed = parseNormaCsv(csv);
  const wbc = parsed.results.find((r) => r.limsCode === 'WBC');
  assert.strictEqual(wbc.referenceMin, 5.5);
  assert.strictEqual(wbc.referenceMax, 12.5);
});

console.log('\n=== Profile extraction ===');
check('extractRefProfileFromResults builds parameter map', () => {
  const parsed = parseHl7(fixtureHl7);
  const profile = extractRefProfileFromResults(parsed.results);
  assert.strictEqual(profile.WBC.min, 5.5);
  assert.strictEqual(profile.WBC.max, 12.5);
  assert.ok(profile.HGB);
});

console.log('\n=== Flag normalization ===');
check('normalizeResultFlag maps H → HIGH', () => {
  assert.strictEqual(normalizeResultFlag('H'), 'HIGH');
  assert.strictEqual(normalizeResultFlag('L'), 'LOW');
  assert.strictEqual(normalizeResultFlag('N'), 'NORMAL');
});

console.log('\n=== Unique key semantics ===');
check('profile keys are unique per limsCode', () => {
  const parsed = parseHl7(fixtureHl7);
  const profile = extractRefProfileFromResults(parsed.results);
  const codes = Object.keys(profile);
  assert.strictEqual(codes.length, new Set(codes).size);
});

console.log('\n=== Parser: segment order independence ===');
check('shuffled OBX segments yield same refs', () => {
  const { splitSegments } = require('../utils/hl7');
  const segments = splitSegments(fixtureHl7);
  const header = segments.filter((s) => !s.startsWith('OBX|'));
  const obx = segments.filter((s) => s.startsWith('OBX|'));
  const shuffled = [...header, ...obx.reverse()].join('\r');
  const a = parseHl7(fixtureHl7).results.find((r) => r.limsCode === 'WBC');
  const b = parseHl7(shuffled).results.find((r) => r.limsCode === 'WBC');
  assert.strictEqual(a.referenceMin, b.referenceMin);
  assert.strictEqual(a.referenceMax, b.referenceMax);
});

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
