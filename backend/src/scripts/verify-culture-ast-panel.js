/**
 * Culture AST editable panel persistence (AST_PANEL).
 * Usage: node src/scripts/verify-culture-ast-panel.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const entryPath = path.join(__dirname, '../../../frontend/src/utils/cultureEntry.js');
const cultureAstPath = path.join(__dirname, '../utils/culture-ast.js');
const schemasPath = path.join(__dirname, '../validators/schemas.js');
const workbenchPath = path.join(__dirname, '../../../frontend/src/pages/TechnicianWorkbench.jsx');

const source = fs.readFileSync(entryPath, 'utf8');
const cultureAstSrc = fs.readFileSync(cultureAstPath, 'utf8');
const schemasSrc = fs.readFileSync(schemasPath, 'utf8');
const workbench = fs.readFileSync(workbenchPath, 'utf8');

const resultsSrc = fs.readFileSync(path.join(__dirname, '../services/results.service.js'), 'utf8');
const routesSrc = fs.readFileSync(path.join(__dirname, '../routes/results.routes.js'), 'utf8');
assert.ok(cultureAstSrc.includes("code: 'AST_PANEL'"));
assert.ok(cultureAstSrc.includes('Array.isArray(culture.antibiotics)'));
assert.ok(cultureAstSrc.includes('culture_ast_panel'));
assert.ok(resultsSrc.includes('getPreferredAstPanel'));
assert.ok(resultsSrc.includes('rememberPreferredAstPanel'));
assert.ok(schemasSrc.includes('antibiotics: Joi.array()'));
assert.ok(routesSrc.includes('/culture-ast-panel'));
assert.ok(workbench.includes('preferredAstPanel'));
assert.ok(workbench.includes('cultureAstPanel'));

const transformed = source
  .replace(/export const /g, 'const ')
  .replace(/export \{[^}]+\};?/g, '');
const sandbox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(`${transformed}\nmodule.exports = {\n  CULTURE_ANTIBIOTICS,\n  emptyCultureForm,\n  cultureFormFromFields,\n  culturePayloadFromForm,\n  cultureFormHasValue,\n  addCultureAntibiotic,\n  removeCultureAntibiotic,\n};`, sandbox, { filename: entryPath });
const {
  CULTURE_ANTIBIOTICS,
  emptyCultureForm,
  cultureFormFromFields,
  culturePayloadFromForm,
  cultureFormHasValue,
  addCultureAntibiotic,
  removeCultureAntibiotic,
} = sandbox.module.exports;

let form = emptyCultureForm();
form = removeCultureAntibiotic(form, 'Penicillin');
const added = addCultureAntibiotic(form, 'Ceftiofur');
assert.strictEqual(added.error, null);
form = added.form;
form.growth = 'Growth';
form.ast.Ceftiofur = 'high';

assert.ok(cultureFormHasValue(form));
const payload = culturePayloadFromForm(form);
assert.ok(Array.isArray(payload.antibiotics));
assert.ok(!payload.antibiotics.includes('Penicillin'));
assert.ok(payload.antibiotics.includes('Ceftiofur'));
assert.strictEqual(JSON.stringify(payload.highly_sensitive), JSON.stringify(['Ceftiofur']));

const { mapCultureToValues } = require('../utils/culture-ast');
const byCode = new Map([
  ['SPECIMEN', { id: '1' }],
  ['GROWTH', { id: '2' }],
  ['ORGANISM', { id: '3' }],
  ['GRAM', { id: '4' }],
  ['AST_PANEL', { id: '5' }],
  ['SENS_HIGH', { id: '6' }],
  ['SENS_WEAK', { id: '7' }],
  ['SENS_RES', { id: '8' }],
  ['CULT_NOTES', { id: '9' }],
]);
const mapped = mapCultureToValues({
  ...payload,
  antibiotics: [...payload.antibiotics],
  highly_sensitive: [...payload.highly_sensitive],
  weak_sensitive: [...payload.weak_sensitive],
  resistant: [...payload.resistant],
}, { byCode, growthCode: 'GROWTH' });
const panel = mapped.find((v) => v.parameter_id === '5');
assert.ok(panel, 'AST_PANEL value must be written');
assert.ok(panel.value.includes('Ceftiofur'));
assert.ok(!panel.value.split('\n').includes('Penicillin'));

const reloaded = cultureFormFromFields([
  { code: 'GROWTH', value: 'Growth' },
  { code: 'AST_PANEL', value: panel.value },
  { code: 'SENS_HIGH', value: 'Ceftiofur' },
]);
assert.ok(!reloaded.antibiotics.includes('Penicillin'));
assert.ok(reloaded.antibiotics.includes('Ceftiofur'));
assert.ok(reloaded.antibiotics.includes('Enrofloxacin'));
assert.strictEqual(reloaded.ast.Ceftiofur, 'high');
assert.strictEqual(reloaded.ast.Enrofloxacin, '');

// Legacy rows without AST_PANEL still get defaults ∪ classified
const legacy = cultureFormFromFields([
  { code: 'GROWTH', value: 'Growth' },
  { code: 'SENS_HIGH', value: 'CustomOnly' },
]);
assert.ok(legacy.antibiotics.includes('Penicillin'));
assert.ok(legacy.antibiotics.includes('CustomOnly'));

// New sample uses lab preferred panel, not hard-coded defaults alone
const preferred = ['Enrofloxacin', 'Ceftiofur', 'Ampicillin'];
const fresh = emptyCultureForm(preferred);
assert.strictEqual(JSON.stringify(fresh.antibiotics), JSON.stringify(preferred));
assert.ok(!fresh.antibiotics.includes('Penicillin'));
const freshFromFields = cultureFormFromFields([], {}, preferred);
assert.strictEqual(JSON.stringify(freshFromFields.antibiotics), JSON.stringify(preferred));
assert.ok(!cultureFormHasValue(freshFromFields, preferred));
assert.ok(cultureFormHasValue(removeCultureAntibiotic(freshFromFields, 'Ceftiofur'), preferred));

assert.ok(workbench.includes('addCultureAntibiotic'));
assert.ok(workbench.includes('removeCultureAntibiotic'));
assert.ok(CULTURE_ANTIBIOTICS.includes('Penicillin'));

console.log('culture AST panel persistence ok');
