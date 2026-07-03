require('dotenv').config();
const { pool, query } = require('../config/database');
const samplesSvc = require('../services/samples.service');

let pass = 0;
let fail = 0;
function ok(label, cond) {
  if (cond) { pass++; console.log(`  PASS: ${label}`); }
  else { fail++; console.error(`  FAIL: ${label}`); }
}

(async () => {
  try {
    console.log('--- Verify sample detail loading ---');

    // 1. created_at column
    const cols = await query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'sample_tests' AND column_name = 'created_at'`
    );
    ok('sample_tests.created_at column exists', cols.rows.length > 0);

    // 2. Get samples
    const smp = await query(
      `SELECT s.id, s.sample_code, s.status
       FROM samples s
       JOIN sample_tests st ON st.sample_id = s.id
       GROUP BY s.id ORDER BY s.created_at DESC LIMIT 5`
    );
    ok('Found samples with tests', smp.rows.length > 0);

    // 3. getById for each sample
    for (const s of smp.rows) {
      const d = await samplesSvc.getById(s.id);
      ok(`getById(${s.sample_code}) — tests=${d.tests.length} workflow=${!!d.workflow}`,
        d.tests.length > 0 && d.workflow);
    }

    // 4. Parasitology queue
    const pq = await samplesSvc.getParasitologyQueue();
    ok('Parasitology queue loads', Array.isArray(pq));

    // 5. Check for parasitology-type tests
    const paraTests = await query(
      `SELECT st.sample_id, t.code
       FROM sample_tests st
       JOIN tests t ON st.test_id = t.id
       JOIN test_categories tc ON t.category_id = tc.id
       WHERE tc.code = 'MICRO'
       LIMIT 3`
    );
    if (paraTests.rows.length > 0) {
      for (const pt of paraTests.rows) {
        const d = await samplesSvc.getById(pt.sample_id);
        ok(`Parasitology sample (${pt.sample_id.slice(0,8)}) detail loads`, d.tests.length > 0);
      }
    } else {
      console.log('  SKIP: No parasitology samples in DB');
    }

    // 6. Check for CBC-type tests
    const cbcTests = await query(
      `SELECT st.sample_id, t.code
       FROM sample_tests st
       JOIN tests t ON st.test_id = t.id
       WHERE t.code LIKE '%CBC%' OR t.code LIKE '%HEMA%'
       LIMIT 2`
    );
    if (cbcTests.rows.length > 0) {
      for (const ct of cbcTests.rows) {
        const d = await samplesSvc.getById(ct.sample_id);
        ok(`CBC sample (${ct.sample_id.slice(0,8)}) detail loads`, d.tests.length > 0);
      }
    } else {
      console.log('  SKIP: No CBC samples in DB');
    }

    // 7. Workflow summary
    if (smp.rows.length > 0) {
      const wf = await samplesSvc.getWorkflowSummary(smp.rows[0].id);
      ok('Workflow summary loads', wf && wf.currentState);
    }

    // 8. Reports service (uses st.created_at too)
    try {
      const reportsSvc = require('../services/reports.service');
      const reportData = await reportsSvc.generate(smp.rows[0].id, '00000000-0000-0000-0000-000000000000');
      ok('Report generate succeeds', true);
    } catch (e) {
      ok('Report generate (expected error: ' + (e.code || e.message) + ')',
        ['ALREADY_EXISTS', 'NO_RESULTS', 'INVALID_SAMPLE'].includes(e.code));
    }

    console.log(`\n--- Results: ${pass} passed, ${fail} failed ---`);
    if (fail > 0) process.exitCode = 1;
  } catch (e) {
    console.error('FATAL:', e.message, e.stack);
    process.exitCode = 1;
  } finally {
    pool.end();
  }
})();
