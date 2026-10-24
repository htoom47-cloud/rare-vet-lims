/**
 * Field visit 0–15 km tier at SAR 100.
 * Usage: node src/scripts/verify-field-visit-0-15-tier.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { calcFieldVisitPrice, DEFAULT_DISTANCE_TIERS, getFieldVisitService } = require('../constants/fieldVisit');

assert.strictEqual(DEFAULT_DISTANCE_TIERS[0].max_km, 15);
assert.strictEqual(DEFAULT_DISTANCE_TIERS[0].price, 100);
assert.strictEqual(DEFAULT_DISTANCE_TIERS[1].max_km, 30);
assert.strictEqual(DEFAULT_DISTANCE_TIERS[1].price, 150);

const svc = getFieldVisitService();
assert.strictEqual(calcFieldVisitPrice(svc, 0), 100);
assert.strictEqual(calcFieldVisitPrice(svc, 15), 100);
assert.strictEqual(calcFieldVisitPrice(svc, 16), 150);
assert.strictEqual(calcFieldVisitPrice(svc, 30), 150);
assert.strictEqual(calcFieldVisitPrice(svc, 60), 200);

const frontend = fs.readFileSync(
  path.join(__dirname, '../../../frontend/src/utils/fieldVisitService.js'),
  'utf8'
);
assert.ok(frontend.includes('{ max_km: 15, price: 100 }'));

console.log('field visit 0-15 tier ok');
