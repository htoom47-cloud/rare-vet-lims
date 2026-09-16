/**
 * Purchase extraction UI contract checks.
 * Usage: node src/utils/verify-purchase-extraction-ui.js
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

let passed = 0;
let failed = 0;
const check = (name, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL ${name}`);
    console.error(`       ${err.message}`);
  }
};

const page = read('pages/Purchases.jsx');
const modal = read('pages/PurchaseExtractionModal.jsx');
const i18n = read('i18n/index.js');
const api = read('services/api.js');

check('extract button and review modal exist', () => {
  assert.ok(/PurchaseExtractionModal/.test(page));
  assert.ok(/purchases\.extract/.test(page));
  assert.ok(/createDraft/.test(modal));
  assert.ok(/extractedTotal/.test(modal));
  assert.ok(/computedTotal/.test(modal));
  assert.ok(/difference/.test(modal));
});

check('create draft is not approve and double-submit is locked', () => {
  assert.ok(!/purchasesAPI\.approve/.test(modal));
  assert.ok(/processingLock/.test(modal));
  assert.ok(/disabled=\{busy \|\| !canConfirm\}/.test(modal));
});

check('mobile capture and stacked layout', () => {
  assert.ok(/capture="environment"/.test(modal));
  assert.ok(/grid-cols-1 md:grid-cols-2/.test(modal));
  assert.ok(/Extract data from invoice/.test(i18n));
  assert.ok(/استخراج البيانات من الفاتورة/.test(i18n));
  assert.ok(/إنشاء مسودة/.test(i18n));
});

check('API client exposes extraction routes', () => {
  assert.ok(/createExtraction/.test(api));
  assert.ok(/processExtraction/.test(api));
  assert.ok(/confirmExtraction/.test(api));
  assert.ok(/\/purchases\/extractions/.test(api));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
