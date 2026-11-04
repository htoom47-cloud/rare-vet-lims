/**
 * Diarrhea causes (DIARR-AG) catalog wiring — static checks.
 * Usage: node src/scripts/verify-diarrhea-causes.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ensureSrc = fs.readFileSync(path.join(__dirname, 'ensure-diarrhea-causes.js'), 'utf8');
const migrateSrc = fs.readFileSync(path.join(__dirname, 'migrate.js'), 'utf8');
const cloudSrc = fs.readFileSync(path.join(__dirname, 'cloud-start.js'), 'utf8');
const cultureAstSrc = fs.readFileSync(path.join(__dirname, '../utils/culture-ast.js'), 'utf8');
const cultureEntrySrc = fs.readFileSync(
  path.join(__dirname, '../../../frontend/src/utils/cultureEntry.js'),
  'utf8'
);

assert.ok(ensureSrc.includes("code: 'DIARR-AG'"));
assert.ok(ensureSrc.includes('مسببات الإسهال'));
assert.ok(ensureSrc.includes('CRYPTO-AG'));
assert.ok(ensureSrc.includes('ROTA-AG'));
assert.ok(ensureSrc.includes('CORONA-AG'));
assert.ok(ensureSrc.includes('ECOLI-K99-AG'));
assert.ok(ensureSrc.includes('GIARDIA-AG'));
assert.ok(ensureSrc.includes('CPERF-AG'));
assert.ok(ensureSrc.includes("unit = 'qual'") || ensureSrc.includes("'qual'"));
assert.ok(ensureSrc.includes("code: 'RAPID'"));

assert.ok(migrateSrc.includes('ensureDiarrheaCausesCatalog'));
assert.ok(cloudSrc.includes('ensure-diarrhea-causes.js'));
assert.ok(cultureAstSrc.includes('DIARRHEA_AG_EXCLUDE'));
assert.ok(cultureAstSrc.includes("code === 'DIARR-AG'"));
assert.ok(cultureEntrySrc.includes('DIARRHEA_AG_EXCLUDE'));
assert.ok(cultureEntrySrc.includes("code === 'DIARR-AG'"));

const { DIARR_PARAMS, DIARR_TEST } = require('./ensure-diarrhea-causes');
assert.strictEqual(DIARR_TEST.code, 'DIARR-AG');
assert.strictEqual(DIARR_PARAMS.length, 6);
assert.deepStrictEqual(
  DIARR_PARAMS.map((p) => p.code),
  ['CRYPTO-AG', 'ROTA-AG', 'CORONA-AG', 'ECOLI-K99-AG', 'GIARDIA-AG', 'CPERF-AG']
);

const transformed = cultureEntrySrc
  .replace(/export const /g, 'const ')
  .replace(/export \{[^}]+\};?/g, '');
const sandbox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(
  `${transformed}\nmodule.exports = { isCultureTest };`,
  sandbox,
  { filename: 'cultureEntry.js' }
);
const { isCultureTest } = sandbox.module.exports;
assert.strictEqual(isCultureTest({ code: 'DIARR-AG', name_ar: 'مسببات الإسهال' }), false);
assert.strictEqual(isCultureTest({ code: 'X', name_ar: 'فحص مسببات الاسهال' }), false);
assert.strictEqual(isCultureTest({ code: 'CULT-BACT', category_code: 'CULT' }), true);

console.log('diarrhea causes catalog rules ok');
