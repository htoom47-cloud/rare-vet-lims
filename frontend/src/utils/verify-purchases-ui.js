/**
 * Purchase invoices UI contract checks.
 * Usage: node src/utils/verify-purchases-ui.js
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
const i18n = read('i18n/index.js');
const api = read('services/api.js');

check('list uses API pagination and i18n counts', () => {
  assert.ok(/PAGE_SIZE/.test(page));
  assert.ok(/setPagination\(data\.pagination/.test(page));
  assert.ok(/page, limit: PAGE_SIZE/.test(page));
  assert.ok(/t\('purchases\.showingCount'/.test(page));
  assert.ok(/t\('purchases\.pageOf'/.test(page));
  assert.ok(/t\('purchases\.previous'\)/.test(page));
  assert.ok(/t\('purchases\.next'\)/.test(page));
  assert.ok(/showingCount: 'Showing \{\{shown\}\} of \{\{total\}\}'/.test(i18n));
  assert.ok(/showingCount: 'عرض \{\{shown\}\} من \{\{total\}\}'/.test(i18n));
});

check('manual draft, line items, totals, and OCR-later copy exist', () => {
  assert.ok(/purchasesAPI\.create/.test(page));
  assert.ok(/form\.items/.test(page));
  assert.ok(/purchases\.subtotal/.test(page));
  assert.ok(/purchases\.vat/.test(page));
  assert.ok(/purchases\.taxHint/.test(page));
  assert.ok(/purchases\.taxSummary/.test(page));
  assert.ok(/tax_category/.test(page));
  assert.ok(/out_of_scope/.test(page));
  assert.ok(/zero_rated/.test(page));
  assert.ok(/exempt/.test(page));
  assert.ok(/Standard-rated \(15%\)/.test(i18n));
  assert.ok(/Zero-rated \(0%\)/.test(i18n));
  assert.ok(/Exempt \(0%\)/.test(i18n));
  assert.ok(/Out of scope \(0%\)/.test(i18n));
  assert.ok(/قياسي \(15%\)/.test(i18n));
  assert.ok(/صفرية \(0%\)/.test(i18n));
  assert.ok(/معفى \(0%\)/.test(i18n));
  assert.ok(/خارج النطاق \(0%\)/.test(i18n));
  assert.ok(!/vatFixed/.test(page));
  assert.ok(!/VAT is fixed at 15%/.test(i18n));
  assert.ok(/purchases\.total/.test(page));
  assert.ok(/purchases\.ocrLater/.test(page));
  assert.ok(!/Tesseract|ocrExtract|openai|anthropic/i.test(page));
});

check('quick supplier requires confirm and tax-first search is present', () => {
  assert.ok(/createQuick/.test(page));
  assert.ok(/confirm: true/.test(page));
  assert.ok(/quickConfirm/.test(page));
  assert.ok(/tax_number/.test(page));
  assert.ok(/cashUnregistered/.test(page));
});

check('approve uses a confirmation modal and blocks double submit', () => {
  assert.ok(/approveConfirm/.test(page));
  assert.ok(/purchasesAPI\.approve/.test(page));
  assert.ok(/approving/.test(page));
  assert.ok(/if \(approving\) return/.test(page));
});

check('attachment upload is image/PDF only and downloads through the API', () => {
  assert.ok(/purchasesAPI\.attach/.test(page));
  assert.ok(/purchasesAPI\.attachment/.test(page));
  assert.ok(/accept="\.jpg,\.jpeg,\.png,\.webp,\.pdf"/.test(page));
  assert.ok(!/file_url/.test(page));
  assert.ok(!/mediaUrl/.test(page));
});

check('API client exposes purchases and supplier search/quick', () => {
  assert.ok(/export const purchasesAPI/.test(api));
  assert.ok(/\/purchases\/\$\{id\}\/approve/.test(api));
  assert.ok(/\/suppliers\/search/.test(api));
  assert.ok(/\/suppliers\/quick/.test(api));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
