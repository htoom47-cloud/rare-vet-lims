/**
 * Barcode Engine — unit verification (no DB / printer required).
 * Usage: node src/scripts/verify-barcode-engine.js
 */
const assert = require('assert');
const engine = require('../services/barcode-engine.service');
const { encodeCode128C, normalizeSampleScanId, displaySampleId } = require('../utils/barcode-scan');
const { buildNormaCbcHl7 } = require('../utils/norma-hl7-builder');
const { parseHl7 } = require('../utils/hl7');

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

const ARABIC_RE = /[\u0600-\u06FF]/;

const sampleFixture = (overrides = {}) => ({
  sample_code: '260702625897',
  barcode: '260702625897',
  customer_name: 'Mohammed',
  customer_name_ar: 'محمد العتيبي',
  animal_name: 'شاهين',
  animal_type: 'camel',
  collection_date: '2026-07-03T10:00:00.000Z',
  tests: [{ test_code: 'CBC-FULL', category_code: 'CBC', test_name: 'CBC', test_name_ar: 'تعداد الدم' }],
  ...overrides,
});

console.log('\n=== Barcode Engine — Phase 5 ===\n');

check('barcodeValue = sample_id digits only', () => {
  const payload = engine.buildBarcodePayload(sampleFixture());
  assert.strictEqual(payload.barcodeValue, '260702625897');
  assert.strictEqual(payload.barcodeType, 'Code128');
  assert.ok(!ARABIC_RE.test(payload.barcodeValue));
});

check('validateBarcodePayload accepts valid payload', () => {
  const payload = engine.buildBarcodePayload(sampleFixture());
  const v = engine.validateBarcodePayload(payload);
  assert.strictEqual(v.valid, true, v.errors?.join('; '));
});

check('^BC ^FD contains sample_id digits only (no Arabic)', () => {
  const payload = engine.buildBarcodePayload(sampleFixture(), { isArabic: true });
  const zpl = engine.buildZplLabel(payload, { isArabic: true });
  const bcBlock = zpl.match(/\^BC[\s\S]*?\^FS/);
  assert.ok(bcBlock, 'missing ^BC block');
  const fd = bcBlock[0].match(/\^FD([\s\S]*?)\^FS/)[1];
  assert.ok(/^>;>8\d+$/.test(fd.trim()), fd);
  assert.ok(!ARABIC_RE.test(fd));
});

check('Arabic customer name allowed outside barcode (^FD text lines)', () => {
  const payload = engine.buildBarcodePayload(sampleFixture(), { isArabic: true });
  const zpl = engine.buildZplLabel(payload, { isArabic: true });
  assert.ok(zpl.includes('محمد'), 'Arabic customer missing from label text');
  assert.ok(zpl.includes('^CI28'), 'UTF-8 ZPL mode missing');
});

check('No Arabic inside barcode encode value', () => {
  const payload = engine.buildBarcodePayload({
    ...sampleFixture(),
    customer_name_ar: 'اختبار',
    animal_name: 'ناقة',
  });
  assert.ok(!ARABIC_RE.test(payload.barcodeEncode));
  assert.strictEqual(payload.barcodeEncode, encodeCode128C('260702625897'));
});

check('Quiet zone left and right sufficient', () => {
  const payload = engine.buildBarcodePayload(sampleFixture());
  const zpl = engine.buildZplLabel(payload);
  const quiet = engine.validateZplQuietZone(zpl);
  assert.strictEqual(quiet.valid, true, quiet.errors?.join('; '));
});

check('Barcode fits within label width (50mm / 400 dots)', () => {
  const payload = engine.buildBarcodePayload(sampleFixture());
  const zpl = engine.buildZplLabel(payload);
  assert.ok(zpl.includes('^PW400'));
  const fo = zpl.match(/\^FO(\d+),\d+\^BY[\s\S]*?\^BC/);
  assert.ok(fo);
  const x = Number(fo[1]);
  assert.ok(x >= engine.MIN_QUIET_ZONE);
});

check('ZPL is valid (^XA/^XZ, Code128 ^BC)', () => {
  const zpl = engine.buildZplLabel(engine.buildBarcodePayload(sampleFixture()));
  assert.ok(zpl.startsWith('^XA'));
  assert.ok(zpl.endsWith('^XZ'));
  assert.ok(zpl.includes('^BCN'));
});

check('Reprint same sample → identical barcodeValue', () => {
  const s = sampleFixture();
  const a = engine.buildBarcodePayload(s);
  const b = engine.buildBarcodePayload(s);
  assert.strictEqual(a.barcodeValue, b.barcodeValue);
  assert.strictEqual(a.barcodeEncode, b.barcodeEncode);
  assert.strictEqual(engine.buildZplLabel(a), engine.buildZplLabel(b));
});

check('Norma HL7 PID sampleId unchanged (scanner / Norma chain)', () => {
  const payload = engine.buildBarcodePayload(sampleFixture());
  const hl7 = buildNormaCbcHl7(payload.barcodeValue, {}, 'camel');
  const parsed = parseHl7(hl7);
  assert.strictEqual(parsed.sampleId, payload.barcodeValue);
  assert.strictEqual(payload.normaSampleId, normalizeSampleScanId(payload.barcodeValue));
});

check('Arabic animal type label correct (camel → إبل)', () => {
  const payload = engine.buildBarcodePayload(sampleFixture(), { isArabic: true });
  assert.strictEqual(payload.humanReadable.animalType, 'إبل');
  const customerLine = payload.textLines.find((l) => l.key === 'customer');
  assert.ok(customerLine.text.includes('العميل'));
});

check('Arabic test panel label (CBC → تعداد الدم)', () => {
  const payload = engine.buildBarcodePayload(sampleFixture(), { isArabic: true });
  assert.strictEqual(payload.humanReadable.testsSummary, 'تعداد الدم');
});

check('Printed Arabic name preserved in humanReadable textLines', () => {
  const payload = engine.buildBarcodePayload(sampleFixture(), { isArabic: true });
  const customer = payload.textLines.find((l) => l.key === 'customer');
  assert.ok(customer.text.includes('محمد العتيبي'));
  const animal = payload.textLines.find((l) => l.key === 'animal');
  assert.ok(animal.text.includes('شاهين'));
});

check('validateBarcodePayload rejects Arabic in barcodeValue', () => {
  const v = engine.validateBarcodePayload({
    barcodeType: 'Code128',
    barcodeValue: 'محمد123',
    barcodeEncode: '123',
    textLines: [],
  });
  assert.strictEqual(v.valid, false);
});

check('normalizePrinterOptions defaults for Zebra 50×25', () => {
  const opts = engine.normalizePrinterOptions({});
  assert.strictEqual(opts.labelWidthMm, 50);
  assert.strictEqual(opts.labelHeightMm, 25);
  assert.strictEqual(opts.labelWidthDots, 400);
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed ? 1 : 0);
