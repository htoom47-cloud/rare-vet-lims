/**
 * P0 Hotfix: Diagnose & fix duplicated Brucellosis sample_tests
 *
 * Usage:
 *   node src/scripts/fix-duplicate-brucella.js                  (dry-run / diagnose only)
 *   node src/scripts/fix-duplicate-brucella.js --fix            (apply fix)
 *
 * Affected samples: BC-260701-809831, BC-260701-961938
 */
require('dotenv').config();
const { pool } = require('../config/database');

const SAMPLE_BARCODES = ['BC-260701-809831', 'BC-260701-961938'];
const FIX = process.argv.includes('--fix');

async function diagnose(client, barcode) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`SAMPLE: ${barcode}`);
  console.log('='.repeat(60));

  const sampleRow = await client.query(
    `SELECT id, sample_code, barcode, status, created_at
     FROM samples WHERE barcode = $1 OR sample_code = $1`,
    [barcode.replace(/^BC-/, '')]
  );

  if (!sampleRow.rows[0]) {
    console.log('  ❌ Sample NOT FOUND');
    return null;
  }

  const sample = sampleRow.rows[0];
  console.log(`  ID: ${sample.id}`);
  console.log(`  Status: ${sample.status}`);
  console.log(`  Created: ${sample.created_at}`);

  // 1. All sample_tests
  const sampleTests = await client.query(
    `SELECT st.id AS sample_test_id, st.test_id, st.price, st.status, st.created_at,
            t.code AS test_code, t.name AS test_name, t.name_ar AS test_name_ar
     FROM sample_tests st
     JOIN tests t ON st.test_id = t.id
     WHERE st.sample_id = $1
     ORDER BY st.created_at`,
    [sample.id]
  );

  console.log(`\n  SAMPLE_TESTS (${sampleTests.rows.length}):`);
  for (const st of sampleTests.rows) {
    console.log(`    - ${st.sample_test_id}`);
    console.log(`      test_code: ${st.test_code} | name: ${st.test_name} / ${st.test_name_ar}`);
    console.log(`      test_id: ${st.test_id}`);
    console.log(`      price: ${st.price} | status: ${st.status} | created: ${st.created_at}`);
  }

  // 2. Results for each sample_test
  console.log('\n  RESULTS:');
  for (const st of sampleTests.rows) {
    const results = await client.query(
      `SELECT r.id AS result_id, r.is_validated, r.completed_at, r.created_at,
              (SELECT COUNT(*) FROM result_values rv WHERE rv.result_id = r.id) AS value_count
       FROM results r WHERE r.sample_test_id = $1`,
      [st.sample_test_id]
    );
    if (!results.rows.length) {
      console.log(`    [${st.test_code}] ${st.sample_test_id}: NO RESULTS`);
    } else {
      for (const r of results.rows) {
        console.log(`    [${st.test_code}] ${st.sample_test_id}: result_id=${r.result_id} validated=${r.is_validated} values=${r.value_count}`);
      }
    }
  }

  // 3. Invoice items
  const invoiceItems = await client.query(
    `SELECT ii.id, ii.description, ii.unit_price, ii.quantity, ii.test_id, t.code AS test_code
     FROM invoice_items ii
     JOIN invoices inv ON ii.invoice_id = inv.id
     LEFT JOIN tests t ON ii.test_id = t.id
     WHERE inv.sample_id = $1
     ORDER BY ii.created_at`,
    [sample.id]
  );
  console.log(`\n  INVOICE ITEMS (${invoiceItems.rows.length}):`);
  for (const ii of invoiceItems.rows) {
    console.log(`    - ${ii.test_code || 'N/A'} | ${ii.description} | price=${ii.unit_price} | test_id=${ii.test_id}`);
  }

  // 4. Detect duplicates (same test_id or same test_code like BRU-ROSE-BENGAL)
  const bruTests = sampleTests.rows.filter((st) =>
    st.test_code === 'BRU-ROSE-BENGAL' || /bruc|مالطية|rose.*bengal/i.test(st.test_name + st.test_name_ar)
  );

  if (bruTests.length <= 1) {
    console.log('\n  ✅ No Brucella duplicate found.');
    return null;
  }

  console.log(`\n  ⚠️  DUPLICATE BRUCELLA DETECTED: ${bruTests.length} entries`);

  // Decide which to keep: the one with validated results, or the one with results, or the newest
  let keep = null;
  let remove = [];

  for (const st of bruTests) {
    const res = await client.query(
      `SELECT r.id, r.is_validated,
              (SELECT COUNT(*) FROM result_values rv WHERE rv.result_id = r.id) AS value_count
       FROM results r WHERE r.sample_test_id = $1`,
      [st.sample_test_id]
    );
    st._results = res.rows;
    st._hasValidated = res.rows.some((r) => r.is_validated);
    st._hasResults = res.rows.length > 0;
    st._hasValues = res.rows.some((r) => parseInt(r.value_count, 10) > 0);
  }

  // Priority: validated > has values > has results > latest created
  const sorted = [...bruTests].sort((a, b) => {
    if (a._hasValidated !== b._hasValidated) return b._hasValidated ? 1 : -1;
    if (a._hasValues !== b._hasValues) return b._hasValues ? 1 : -1;
    if (a._hasResults !== b._hasResults) return b._hasResults ? 1 : -1;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  keep = sorted[0];
  remove = sorted.slice(1);

  console.log(`\n  KEEP: ${keep.sample_test_id} (code=${keep.test_code}, validated=${keep._hasValidated}, values=${keep._hasValues})`);
  for (const r of remove) {
    console.log(`  REMOVE: ${r.sample_test_id} (validated=${r._hasValidated}, values=${r._hasValues}, results=${r._hasResults})`);
  }

  return { sample, keep, remove };
}

async function applyFix(client, plan) {
  if (!plan) return;
  const { sample, keep, remove } = plan;

  for (const dup of remove) {
    if (dup._hasValues || dup._hasValidated) {
      // Has real data — just delete the sample_test link and cascade results
      // Since results reference sample_test_id, we need to remove them first
      console.log(`\n  Removing results for duplicate ${dup.sample_test_id}...`);
      const results = await client.query(
        'SELECT id FROM results WHERE sample_test_id = $1',
        [dup.sample_test_id]
      );
      for (const r of results.rows) {
        await client.query('DELETE FROM result_values WHERE result_id = $1', [r.id]);
        await client.query('DELETE FROM result_attachments WHERE result_id = $1', [r.id]).catch(() => {});
      }
      await client.query('DELETE FROM results WHERE sample_test_id = $1', [dup.sample_test_id]);
    } else if (dup._hasResults) {
      // Has result row but no values
      await client.query('DELETE FROM results WHERE sample_test_id = $1', [dup.sample_test_id]);
    }

    // Delete the sample_test entry
    await client.query('DELETE FROM sample_tests WHERE id = $1', [dup.sample_test_id]);
    console.log(`  ✅ Deleted sample_test ${dup.sample_test_id}`);
  }

  // Recalculate sample status: if all remaining sample_tests are completed → completed
  const remaining = await client.query(
    `SELECT st.status, EXISTS (SELECT 1 FROM results r WHERE r.sample_test_id = st.id AND r.is_validated = true) AS is_validated
     FROM sample_tests st WHERE st.sample_id = $1`,
    [sample.id]
  );

  const allValidated = remaining.rows.length > 0 && remaining.rows.every((r) => r.is_validated);
  if (allValidated && sample.status !== 'completed') {
    await client.query(
      `UPDATE samples SET status = 'completed', completed_date = NOW(), updated_at = NOW() WHERE id = $1`,
      [sample.id]
    );
    console.log(`  ✅ Sample status updated to 'completed'`);
  } else if (allValidated) {
    console.log(`  ℹ️  Sample already completed`);
  } else {
    const anyRunning = remaining.rows.some((r) => r.status === 'running' || r.status === 'completed');
    if (anyRunning && sample.status === 'pending') {
      await client.query(`UPDATE samples SET status = 'running', updated_at = NOW() WHERE id = $1`, [sample.id]);
      console.log(`  ℹ️  Sample status set to 'running'`);
    }
  }
}

(async () => {
  const client = await pool.connect();
  try {
    const plans = [];
    for (const barcode of SAMPLE_BARCODES) {
      const plan = await diagnose(client, barcode);
      if (plan) plans.push(plan);
    }

    if (!plans.length) {
      console.log('\n✅ No duplicates found. Nothing to fix.');
      return;
    }

    if (!FIX) {
      console.log('\n⚠️  DRY RUN — pass --fix to apply changes.');
      return;
    }

    console.log('\n🔧 APPLYING FIX...');
    await client.query('BEGIN');
    for (const plan of plans) {
      await applyFix(client, plan);
    }
    await client.query('COMMIT');
    console.log('\n✅ Fix applied successfully.');

    // Verify post-fix
    console.log('\n--- POST-FIX VERIFICATION ---');
    for (const barcode of SAMPLE_BARCODES) {
      await diagnose(client, barcode);
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('ERROR:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
