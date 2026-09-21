/**
 * Read-only ops reports: range helper + wiring (no DB, no mutations).
 * Usage: node src/scripts/verify-ops-reports.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { labDay, labMonthRange } = require('../utils/accounting-time');
const { resolveOperationsRange, MAX_RANGE_DAYS, isIsoDate } = require('../utils/ops-report-range');

const month = labMonthRange();
const today = labDay();

assert.strictEqual(isIsoDate('2026-09-01'), true);
assert.strictEqual(isIsoDate('2026-9-1'), false);
assert.strictEqual(MAX_RANGE_DAYS, 366);

const defaults = resolveOperationsRange();
assert.strictEqual(defaults.fromDate, month.fromDate);
assert.strictEqual(defaults.toDate, today);

const swapped = resolveOperationsRange('2026-09-20', '2026-09-01');
assert.strictEqual(swapped.fromDate, '2026-09-01');
assert.strictEqual(swapped.toDate, '2026-09-20');
assert.strictEqual(swapped.days, 20);

const leap = resolveOperationsRange('2028-01-01', '2028-12-31');
assert.strictEqual(leap.days, 366);

let threw = false;
try {
  resolveOperationsRange('2025-01-01', '2026-12-31');
} catch (err) {
  threw = err.statusCode === 400 && err.code === 'VALIDATION_ERROR';
}
assert.strictEqual(threw, true);

const serviceSrc = fs.readFileSync(path.join(__dirname, '../services/ops-reports.service.js'), 'utf8');
assert.ok(!/\b(INSERT|UPDATE|DELETE|ALTER)\b/.test(serviceSrc));
assert.ok(serviceSrc.includes('getOperationsReport'));
assert.ok(serviceSrc.includes('getRevenueSummary'));

const routesSrc = fs.readFileSync(path.join(__dirname, '../routes/billing.routes.js'), 'utf8');
assert.ok(/router\.get\('\/reports\/operations'/.test(routesSrc));
assert.ok(/opsReports\.getOperationsReport/.test(routesSrc));

const appSrc = fs.readFileSync(path.join(__dirname, '../../../frontend/src/App.jsx'), 'utf8');
assert.ok(appSrc.includes('ops-reports'));
assert.ok(appSrc.includes('OpsReports'));

console.log('ops reports wiring ok');
