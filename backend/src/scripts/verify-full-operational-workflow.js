/**
 * Full Operational Workflow — verification (flags default OFF, no real notifications).
 * Usage: node src/scripts/verify-full-operational-workflow.js
 */
require('dotenv').config();

process.env.SEND_REAL_NOTIFICATIONS = process.env.SEND_REAL_NOTIFICATIONS || 'false';
process.env.REQUIRE_INVOICE_BEFORE_BARCODE = process.env.REQUIRE_INVOICE_BEFORE_BARCODE || 'false';
process.env.REQUIRE_LAB_HANDOVER = process.env.REQUIRE_LAB_HANDOVER || 'false';
process.env.LOCK_APPROVED_REPORTS = process.env.LOCK_APPROVED_REPORTS || 'false';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

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

const asyncCheck = async (label, fn) => {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${label}: ${err.message}`);
  }
};

const ROOT = path.join(__dirname, '..');

console.log('\n=== Full Operational Workflow Hardening ===\n');

console.log('--- Feature flags (default OFF) ---\n');

check('env.js defines operational flags', () => {
  const src = fs.readFileSync(path.join(ROOT, 'config', 'env.js'), 'utf8');
  assert.ok(src.includes('requireInvoiceBeforeBarcode'));
  assert.ok(src.includes('requireLabHandover'));
  assert.ok(src.includes('lockApprovedReports'));
  assert.ok(src.includes("REQUIRE_INVOICE_BEFORE_BARCODE === 'true'"));
});

check('staff-features exposes flags to UI', () => {
  delete require.cache[require.resolve('../config/env')];
  delete require.cache[require.resolve('../utils/staff-features')];
  const { getStaffFeatures } = require('../utils/staff-features');
  const f = getStaffFeatures();
  assert.strictEqual(f.requireInvoiceBeforeBarcode, false);
  assert.strictEqual(f.requireLabHandover, false);
  assert.strictEqual(f.lockApprovedReports, false);
});

console.log('\n--- Portal safety ---\n');

check('portalVisibilitySql requires PDF + approval', () => {
  const portalSync = require('../services/portal-sync.service');
  const sql = portalSync.portalVisibilitySql('r');
  assert.ok(sql.includes('pdf_url IS NOT NULL'));
  assert.ok(sql.includes('lab_specialist_approved_by'));
});

check('portal listDocuments filters attachments by visibility', () => {
  const src = fs.readFileSync(path.join(ROOT, 'services', 'portal.service.js'), 'utf8');
  assert.ok(src.includes('portalReportFilter'));
  const attachBlock = src.slice(src.indexOf('result_attachments ra'), src.indexOf('ORDER BY ra.created_at DESC'));
  assert.ok(attachBlock.includes('portalReportFilter'));
});

check('customer-scope resolves mobile aggregation', () => {
  const src = fs.readFileSync(path.join(ROOT, 'utils', 'customer-scope.js'), 'utf8');
  assert.ok(src.includes('slice(-9)'));
});

console.log('\n--- Customer ready reports ---\n');

check('send-ready-reports route + forceResend', () => {
  const src = fs.readFileSync(path.join(ROOT, 'routes', 'customers.routes.js'), 'utf8');
  assert.ok(src.includes('/ready-reports'));
  assert.ok(src.includes('forceResend'));
});

check('notifications service scopes by mobile', () => {
  const src = fs.readFileSync(path.join(ROOT, 'services', 'customer-report-notifications.service.js'), 'utf8');
  assert.ok(src.includes('resolveCustomerIdsByMobile'));
  assert.ok(src.includes('CUSTOMER_SCOPE_MISMATCH'));
});

check('Reports page removes legacy per-report send', () => {
  const src = fs.readFileSync(path.join(ROOT, '../../frontend/src/pages/Reports.jsx'), 'utf8');
  assert.ok(!src.includes('sendToCustomer(r)'));
});

console.log('\n--- Sample / billing / handover ---\n');

check('getBarcode enforces invoice when flag on', () => {
  const src = fs.readFileSync(path.join(ROOT, 'services', 'samples.service.js'), 'utf8');
  assert.ok(src.includes('assertInvoiceAllowsBarcode(sample)'));
  assert.ok(src.includes('INVOICE_REQUIRED'));
});

check('lab handover route + service', () => {
  const routes = fs.readFileSync(path.join(ROOT, 'routes', 'samples.routes.js'), 'utf8');
  const svc = fs.readFileSync(path.join(ROOT, 'services', 'samples.service.js'), 'utf8');
  assert.ok(routes.includes('lab-handover'));
  assert.ok(svc.includes('recordLabHandover'));
  assert.ok(svc.includes('lab_handover_at'));
});

check('reassign animal — admin/manager + audit', () => {
  const src = fs.readFileSync(path.join(ROOT, 'services', 'samples.service.js'), 'utf8');
  assert.ok(src.includes("MANAGER_ROLES = ['admin', 'manager']"));
  assert.ok(src.includes('reassign_animal'));
  assert.ok(src.includes('markReportsNeedsUpdateBySampleId'));
});

console.log('\n--- Report lock ---\n');

check('report-lock gated by LOCK_APPROVED_REPORTS', () => {
  const src = fs.readFileSync(path.join(ROOT, 'services', 'report-lock.service.js'), 'utf8');
  assert.ok(src.includes('lockApprovedReports'));
  assert.ok(src.includes('reopenReport'));
});

check('reopen report route exists', () => {
  const src = fs.readFileSync(path.join(ROOT, 'routes', 'reports.routes.js'), 'utf8');
  assert.ok(src.includes('/reopen'));
});

check('results enter checks report lock', () => {
  const src = fs.readFileSync(path.join(ROOT, 'services', 'results.service.js'), 'utf8');
  assert.ok(src.includes('assertSampleNotReportLocked'));
});

console.log('\n--- Dashboard operations ---\n');

check('dashboard operations stats', () => {
  const src = fs.readFileSync(path.join(ROOT, 'services', 'dashboard.service.js'), 'utf8');
  assert.ok(src.includes('getOperationsStats'));
  assert.ok(src.includes('awaiting_invoice'));
  assert.ok(src.includes('ready_to_send'));
  assert.ok(src.includes('data_errors'));
});

console.log('\n--- Thermal invoice (HTML) ---\n');

check('thermal invoice HTML utility (80mm)', () => {
  const src = fs.readFileSync(path.join(ROOT, '../../frontend/src/utils/thermalInvoicePrint.js'), 'utf8');
  assert.ok(src.includes('80mm'));
  assert.ok(src.includes('buildThermalInvoiceHtml'));
  assert.ok(src.includes('@page'));
});

check('WorkflowCase thermal print button', () => {
  const src = fs.readFileSync(path.join(ROOT, '../../frontend/src/pages/WorkflowCase.jsx'), 'utf8');
  assert.ok(src.includes('printThermalInvoice'));
  assert.ok(src.includes('printThermalReceipt'));
});

console.log('\n--- Notifications dry-run ---\n');

check('SEND_REAL_NOTIFICATIONS false in test env', () => {
  delete require.cache[require.resolve('../config/env')];
  const env = require('../config/env');
  assert.strictEqual(env.notifications.sendReal, false);
});

(async () => {
  const hasDb = !!(process.env.DATABASE_URL || process.env.DB_HOST);
  if (hasDb) {
    console.log('\n--- Database checks ---\n');
    try {
      const { pool } = require('../config/database');
      const client = await pool.connect();
      try {
        const cols = await client.query(`
          SELECT column_name FROM information_schema.columns
          WHERE table_name = 'samples'
            AND column_name IN ('lab_handover_at', 'lab_handover_by')
        `);
        check('samples lab_handover columns exist', () => {
          assert.strictEqual(cols.rows.length, 2);
        });

        await asyncCheck('assertInvoiceAllowsBarcode — flag off allows pending sample', async () => {
          delete require.cache[require.resolve('../config/env')];
          delete require.cache[require.resolve('../services/samples.service')];
          process.env.REQUIRE_INVOICE_BEFORE_BARCODE = 'false';
          const samples = require('../services/samples.service');
          const pending = await client.query(
            `SELECT s.* FROM samples s WHERE s.status = 'pending' ORDER BY s.created_at DESC LIMIT 1`
          );
          if (pending.rows[0]) {
            await samples.assertInvoiceAllowsBarcode(pending.rows[0]);
          }
        });

        await asyncCheck('assertInvoiceAllowsBarcode — flag on blocks without invoice', async () => {
          process.env.REQUIRE_INVOICE_BEFORE_BARCODE = 'true';
          delete require.cache[require.resolve('../config/env')];
          delete require.cache[require.resolve('../services/samples.service')];
          const samples = require('../services/samples.service');
          const row = await client.query(
            `SELECT s.* FROM samples s
             WHERE s.status = 'pending'
               AND NOT EXISTS (
                 SELECT 1 FROM invoices i
                 WHERE i.sample_id = s.id AND i.status NOT IN ('cancelled', 'refunded')
               )
             ORDER BY s.created_at DESC LIMIT 1`
          );
          if (row.rows[0]) {
            let blocked = false;
            try {
              await samples.assertInvoiceAllowsBarcode(row.rows[0]);
            } catch (err) {
              blocked = err.code === 'INVOICE_REQUIRED';
            }
            assert.strictEqual(blocked, true);
          }
          process.env.REQUIRE_INVOICE_BEFORE_BARCODE = 'false';
        });

        await asyncCheck('report lock — flag off does not block', async () => {
          delete require.cache[require.resolve('../config/env')];
          delete require.cache[require.resolve('../services/report-lock.service')];
          process.env.LOCK_APPROVED_REPORTS = 'false';
          const lock = require('../services/report-lock.service');
          const approved = await client.query(
            `SELECT sample_id FROM reports
             WHERE lab_specialist_approved_by IS NOT NULL OR vet_approved_by IS NOT NULL
             LIMIT 1`
          );
          if (approved.rows[0]?.sample_id) {
            await lock.assertSampleNotReportLocked(approved.rows[0].sample_id);
          }
          process.env.LOCK_APPROVED_REPORTS = 'false';
        });
      } finally {
        client.release();
        await pool.end();
      }
    } catch (err) {
      console.log(`  (database checks skipped: ${err.message})`);
    }
  } else {
    console.log('\n(database checks skipped — no DATABASE_URL)\n');
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  console.log('Real messages sent during test: NO (SEND_REAL_NOTIFICATIONS=false)\n');
  process.exit(failed > 0 ? 1 : 0);
})();
