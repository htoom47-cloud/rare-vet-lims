/**
 * Static safety checks for gated camel semen analysis catalog.
 * Usage: node src/scripts/verify-semen-entry.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { SEMEN_PARAMS, SEMEN_TEST } = require('./ensure-semen');

const ensureSrc = fs.readFileSync(path.join(__dirname, 'ensure-semen.js'), 'utf8');
const envSrc = fs.readFileSync(path.join(__dirname, '../config/env.js'), 'utf8');
const staffSrc = fs.readFileSync(path.join(__dirname, '../utils/staff-features.js'), 'utf8');
const migrateSrc = fs.readFileSync(path.join(__dirname, 'migrate.js'), 'utf8');
const cloudSrc = fs.readFileSync(path.join(__dirname, 'cloud-start.js'), 'utf8');
const workbenchSrc = fs.readFileSync(
  path.join(__dirname, '../../../frontend/src/pages/TechnicianWorkbench.jsx'),
  'utf8'
);
const entrySrc = fs.readFileSync(
  path.join(__dirname, '../../../frontend/src/utils/entryOptions.js'),
  'utf8'
);

assert.ok(envSrc.includes("semenAnalysis: process.env.SEMEN_ANALYSIS_ENABLED === 'true'"));
assert.ok(staffSrc.includes('semenAnalysis:'));
assert.ok(migrateSrc.includes('ensureSemenCatalog'));
assert.ok(cloudSrc.includes('ensure-semen.js'));
assert.ok(ensureSrc.includes('if (!env.features?.semenAnalysis)'));
assert.ok(ensureSrc.includes("'camel'"));
assert.strictEqual(SEMEN_TEST.code, 'SEMEN-CAMEL');
assert.ok(SEMEN_PARAMS.some((p) => p.code === 'VOLUME' && p.section === 'physical'));
assert.ok(SEMEN_PARAMS.some((p) => p.code === 'MOTILITY_TOTAL' && p.section === 'microscopic'));
assert.ok(SEMEN_PARAMS.some((p) => p.code === 'WBC' && p.section === 'other_cells'));
assert.ok(SEMEN_PARAMS.some((p) => p.code === 'IMPRESSION' && p.section === 'impression'));
assert.ok(entrySrc.includes('SEMEN_ENTRY_SECTIONS'));
assert.ok(entrySrc.includes('semenSectionLabel'));
assert.ok(workbenchSrc.includes('semenAnalysis'));
assert.ok(workbenchSrc.includes('SEMEN_ENTRY_SECTIONS'));

console.log('semen entry rules ok (flag default off; camel refs only)');
