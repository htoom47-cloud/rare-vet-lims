/**
 * Brucella herd list stays on the result engine and does not create sample reports.
 * Covers Rose Bengal + ELISA (S/P% + RESULT) panel wiring.
 * Usage: node src/scripts/verify-brucella-list.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '../services/brucella-list.service.js'), 'utf8');
const routes = fs.readFileSync(path.join(__dirname, '../routes/results.routes.js'), 'utf8');
const page = fs.readFileSync(path.join(__dirname, '../../../frontend/src/pages/BrucellaList.jsx'), 'utf8');
const print = fs.readFileSync(path.join(__dirname, '../../../frontend/src/utils/brucellaListPrint.js'), 'utf8');
const pdf = fs.readFileSync(path.join(__dirname, '../utils/brucella-list-pdf.js'), 'utf8');
const ensure = fs.readFileSync(path.join(__dirname, 'ensure-bru-elisa.js'), 'utf8');
const migrate = fs.readFileSync(path.join(__dirname, 'migrate.js'), 'utf8');
const storage = fs.readFileSync(path.join(__dirname, '../config/storage.js'), 'utf8');
const portal = fs.readFileSync(path.join(__dirname, '../services/portal.service.js'), 'utf8');

assert.ok(src.includes('enterResults'));
assert.ok(src.includes('validateResults'));
assert.ok(!/INSERT INTO reports|generate\(/.test(src));
assert.ok(src.includes('publishForCustomer'));
assert.ok(src.includes('customer_brucella_lists'));
assert.ok(src.includes("normalizePanel"));
assert.ok(src.includes("'elisa'"));
assert.ok(src.includes('SP-RATIO'));
assert.ok(src.includes('sp_parameter_id'));
assert.ok(src.includes('missing_sp'));
assert.ok(migrate.includes('CREATE TABLE IF NOT EXISTS customer_brucella_lists'));
assert.ok(migrate.includes('uq_customer_brucella_lists_customer_panel'));
assert.ok(migrate.includes('ensureBruElisaCatalog'));
assert.ok(ensure.includes("code: 'BRU-ELISA'"));
assert.ok(ensure.includes("code: 'SP-RATIO'"));
assert.ok(ensure.includes("code: 'RESULT'"));
assert.ok(storage.includes('brucella-lists/'));
assert.ok(portal.includes('customer_brucella_lists'));
assert.ok(portal.includes('serveBrucellaListPdf'));
assert.ok(portal.includes("panel === 'elisa'"));
assert.ok(src.includes("لا توجد مالطيه"));
assert.ok(src.includes('validated_locked'));
assert.ok(src.includes('notDeleted'));
assert.ok(src.includes('collapseBySample'));
assert.ok(routes.includes("'/brucella-list'"));
assert.ok(routes.includes('panel:'));
assert.ok(routes.indexOf("'/brucella-list'") < routes.indexOf("'/enter'"));
assert.ok(page.includes('printBrucellaList'));
assert.ok(page.includes("panel === 'elisa'") || page.includes("panel === \"elisa\"") || page.includes('isElisa'));
assert.ok(page.includes('spDrafts') || page.includes('sp_value'));
assert.ok(page.includes('panelElisa') || page.includes('panelRose'));
assert.ok(!/reportsAPI\.generate|generateReport/.test(page));
assert.ok(print.includes('rpt-header'));
assert.ok(print.includes('مركز رعاية النوادر البيطري'));
assert.ok(print.includes("window.open('about:blank'"));
assert.ok(!/window\.open\([^)]*noopener/.test(print));
assert.ok(print.includes('.section--results-box { break-inside: auto'));
assert.ok(!print.includes('.rpt-header, .card, .overview { break-inside: avoid'));
assert.ok(print.includes('isElisa') || print.includes("panel === 'elisa'"));
assert.ok(print.includes('S/P%') || print.includes('labels.sp'));
assert.ok(!/INSERT INTO reports|generate\(/.test(print));
assert.ok(pdf.includes('elisaColumns') || pdf.includes("panel === 'elisa'"));
assert.ok(pdf.includes('S/P%'));

console.log('brucella list wiring ok (rose + elisa)');
