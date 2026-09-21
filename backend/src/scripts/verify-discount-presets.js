const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { isPresetAllowed } = require('../services/discount-presets.service');
const {
  countDistinctAnimals,
  countCatalogTestQuantity,
  discountVolumeCount,
} = require('../utils/discount');

assert.strictEqual(countDistinctAnimals([
  { animal_id: 'a' },
  { animal_id: 'a' },
  { animal_id: 'b' },
  { description: 'no animal' },
]), 2);
assert.strictEqual(countDistinctAnimals([]), 0);

assert.strictEqual(countCatalogTestQuantity([
  { description: 'فحص مالطيه روز بنقال', quantity: 200 },
  { description: 'زيارة ميدانية — 60 كم', quantity: 1, service_code: 'FIELD-VISIT' },
]), 200);
assert.strictEqual(countCatalogTestQuantity([
  { description: 'فحص 1', quantity: 1 },
  { description: 'فحص 2', quantity: 10 },
]), 11);

assert.strictEqual(discountVolumeCount([
  { description: 'فحص مالطيه', quantity: 200 },
]), 200);
assert.strictEqual(discountVolumeCount([
  { animal_id: 'a', quantity: 1 },
  { animal_id: 'b', quantity: 1 },
], 12), 12);

assert.strictEqual(isPresetAllowed({ min_animal_count: 0 }, 0), true);
assert.strictEqual(isPresetAllowed({ min_animal_count: 10 }, 10), false);
assert.strictEqual(isPresetAllowed({ min_animal_count: 10 }, 11), true);
assert.strictEqual(isPresetAllowed({ min_animal_count: '10' }, 11), true);
assert.strictEqual(
  isPresetAllowed({ min_animal_count: 10 }, discountVolumeCount([{ description: 'فحص', quantity: 200 }])),
  true,
);
assert.strictEqual(
  isPresetAllowed({ min_animal_count: 10 }, discountVolumeCount([{ description: 'فحص', quantity: 10 }])),
  false,
);

const quotePdf = fs.readFileSync(path.join(__dirname, '../utils/quote-pdf.js'), 'utf8');
assert.ok(quotePdf.includes('الإجمالي شامل الضريبة قبل الخصم'));
assert.ok(quotePdf.includes('الإجمالي شامل الضريبة بعد الخصم'));
assert.ok(quotePdf.includes('discount_name_ar'));
assert.ok(!quotePdf.includes("خصم الخدمات (${pct}%)"));

console.log('discount preset rules ok');
