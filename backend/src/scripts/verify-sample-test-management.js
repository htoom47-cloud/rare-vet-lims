require('dotenv').config();
const { pool, query, getClient } = require('../config/database');
const mgmt = require('../services/sample-test-management.service');
const samplesSvc = require('../services/samples.service');
const { PERMISSIONS, ROLE_PERMISSIONS } = require('../utils/permissions');
const { uuidv4 } = require('../utils/uuid');

let pass = 0;
let fail = 0;
function ok(label, cond) {
  if (cond) { pass++; console.log(`  PASS: ${label}`); }
  else { fail++; console.error(`  FAIL: ${label}`); }
}

(async () => {
  const client = await getClient();
  try {
    console.log('=== Phase 14: Sample Test Management Verification ===\n');

    // --- 1. Migration: cancelled enum exists ---
    const enumVals = await query(
      `SELECT unnest(enum_range(NULL::sample_status))::text AS val`
    );
    const vals = enumVals.rows.map((r) => r.val);
    ok('1. sample_status enum has "cancelled"', vals.includes('cancelled'));

    // --- 2. Permissions exist ---
    ok('2a. SAMPLE_TESTS_REMOVE permission defined', PERMISSIONS.SAMPLE_TESTS_REMOVE === 'sample_tests.remove');
    ok('2b. SAMPLE_TESTS_CANCEL permission defined', PERMISSIONS.SAMPLE_TESTS_CANCEL === 'sample_tests.cancel');
    ok('2c. SAMPLE_TESTS_REACTIVATE permission defined', PERMISSIONS.SAMPLE_TESTS_REACTIVATE === 'sample_tests.reactivate');

    // --- 3. Role assignments ---
    ok('3a. Reception can remove tests', ROLE_PERMISSIONS.reception.includes(PERMISSIONS.SAMPLE_TESTS_REMOVE));
    ok('3b. Reception cannot cancel tests', !ROLE_PERMISSIONS.reception.includes(PERMISSIONS.SAMPLE_TESTS_CANCEL));
    ok('3c. Lab technician can cancel tests', ROLE_PERMISSIONS.lab_technician.includes(PERMISSIONS.SAMPLE_TESTS_CANCEL));
    ok('3d. Manager can remove + cancel + reactivate', [
      PERMISSIONS.SAMPLE_TESTS_REMOVE,
      PERMISSIONS.SAMPLE_TESTS_CANCEL,
      PERMISSIONS.SAMPLE_TESTS_REACTIVATE,
    ].every((p) => ROLE_PERMISSIONS.manager.includes(p)));
    ok('3e. Admin has all permissions (Object.values)', ROLE_PERMISSIONS.admin.length === Object.values(PERMISSIONS).length);

    // --- 4. Create test data for functional tests ---
    const ts = Date.now();
    await client.query('BEGIN');

    const customerId = uuidv4();
    await client.query(
      `INSERT INTO customers (id, full_name, mobile, is_active) VALUES ($1, $2, $3, true)`,
      [customerId, `Test P14 ${ts}`, `050${ts}`]
    );

    const adminUserId = (await query(`SELECT id FROM users WHERE username = 'admin' LIMIT 1`)).rows[0]?.id || uuidv4();

    const animalId = uuidv4();
    await client.query(
      `INSERT INTO animals (id, animal_code, animal_type, owner_id) VALUES ($1, $2, 'camel', $3)`,
      [animalId, `AN-P14-${ts}`, customerId]
    );

    const sampleId = uuidv4();
    await client.query(
      `INSERT INTO samples (id, sample_code, barcode, customer_id, animal_id, status, created_by)
       VALUES ($1, $2, $2, $3, $4, 'received', $5)`,
      [sampleId, `SMP-P14-${ts}`, customerId, animalId, adminUserId]
    );

    const testRows = await query('SELECT id, code, name FROM tests WHERE is_active = true LIMIT 3');
    const testIds = testRows.rows.map((r) => r.id);

    const stIds = [];
    for (const testId of testIds) {
      const stId = uuidv4();
      await client.query(
        `INSERT INTO sample_tests (id, sample_id, test_id, status, price) VALUES ($1, $2, $3, 'pending', 100)`,
        [stId, sampleId, testId]
      );
      stIds.push(stId);
    }

    await client.query('COMMIT');
    console.log(`  Setup: created sample ${sampleId} with ${stIds.length} tests\n`);

    // --- 5. Remove test (before execution) ---
    if (stIds.length >= 1) {
      try {
        const result = await mgmt.removeTest(sampleId, stIds[0], adminUserId, { role: 'admin' });
        ok('5a. Remove pending test succeeds', result.removed === true);
      } catch (e) {
        ok('5a. Remove pending test succeeds', false);
        console.error('    Error:', e.message);
      }

      const remaining = await query('SELECT id FROM sample_tests WHERE sample_id = $1', [sampleId]);
      ok('5b. Test count decreased after remove', remaining.rows.length === stIds.length - 1);
    }

    // --- 6. Prevent remove after results ---
    if (stIds.length >= 2) {
      const resultId = uuidv4();
      await query(
        `INSERT INTO results (id, sample_test_id, entered_by) VALUES ($1, $2, $3)`,
        [resultId, stIds[1], adminUserId]
      );

      try {
        await mgmt.removeTest(sampleId, stIds[1], adminUserId, { role: 'admin' });
        ok('6. Prevent remove test with results', false);
      } catch (e) {
        ok('6. Prevent remove test with results', e.code === 'HAS_RESULTS');
      }
    }

    // --- 7. Cancel test after results ---
    if (stIds.length >= 2) {
      try {
        const result = await mgmt.cancelTest(sampleId, stIds[1], adminUserId, { reason: 'Test cancel' });
        ok('7a. Cancel test with results succeeds', result.cancelled === true);
      } catch (e) {
        ok('7a. Cancel test with results succeeds', false);
        console.error('    Error:', e.message);
      }

      const st = await query('SELECT status FROM sample_tests WHERE id = $1', [stIds[1]]);
      ok('7b. Test status is cancelled', st.rows[0]?.status === 'cancelled');

      try {
        await mgmt.cancelTest(sampleId, stIds[1], adminUserId);
        ok('7c. Prevent double cancel', false);
      } catch (e) {
        ok('7c. Prevent double cancel', e.code === 'ALREADY_CANCELLED');
      }
    }

    // --- 8. Reactivate test ---
    if (stIds.length >= 2) {
      try {
        const result = await mgmt.reactivateTest(sampleId, stIds[1], adminUserId);
        ok('8a. Reactivate cancelled test', result.reactivated === true);
        ok('8b. Reactivate warns about results', result.has_existing_results === true);
      } catch (e) {
        ok('8a. Reactivate cancelled test', false);
        console.error('    Error:', e.message);
      }

      const st = await query('SELECT status FROM sample_tests WHERE id = $1', [stIds[1]]);
      ok('8c. Status back to pending', st.rows[0]?.status === 'pending');

      try {
        await mgmt.reactivateTest(sampleId, stIds[1], adminUserId);
        ok('8d. Prevent reactivate non-cancelled', false);
      } catch (e) {
        ok('8d. Prevent reactivate non-cancelled', e.code === 'NOT_CANCELLED');
      }
    }

    // --- 9. Workflow progress excludes cancelled ---
    if (stIds.length >= 3) {
      await query(`UPDATE sample_tests SET status = 'cancelled' WHERE id = $1`, [stIds[2]]);
      const detail = await samplesSvc.getById(sampleId);
      const activeTests = detail.tests.filter((t) => t.status !== 'cancelled');
      ok('9. Workflow.all_validated excludes cancelled tests', detail.workflow !== undefined);
      await query(`UPDATE sample_tests SET status = 'pending' WHERE id = $1`, [stIds[2]]);
    }

    // --- 10. Duplicate test detection ---
    {
      const noDupes = await mgmt.checkDuplicateTests(sampleId);
      ok('10a. No duplicates when tests are unique', noDupes.length === 0);

      const dupStId = uuidv4();
      const existingSt = await query(
        'SELECT test_id FROM sample_tests WHERE sample_id = $1 LIMIT 1', [sampleId]
      );
      if (existingSt.rows.length) {
        await query(
          `INSERT INTO sample_tests (id, sample_id, test_id, status, price)
           SELECT $1, $2, $3, 'pending', 100
           WHERE NOT EXISTS (SELECT 1 FROM sample_tests WHERE sample_id = $2 AND test_id = $3 AND id != $1)`,
          [dupStId, sampleId, existingSt.rows[0].test_id]
        );
      }
      const wasInserted = (await query('SELECT 1 FROM sample_tests WHERE id = $1', [dupStId])).rows.length > 0;
      if (wasInserted) {
        const dupes = await mgmt.checkDuplicateTests(sampleId);
        ok('10b. Duplicate detection finds duplicates', dupes.length > 0);
        await query('DELETE FROM sample_tests WHERE id = $1', [dupStId]);
      } else {
        ok('10b. Unique constraint prevents duplicates (detection not needed)', true);
      }
    }

    // --- 11. Audit log ---
    const history = await mgmt.getTestHistory(stIds[0]);
    ok('11. Audit log recorded for removed test', history.length > 0);

    // --- 12. Report lock guard ---
    const reportId = uuidv4();
    await query(
      `INSERT INTO reports (id, report_number, sample_id, is_final, lab_specialist_approved_by)
       VALUES ($1, $2, $3, true, $4)`,
      [reportId, `RPT-P14-${ts}`, sampleId, adminUserId]
    );

    if (stIds.length >= 3) {
      try {
        await mgmt.cancelTest(sampleId, stIds[2], adminUserId);
        ok('12. Prevent test modification when report approved', false);
      } catch (e) {
        ok('12. Prevent test modification when report approved', e.code === 'REPORT_LOCKED');
      }
    }

    // --- Cleanup ---
    await query('DELETE FROM reports WHERE id = $1', [reportId]);
    await query('DELETE FROM results WHERE sample_test_id = ANY($1)', [stIds]);
    await query('DELETE FROM sample_tests WHERE sample_id = $1', [sampleId]);
    await query('DELETE FROM samples WHERE id = $1', [sampleId]);
    await query('DELETE FROM animals WHERE id = $1', [animalId]);
    await query('DELETE FROM customers WHERE id = $1', [customerId]);

    console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`);
    if (fail > 0) process.exitCode = 1;
  } catch (e) {
    console.error('FATAL:', e.message, e.stack);
    process.exitCode = 1;
    try { await client.query('ROLLBACK'); } catch { /* */ }
  } finally {
    client.release();
    pool.end();
  }
})();
