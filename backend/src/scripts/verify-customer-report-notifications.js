/**
 * Phase 13 — Customer portal sync + consolidated report notifications.
 * Usage: node src/scripts/verify-customer-report-notifications.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  BATCH_TYPE,
  buildConsolidatedReportMessage,
  messageHash,
  extractSentReportIds,
  findDuplicateReportIds,
  isReportReadyForCustomer,
} = require('../services/customer-report-notifications.utils');

const LIFECYCLE = {
  DRAFT: 'draft',
  APPROVED: 'approved',
  PUBLISHED: 'published',
};

const resolveLifecycle = (row) => {
  if (row.is_final !== false && row.pdf_url) return LIFECYCLE.PUBLISHED;
  if (row.lab_specialist_approved_by || row.vet_approved_by) return LIFECYCLE.APPROVED;
  return LIFECYCLE.DRAFT;
};

const isPortalVisible = (lifecycle, row) => {
  if (!row?.pdf_url) return false;
  if (lifecycle === LIFECYCLE.DRAFT) return false;
  return lifecycle === LIFECYCLE.APPROVED || lifecycle === LIFECYCLE.PUBLISHED;
};

let passed = 0;
let failed = 0;

const check = (label, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${label}: ${err.message}`);
  }
};

const ROOT = path.join(__dirname, '..');

console.log('\n=== Phase 13 — Portal Sync + Report Notifications ===\n');

console.log('--- Portal visibility ---\n');

check('Draft report not portal visible', () => {
  const row = { pdf_url: null, is_final: false };
  const lifecycle = resolveLifecycle(row);
  assert.strictEqual(lifecycle, LIFECYCLE.DRAFT);
  assert.strictEqual(isPortalVisible(lifecycle, row), false);
});

check('Approved + PDF is portal visible', () => {
  const row = { pdf_url: '/uploads/r.pdf', lab_specialist_approved_by: 'user-1', is_final: true };
  const lifecycle = resolveLifecycle(row);
  assert.strictEqual(isPortalVisible(lifecycle, row), true);
});

check('Approved without PDF not portal visible', () => {
  const row = { pdf_url: null, lab_specialist_approved_by: 'user-1' };
  const lifecycle = resolveLifecycle(row);
  assert.strictEqual(isPortalVisible(lifecycle, row), false);
});

check('portalVisibilitySql requires pdf_url', () => {
  const src = fs.readFileSync(path.join(ROOT, 'services', 'portal-sync.service.js'), 'utf8');
  assert.ok(src.includes('pdf_url IS NOT NULL'));
  assert.ok(src.includes('isPortalVisible(lifecycle, reportRow'));
});

console.log('\n--- Ready reports helpers ---\n');

check('isReportReadyForCustomer — approved + pdf', () => {
  assert.strictEqual(isReportReadyForCustomer({ pdf_url: '/x.pdf', vet_approved_by: 'u1' }), true);
});

check('isReportReadyForCustomer — draft rejected', () => {
  assert.strictEqual(isReportReadyForCustomer({ pdf_url: null }), false);
});

check('Consolidated message lists all reports + portal link', () => {
  const body = buildConsolidatedReportMessage({
    customerName: 'أحمد',
    portalUrl: 'https://portal.example.com',
    labNameAr: 'مركز رعاية النوادر البيطري',
    reports: [
      { report_number: 'RPT-001', animal_name: 'سعد' },
      { report_number: 'RPT-002', animal_name: 'نورة' },
    ],
  });
  assert.ok(body.includes('أحمد'));
  assert.ok(body.includes('RPT-001'));
  assert.ok(body.includes('RPT-002'));
  assert.ok(body.includes('https://portal.example.com'));
  assert.ok(body.includes('1.'));
  assert.ok(body.includes('2.'));
});

check('Duplicate detection via notification metadata', () => {
  const sent = extractSentReportIds([
    { metadata: { type: BATCH_TYPE, report_ids: ['a', 'b'] } },
  ]);
  assert.deepStrictEqual(findDuplicateReportIds(['b', 'c'], sent), ['b']);
});

check('messageHash is stable', () => {
  const h1 = messageHash('test body');
  const h2 = messageHash('test body');
  assert.strictEqual(h1, h2);
  assert.notStrictEqual(h1, messageHash('other'));
});

console.log('\n--- API & UI wiring ---\n');

check('customers routes — ready-reports + send-ready-reports', () => {
  const src = fs.readFileSync(path.join(ROOT, 'routes', 'customers.routes.js'), 'utf8');
  assert.ok(src.includes('/ready-reports'));
  assert.ok(src.includes('/send-ready-reports'));
  assert.ok(src.includes('NOTIFICATIONS_SEND_REPORT'));
});

check('notifications dry-run via SEND_REAL_NOTIFICATIONS', () => {
  const envSrc = fs.readFileSync(path.join(ROOT, 'config', 'env.js'), 'utf8');
  assert.ok(envSrc.includes('sendReal'));
  const notifSrc = fs.readFileSync(path.join(ROOT, 'services', 'notifications.service.js'), 'utf8');
  assert.ok(notifSrc.includes('sendReal'));
  assert.ok(notifSrc.includes('dry-run'));
});

check('Portal preview uses cache-bust param', () => {
  const src = fs.readFileSync(
    path.join(ROOT, '..', '..', 'frontend-portal', 'src', 'services', 'portalApi.js'),
    'utf8'
  );
  assert.ok(src.includes('Date.now()'));
});

check('Reports list — send hidden except admin', () => {
  const src = fs.readFileSync(
    path.join(ROOT, '..', '..', 'frontend', 'src', 'pages', 'Reports.jsx'),
    'utf8'
  );
  assert.ok(src.includes("user?.role === 'admin'"));
});

check('Samples list — per-sample send disabled', () => {
  const src = fs.readFileSync(
    path.join(ROOT, '..', '..', 'frontend', 'src', 'pages', 'Samples.jsx'),
    'utf8'
  );
  assert.ok(src.includes('canSendSmsToCustomer = false'));
});

check('Customer profile — send ready reports button', () => {
  const src = fs.readFileSync(
    path.join(ROOT, '..', '..', 'frontend', 'src', 'pages', 'Customers.jsx'),
    'utf8'
  );
  assert.ok(src.includes('sendReadyReports'));
  assert.ok(src.includes('readyReports'));
  assert.ok(src.includes('sendOneMessage'));
});

check('Manager has notifications.send_report permission', () => {
  const src = fs.readFileSync(path.join(ROOT, 'utils', 'permissions.js'), 'utf8');
  assert.ok(src.includes('NOTIFICATIONS_SEND_REPORT'));
  assert.ok(/manager:[\s\S]*NOTIFICATIONS_SEND_REPORT/.test(src));
});

check('Portal getPreview still uses reports.service', () => {
  const src = fs.readFileSync(path.join(ROOT, 'services', 'portal.service.js'), 'utf8');
  assert.ok(src.includes('reportsService.getPreview'));
  assert.ok(src.includes('assertPortalReportVisible'));
});

check('Portal PDF download uses same servePdf as staff', () => {
  const src = fs.readFileSync(path.join(ROOT, 'services', 'portal.service.js'), 'utf8');
  assert.ok(src.includes('reportsService.servePdf'));
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
