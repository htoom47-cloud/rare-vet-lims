/**
 * Package vs individual-test discount split.
 * Usage: node src/scripts/verify-package-test-discount.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  splitCatalogSubtotals,
  calcDocumentTotals,
  filterPresetsByScope,
  normalizeDiscountScope,
  resolvePresetScope,
  isPackageItem,
  DISCOUNT_SCOPE_TESTS,
  DISCOUNT_SCOPE_PACKAGES,
  DISCOUNT_SCOPE_FIELD_VISIT,
} = require('../utils/discount');

const migrateSrc = fs.readFileSync(path.join(__dirname, 'migrate.js'), 'utf8');
const serviceSrc = fs.readFileSync(path.join(__dirname, '../services/discount-presets.service.js'), 'utf8');
const schemasSrc = fs.readFileSync(path.join(__dirname, '../validators/schemas.js'), 'utf8');
const billingSrc = fs.readFileSync(path.join(__dirname, '../services/billing.service.js'), 'utf8');
const quoteSrc = fs.readFileSync(path.join(__dirname, '../services/quote.service.js'), 'utf8');
const invoicePdfSrc = fs.readFileSync(path.join(__dirname, '../utils/invoice-pdf.js'), 'utf8');
const thermalSrc = fs.readFileSync(path.join(__dirname, '../utils/invoice-thermal-pdf.js'), 'utf8');
const frontendDiscountSrc = fs.readFileSync(
  path.join(__dirname, '../../../frontend/src/utils/discount.js'),
  'utf8',
);
const adminSrc = fs.readFileSync(
  path.join(__dirname, '../../../frontend/src/components/billing/DiscountPresetsAdmin.jsx'),
  'utf8',
);

assert.ok(migrateSrc.includes('package_discount_amount'));
assert.ok(migrateSrc.includes("ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'tests'"));
assert.ok(migrateSrc.includes('discount_presets_scope_check'));
assert.ok(migrateSrc.includes("CHECK (scope IN ('tests', 'packages', 'field_visit'))"));

assert.ok(schemasSrc.includes('package_discount_percent'));
assert.ok(schemasSrc.includes("scope: Joi.string().valid('tests', 'packages', 'field_visit')"));
assert.ok(serviceSrc.includes('DISCOUNT_SCOPE_PACKAGES'));
assert.ok(serviceSrc.includes('package_discount_preset_id'));
assert.ok(billingSrc.includes('package_discount_amount'));
assert.ok(quoteSrc.includes('package_discount_amount'));
assert.ok(invoicePdfSrc.includes('Packages discount') || invoicePdfSrc.includes('خصم الباقات'));
assert.ok(thermalSrc.includes('خصم الباقات'));
assert.ok(frontendDiscountSrc.includes('packageSubtotal'));
assert.ok(frontendDiscountSrc.includes('DISCOUNT_SCOPE_PACKAGES'));
assert.ok(adminSrc.includes('discountScope'));

assert.strictEqual(normalizeDiscountScope('services'), DISCOUNT_SCOPE_TESTS);
assert.strictEqual(normalizeDiscountScope('packages'), DISCOUNT_SCOPE_PACKAGES);
assert.strictEqual(resolvePresetScope({ scope: 'packages' }), DISCOUNT_SCOPE_PACKAGES);
assert.strictEqual(resolvePresetScope({ name_ar: 'خصم الزيارة المجانية' }), DISCOUNT_SCOPE_FIELD_VISIT);

const presets = [
  { id: 't1', scope: 'tests' },
  { id: 'p1', scope: 'packages' },
  { id: 'v1', scope: 'field_visit' },
  { id: 'legacy', name_ar: 'خصم الزيارة' },
];
assert.deepStrictEqual(filterPresetsByScope(presets, 'tests').map((p) => p.id), ['t1']);
assert.deepStrictEqual(filterPresetsByScope(presets, 'packages').map((p) => p.id), ['p1']);
assert.deepStrictEqual(filterPresetsByScope(presets, 'field_visit').map((p) => p.id).sort(), ['legacy', 'v1']);
assert.deepStrictEqual(filterPresetsByScope(presets, 'services').map((p) => p.id), ['t1']);

const items = [
  { package_id: 'pkg1', description: 'Package A', quantity: 1, unit_price: 100 },
  { test_id: 't1', description: 'Test B', quantity: 2, unit_price: 50 },
  { service_code: 'FIELD-VISIT', description: 'زيارة ميدانية — 20 كم', quantity: 1, unit_price: 200 },
];
assert.strictEqual(isPackageItem(items[0]), true);
assert.strictEqual(isPackageItem(items[1]), false);

const split = splitCatalogSubtotals(items);
assert.strictEqual(split.packageSubtotal, 100);
assert.strictEqual(split.testSubtotal, 100);
assert.strictEqual(split.fieldVisitSubtotal, 200);
assert.strictEqual(split.serviceSubtotal, 200);

const totals = calcDocumentTotals(items, {
  discount_percent: 10,
  package_discount_percent: 20,
  field_visit_discount_percent: 50,
  tax_rate: 15,
});
assert.strictEqual(totals.discount_amount, 10); // 10% of test 100
assert.strictEqual(totals.package_discount_amount, 20); // 20% of package 100
assert.strictEqual(totals.field_visit_discount_amount, 100); // 50% of visit 200

console.log('package vs test discount rules ok');
