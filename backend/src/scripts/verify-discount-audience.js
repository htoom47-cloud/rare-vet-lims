/**
 * Discount audience: customer | veterinarian | all.
 * Usage: node src/scripts/verify-discount-audience.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  filterPresetsByAudience,
  normalizeDiscountAudience,
  normalizePayerKind,
  isPresetAllowedForPayer,
  DISCOUNT_AUDIENCE_CUSTOMER,
  DISCOUNT_AUDIENCE_VETERINARIAN,
  DISCOUNT_AUDIENCE_ALL,
} = require('../utils/discount');

const migrateSrc = fs.readFileSync(path.join(__dirname, 'migrate.js'), 'utf8');
const serviceSrc = fs.readFileSync(path.join(__dirname, '../services/discount-presets.service.js'), 'utf8');
const schemasSrc = fs.readFileSync(path.join(__dirname, '../validators/schemas.js'), 'utf8');
const discountFieldSrc = fs.readFileSync(
  path.join(__dirname, '../../../frontend/src/components/billing/DiscountField.jsx'),
  'utf8',
);
const adminSrc = fs.readFileSync(
  path.join(__dirname, '../../../frontend/src/components/billing/DiscountPresetsAdmin.jsx'),
  'utf8',
);
const frontendDiscountSrc = fs.readFileSync(
  path.join(__dirname, '../../../frontend/src/utils/discount.js'),
  'utf8',
);

assert.ok(migrateSrc.includes("ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'customer'"));
assert.ok(migrateSrc.includes("discount_presets_audience_check"));
assert.ok(migrateSrc.includes("CHECK (audience IN ('customer', 'veterinarian', 'all'))"));
assert.ok(migrateSrc.includes("ALTER COLUMN audience SET DEFAULT 'all'"));

assert.ok(schemasSrc.includes("audience: Joi.string().valid('customer', 'veterinarian', 'all')"));
assert.ok(serviceSrc.includes('resolvePayerKindForDocument'));
assert.ok(serviceSrc.includes('DISCOUNT_AUDIENCE'));
assert.ok(serviceSrc.includes('filterPresetsByAudience'));
assert.ok(serviceSrc.includes('audience'));

assert.ok(frontendDiscountSrc.includes('filterPresetsByAudience'));
assert.ok(frontendDiscountSrc.includes('DISCOUNT_AUDIENCE_ALL'));
assert.ok(discountFieldSrc.includes('payerKind'));
assert.ok(discountFieldSrc.includes('filterPresetsByAudience'));
assert.ok(adminSrc.includes('discountAudience'));
assert.ok(adminSrc.includes("audience: 'all'"));
assert.ok(adminSrc.includes('discountAudienceAll'));

assert.strictEqual(normalizeDiscountAudience('veterinarian'), DISCOUNT_AUDIENCE_VETERINARIAN);
assert.strictEqual(normalizeDiscountAudience('customer'), DISCOUNT_AUDIENCE_CUSTOMER);
assert.strictEqual(normalizeDiscountAudience('all'), DISCOUNT_AUDIENCE_ALL);
assert.strictEqual(normalizeDiscountAudience(null), DISCOUNT_AUDIENCE_ALL);
assert.strictEqual(normalizePayerKind('veterinarian'), DISCOUNT_AUDIENCE_VETERINARIAN);
assert.strictEqual(normalizePayerKind('customer'), DISCOUNT_AUDIENCE_CUSTOMER);

const presets = [
  { id: 'c1', audience: 'customer', name: 'Customers only' },
  { id: 'v1', audience: 'veterinarian', name: 'Vet only' },
  { id: 'a1', audience: 'all', name: 'Everyone' },
  { id: 'legacy', name: 'Legacy no audience' },
];

assert.deepStrictEqual(
  filterPresetsByAudience(presets, 'customer').map((p) => p.id),
  ['c1', 'a1', 'legacy'],
);
assert.deepStrictEqual(
  filterPresetsByAudience(presets, 'veterinarian').map((p) => p.id),
  ['v1', 'a1', 'legacy'],
);
assert.strictEqual(isPresetAllowedForPayer(presets[1], 'customer'), false);
assert.strictEqual(isPresetAllowedForPayer(presets[1], 'veterinarian'), true);
assert.strictEqual(isPresetAllowedForPayer(presets[0], 'customer'), true);
assert.strictEqual(isPresetAllowedForPayer(presets[0], 'veterinarian'), false);
assert.strictEqual(isPresetAllowedForPayer(presets[2], 'customer'), true);
assert.strictEqual(isPresetAllowedForPayer(presets[2], 'veterinarian'), true);

console.log('discount audience rules ok');
