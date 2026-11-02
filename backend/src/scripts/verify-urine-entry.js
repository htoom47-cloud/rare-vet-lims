/**
 * Urinalysis catalog + editable entry_options.
 * Usage: node src/scripts/verify-urine-entry.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { normalizeEntryOptions } = require('../utils/entry-options');
const { URINE_PARAMS, URINE_TEST } = require('./ensure-urine');

const migrateSrc = fs.readFileSync(path.join(__dirname, 'migrate.js'), 'utf8');
const cloudSrc = fs.readFileSync(path.join(__dirname, 'cloud-start.js'), 'utf8');
const serviceSrc = fs.readFileSync(path.join(__dirname, '../services/tests.service.js'), 'utf8');
const ensureSrc = fs.readFileSync(path.join(__dirname, 'ensure-urine.js'), 'utf8');
const workbenchSrc = fs.readFileSync(
  path.join(__dirname, '../../../frontend/src/pages/TechnicianWorkbench.jsx'),
  'utf8',
);
const testsAdminSrc = fs.readFileSync(
  path.join(__dirname, '../../../frontend/src/pages/Tests.jsx'),
  'utf8',
);
const entryFeSrc = fs.readFileSync(
  path.join(__dirname, '../../../frontend/src/utils/entryOptions.js'),
  'utf8',
);

assert.ok(migrateSrc.includes('entry_options JSONB'));
assert.ok(migrateSrc.includes('ensureUrineCatalog'));
assert.ok(
  migrateSrc.indexOf('entry_options JSONB') < migrateSrc.indexOf('ensureUrineCatalog'),
  'ensureUrineCatalog must run after entry_options column exists',
);
assert.ok(cloudSrc.includes('ensure-urine.js'));
assert.ok(serviceSrc.includes('normalizeEntryOptions'));
assert.ok(serviceSrc.includes('entry_options'));
assert.ok(ensureSrc.includes("code: 'URINE-UA'"));
assert.ok(ensureSrc.includes('entry_options'));
assert.ok(workbenchSrc.includes('entry_options'));
assert.ok(workbenchSrc.includes('entryOptionsCustom'));
assert.ok(workbenchSrc.includes('urineSectionLabel'));
assert.ok(testsAdminSrc.includes('entry_options_text'));
assert.ok(testsAdminSrc.includes('entryOptionsFromText'));
assert.ok(entryFeSrc.includes('normalizeEntryOptions'));

assert.strictEqual(URINE_TEST.code, 'URINE-UA');
assert.ok(URINE_PARAMS.some((p) => p.code === 'PH' && p.options.includes('Acid')));
assert.ok(URINE_PARAMS.some((p) => p.code === 'PROTEIN' && p.options.includes('++')));
assert.ok(URINE_PARAMS.some((p) => p.section === 'physical'));
assert.ok(URINE_PARAMS.some((p) => p.section === 'chemical'));
assert.ok(URINE_PARAMS.some((p) => p.section === 'microscopic'));

assert.deepStrictEqual(normalizeEntryOptions([' Nil ', '+', '+', '']), ['Nil', '+']);
assert.deepStrictEqual(normalizeEntryOptions('Acid\nAlkaline'), ['Acid', 'Alkaline']);
assert.strictEqual(normalizeEntryOptions(null), null);
assert.strictEqual(normalizeEntryOptions(''), null);

console.log('urine entry rules ok');
