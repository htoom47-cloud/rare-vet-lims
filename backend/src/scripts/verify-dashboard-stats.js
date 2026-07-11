/**
 * Verify dashboard numbers against live DB (same queries as dashboard.service).
 * Usage (Render Shell):
 *   cd backend && node src/scripts/verify-dashboard-stats.js
 * Optional UI snapshot to compare:
 *   node src/scripts/verify-dashboard-stats.js --expect '{"daily_samples":2,"month_samples":104,"daily_revenue":664,"month_revenue":11734,"pending_samples":9,"active_tests":18,"awaiting_invoice":22,"awaiting_barcode_print":22,"in_lab":9,"pending_approval":0,"ready_to_send":9,"failed_messages":2,"data_errors":0}'
 */
require('dotenv').config();
const { pool } = require('../config/database');
const { getStats } = require('../services/dashboard.service');

const expectArg = process.argv.find((a) => a.startsWith('--expect='));
const expectJson = expectArg
  ? expectArg.slice('--expect='.length)
  : (process.argv.includes('--expect') ? process.argv[process.argv.indexOf('--expect') + 1] : null);

const fmt = (n) => (typeof n === 'number' ? (Number.isInteger(n) ? String(n) : n.toFixed(2)) : String(n));

async function main() {
  const stats = await getStats();
  const ops = stats.operations || {};

  const live = {
    daily_samples: stats.daily_samples,
    month_samples: stats.month_samples,
    daily_revenue: stats.daily_revenue,
    month_revenue: stats.month_revenue,
    daily_invoiced: stats.daily_invoiced,
    month_invoiced: stats.month_invoiced,
    pending_samples: stats.pending_samples,
    active_tests: stats.active_tests,
    rejected_samples: stats.rejected_samples,
    awaiting_invoice: ops.awaiting_invoice,
    awaiting_barcode_print: ops.awaiting_barcode_print,
    in_lab: ops.in_lab,
    pending_approval: ops.pending_approval,
    ready_to_send: ops.ready_to_send,
    failed_messages: ops.failed_messages,
    data_errors: ops.data_errors,
  };

  console.log('\n=== Dashboard live stats (Asia/Riyadh) ===\n');
  for (const [k, v] of Object.entries(live)) {
    console.log(`  ${k.padEnd(28)} ${fmt(v)}`);
  }

  console.log('\n=== Consistency checks ===\n');
  const checks = [];
  checks.push({
    name: 'pending_samples == in_lab (when handover off)',
    ok: live.pending_samples === live.in_lab,
    detail: `${live.pending_samples} vs ${live.in_lab}`,
  });
  checks.push({
    name: 'awaiting_invoice / awaiting_barcode both >= 0',
    ok: live.awaiting_invoice >= 0 && live.awaiting_barcode_print >= 0,
    detail: `${live.awaiting_invoice} / ${live.awaiting_barcode_print}`,
  });
  checks.push({
    name: 'month_samples >= daily_samples',
    ok: live.month_samples >= live.daily_samples,
    detail: `${live.month_samples} >= ${live.daily_samples}`,
  });
  checks.push({
    name: 'month_revenue >= daily_revenue',
    ok: live.month_revenue >= live.daily_revenue,
    detail: `${live.month_revenue} >= ${live.daily_revenue}`,
  });
  checks.push({
    name: 'data_errors is 0 or small',
    ok: live.data_errors === 0,
    detail: String(live.data_errors),
  });

  for (const c of checks) {
    console.log(`  ${c.ok ? 'OK' : 'FAIL'}  ${c.name} (${c.detail})`);
  }

  if (expectJson) {
    const expected = JSON.parse(expectJson);
    console.log('\n=== Compare to UI snapshot ===\n');
    let mismatches = 0;
    for (const [k, uiVal] of Object.entries(expected)) {
      const liveVal = live[k];
      const close = typeof uiVal === 'number' && typeof liveVal === 'number' && !Number.isInteger(uiVal)
        ? Math.abs(liveVal - uiVal) < 0.5
        : liveVal === uiVal;
      if (!close) {
        mismatches += 1;
        console.log(`  MISMATCH  ${k}: UI=${uiVal}  DB=${fmt(liveVal)}`);
      } else {
        console.log(`  MATCH     ${k}: ${fmt(liveVal)}`);
      }
    }
    console.log(mismatches ? `\nResult: ${mismatches} mismatch(es)` : '\nResult: all UI numbers match DB');
    process.exitCode = mismatches ? 1 : 0;
  }

  if (stats.status_breakdown?.length) {
    console.log('\n=== Sample status breakdown ===\n');
    for (const row of stats.status_breakdown) {
      console.log(`  ${String(row.status).padEnd(16)} ${row.count}`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => pool.end());
