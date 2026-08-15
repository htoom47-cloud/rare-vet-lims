/**
 * Suppliers UI contract checks.
 * Usage: node src/utils/verify-suppliers-ui.js
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

const page = read('pages/Suppliers.jsx');
const i18n = read('i18n/index.js');

check('IBAN is removed from the suppliers page and helpers', () => {
  assert.ok(!/iban/i.test(page));
  assert.ok(!fs.existsSync(path.join(root, 'utils/supplierIban.js')));
  assert.ok(!/iban:\s*'IBAN'/.test(i18n));
});

check('list uses API pagination instead of a hardcoded first 50', () => {
  assert.ok(/PAGE_SIZE/.test(page));
  assert.ok(/setPagination\(data\.pagination/.test(page));
  assert.ok(/page, limit: PAGE_SIZE/.test(page));
  assert.ok(!/limit:\s*50/.test(page));
});

check('search resets to page 1', () => {
  assert.ok(/setSearch\(e\.target\.value\);\s*setPage\(1\)/.test(page));
});

check('previous/next controls and totals are rendered from API pagination', () => {
  assert.ok(/pagination\.total/.test(page));
  assert.ok(/pagination\.page/.test(page));
  assert.ok(/pagination\.totalPages/.test(page));
  assert.ok(/t\('suppliers\.showingCount'/.test(page));
  assert.ok(/t\('suppliers\.pageOf'/.test(page));
  assert.ok(/t\('suppliers\.previous'\)/.test(page));
  assert.ok(/t\('suppliers\.next'\)/.test(page));
  assert.ok(!/i18n\.language/.test(page));
  assert.ok(/setPage\(\(p\) => Math\.max\(1, p - 1\)\)/.test(page));
  assert.ok(/setPage\(\(p\) => Math\.min\(pagination\.totalPages, p \+ 1\)\)/.test(page));
});

check('pagination strings live in i18n for Arabic and English', () => {
  assert.ok(/showingCount: 'Showing \{\{shown\}\} of \{\{total\}\}'/.test(i18n));
  assert.ok(/showingCount: 'عرض \{\{shown\}\} من \{\{total\}\}'/.test(i18n));
  assert.ok(/previous: 'Previous'/.test(i18n));
  assert.ok(/previous: 'السابق'/.test(i18n));
  assert.ok(/next: 'Next'/.test(i18n));
  assert.ok(/next: 'التالي'/.test(i18n));
});

check('disable action is hidden for already deleted suppliers', () => {
  assert.ok(/r\.deleted_at/.test(page));
  assert.ok(/alreadyDisabled/.test(page));
  assert.ok(/if \(row\.deleted_at\) return;/.test(page));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
