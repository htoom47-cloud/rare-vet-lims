/**
 * Verify barcode print ↔ scan ↔ Norma ↔ LIMS lookup chain.
 * Usage: node src/scripts/verify-barcode-norma-chain.js
 */
const assert = require('assert');
const { generateSampleDigitsId } = require('../utils/helpers');
const {
  displaySampleId,
  normalizeSampleScanId,
  encodeCode128C,
  scanMatchesStored,
  isUnifiedDigitsId,
} = require('../utils/barcode-scan');
const { parseHl7 } = require('../utils/hl7');
const { buildNormaCbcHl7, buildFullNormaPanelValues } = require('../utils/norma-hl7-builder');

let passed = 0;
let failed = 0;

const ok = (name, detail = '') => {
  passed += 1;
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
};

const fail = (name, detail) => {
  failed += 1;
  console.error(`  ✗ ${name}: ${detail}`);
};

const check = (name, condition, detail = '') => {
  if (condition) ok(name, detail);
  else fail(name, detail || 'assertion failed');
};

console.log('\n=== Barcode ↔ Norma chain ===\n');

const newId = generateSampleDigitsId();
check('generateSampleDigitsId length', newId.length === 12, newId);
check('is unified 12-digit ID', isUnifiedDigitsId(newId));

const encoded = encodeCode128C(newId);
check('Code128-C even length', encoded.length % 2 === 0, `len=${encoded.length}`);
check('encode matches display for 12-digit', encoded === newId);

const paddedScan = `0${newId}`;
check('normalize strips scanner pad', normalizeSampleScanId(paddedScan) === newId);
check('scanMatchesStored print vs pad scan', scanMatchesStored(newId, paddedScan));

const legacyBc = 'BC-260702-484067';
const legacySmp = 'SMP-260702-968431';
check('legacy BC normalize', normalizeSampleScanId(legacyBc) === '260702484067');
check('legacy SMP normalize', normalizeSampleScanId(legacySmp) === '260702968431');
check('BC scan matches SMP barcode digits', scanMatchesStored(legacyBc, '260702484067'));

const hl7 = buildNormaCbcHl7(newId, buildFullNormaPanelValues(), 'camel');
const parsed = parseHl7(hl7);
check('HL7 builder sampleId', parsed.sampleId === newId);
check('HL7 has CBC results', (parsed.results?.length || 0) >= 20, `${parsed.results?.length} values`);

const hl7Legacy = `MSH|^~\\&|Norma|CBC|LIMS|Lab|20260702120000||ORU^R01|1|P|2.3\rPID|1||${legacyBc}^^^||TEST\rOBX|1|NM|WBC^WBC^Norma||8.2|10^9/L|4-12|N`;
const parsedLegacy = parseHl7(hl7Legacy);
check('HL7 legacy BC in PID', parsedLegacy.sampleId === '260702484067');

const hl7Digits = `MSH|^~\\&|Norma|CBC|LIMS|Lab|20260702120000||ORU^R01|1|P|2.3\rPID|1||${newId}^^^||TEST\rOBX|1|NM|WBC^WBC^Norma||8.2|10^9/L|4-12|N`;
check('HL7 digits in PID', parseHl7(hl7Digits).sampleId === newId);

check('displaySampleId unified', displaySampleId(newId) === newId);
check('displaySampleId legacy BC', displaySampleId(legacyBc) === '260702484067');

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
