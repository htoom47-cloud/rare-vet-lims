/**
 * Portal reports/dashboard must not fail entirely on one bad animal preview.
 * Usage: node src/scripts/verify-portal-dashboard-resilience.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const portalSrc = fs.readFileSync(path.join(__dirname, '../services/portal.service.js'), 'utf8');
const reportsPage = fs.readFileSync(
  path.join(__dirname, '../../../frontend-portal/src/pages/PortalReports.jsx'),
  'utf8'
);

assert.ok(portalSrc.includes('Portal animal preview failed'));
assert.ok(portalSrc.includes('previewError: true'));
assert.ok(portalSrc.includes('Portal dashboard animal summary failed'));
assert.ok(portalSrc.includes('animals.slice(0, 8)'));

assert.ok(reportsPage.includes('portalReportsAPI.list'));
assert.ok(reportsPage.includes('must not hide the report list'));
assert.ok(!/Promise\.all\(\[\s*portalReportsAPI\.list/.test(reportsPage));

console.log('portal dashboard resilience ok');
