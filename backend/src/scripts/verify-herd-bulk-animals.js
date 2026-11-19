/**
 * Herd bulk animal create stays on existing animalsAPI.create (no reports).
 * Usage: node src/scripts/verify-herd-bulk-animals.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const envSrc = read('src/config/env.js');
const featuresSrc = read('src/utils/staff-features.js');
const page = read('../frontend/src/pages/WorkflowCase.jsx');
const i18n = read('../frontend/src/i18n/index.js');

assert.ok(envSrc.includes('herdBulkAnimals'));
assert.ok(envSrc.includes("HERD_BULK_ANIMALS_ENABLED === 'true'"));
assert.ok(featuresSrc.includes('herdBulkAnimals:'));

assert.ok(page.includes('herdBulkAnimals'));
assert.ok(page.includes('createAnimalsBulk'));
assert.ok(page.includes('applyTestsToAll'));
assert.ok(page.includes('HERD_BULK_MAX'));
assert.ok(page.includes('parseHerdNameTags'));
assert.ok(page.includes('animalsAPI.create'));
assert.ok(!/reportsAPI\.generate|generateReport\(/.test(
  page.slice(page.indexOf('createAnimalsBulk'), page.indexOf('createAnimalsBulk') + 1500)
));

assert.ok(i18n.includes('bulkModeList'));
assert.ok(i18n.includes('applyTestsToAll'));
assert.ok(i18n.includes('قائمة سريعة'));

console.log('herd bulk animals wiring ok');
