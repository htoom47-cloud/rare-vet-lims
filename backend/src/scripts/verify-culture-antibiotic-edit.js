/**
 * Culture AST antibiotic add/remove wiring (no DB).
 * Usage: node src/scripts/verify-culture-antibiotic-edit.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const entryPath = path.join(__dirname, '../../../frontend/src/utils/cultureEntry.js');
const workbenchPath = path.join(__dirname, '../../../frontend/src/pages/TechnicianWorkbench.jsx');
const source = fs.readFileSync(entryPath, 'utf8');
const workbench = fs.readFileSync(workbenchPath, 'utf8');

const transformed = source
  .replace(/export const /g, 'const ')
  .replace(/export \{[^}]+\};?/g, '');
const sandbox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(`${transformed}\nmodule.exports = {\n  CULTURE_ANTIBIOTICS,\n  emptyCultureForm,\n  cultureFormFromFields,\n  culturePayloadFromForm,\n  addCultureAntibiotic,\n  removeCultureAntibiotic,\n};`, sandbox);
const {
  CULTURE_ANTIBIOTICS,
  emptyCultureForm,
  cultureFormFromFields,
  culturePayloadFromForm,
  addCultureAntibiotic,
  removeCultureAntibiotic,
} = sandbox.module.exports;

const same = (a, b) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b));

assert.ok(Array.isArray(CULTURE_ANTIBIOTICS) && CULTURE_ANTIBIOTICS.length > 0);

const empty = emptyCultureForm();
same(empty.antibiotics, CULTURE_ANTIBIOTICS);

const removed = removeCultureAntibiotic(empty, 'Penicillin');
assert.ok(!removed.antibiotics.includes('Penicillin'));
assert.strictEqual(removed.ast.Penicillin, undefined);

const { form: withCustom, error } = addCultureAntibiotic(removed, 'Ceftiofur');
assert.strictEqual(error, null);
assert.ok(withCustom.antibiotics.includes('Ceftiofur'));
withCustom.ast.Ceftiofur = 'high';
withCustom.growth = 'Growth';
const payload = culturePayloadFromForm(withCustom);
same(payload.highly_sensitive, ['Ceftiofur']);
assert.ok(!payload.resistant.includes('Penicillin'));
assert.ok(!payload.highly_sensitive.includes('Penicillin'));

const loaded = cultureFormFromFields([
  { code: 'GROWTH', value: 'Growth' },
  { code: 'SENS_HIGH', value: 'Ceftiofur\nEnrofloxacin' },
  { code: 'SENS_RES', value: 'Custom-AB' },
]);
assert.ok(loaded.antibiotics.includes('Ceftiofur'));
assert.ok(loaded.antibiotics.includes('Custom-AB'));
assert.strictEqual(loaded.ast.Ceftiofur, 'high');
assert.strictEqual(loaded.ast['Custom-AB'], 'res');
assert.strictEqual(loaded.ast.Enrofloxacin, 'high');

const dup = addCultureAntibiotic(withCustom, 'ceftiofur');
assert.strictEqual(dup.error, 'duplicate');

assert.ok(workbench.includes('addCultureAntibiotic'));
assert.ok(workbench.includes('removeCultureAntibiotic'));
assert.ok(workbench.includes('handleAddAntibiotic'));
assert.ok(workbench.includes('handleRemoveAntibiotic'));
assert.ok(workbench.includes('إضافة مضاد') || workbench.includes('Add antibiotic'));

console.log('culture antibiotic add/remove ok');
