/**
 * Report list search covers customer / animal / report identifiers.
 * Usage: node src/scripts/verify-report-list-search.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const service = fs.readFileSync(path.join(__dirname, '../services/reports.service.js'), 'utf8');
const page = fs.readFileSync(path.join(__dirname, '../../../frontend/src/pages/Reports.jsx'), 'utf8');
const i18n = fs.readFileSync(path.join(__dirname, '../../../frontend/src/i18n/index.js'), 'utf8');

assert.ok(service.includes('const list = async ({ page, limit, search })'));
assert.ok(service.includes('r.report_number ILIKE'));
assert.ok(service.includes('c.mobile ILIKE'));
assert.ok(service.includes('a.animal_code ILIKE'));
assert.ok(service.includes('a.name_tag ILIKE'));
assert.ok(service.includes('normalizeMobileDigits'));
assert.ok(service.includes('LEFT JOIN animals a ON s.animal_id = a.id'));
assert.ok(page.includes('searchListPlaceholder'));
assert.ok(page.includes('debouncedListSearch'));
assert.ok(page.includes("reportsAPI.list({"));
assert.ok(page.includes('search: debouncedListSearch.trim() || undefined'));
assert.ok(i18n.includes("searchListPlaceholder: 'Mobile, customer name, report no., animal no. or name...'"));
assert.ok(i18n.includes("searchListPlaceholder: 'رقم الجوال أو اسم العميل أو رقم التقرير أو رقم الحيوان أو الاسم...'"));

console.log('report list search wiring ok');
