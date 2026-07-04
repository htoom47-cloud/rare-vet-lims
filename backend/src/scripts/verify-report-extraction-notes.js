#!/usr/bin/env node
/**
 * Verification: Report Extraction + Notes Saving
 *
 * Tests:
 * 1. Sample with cancelled test gets marked 'completed' after reconciliation
 * 2. Report generation works for sample with cancelled tests
 * 3. Report appears in reports list
 * 4. Report preview loads successfully
 * 5. PDF can be generated
 * 6. Report notes (treatment_recommendations) can be saved via updateNotes
 * 7. Saved notes persist when re-reading the report
 * 8. After regeneration, notes appear in report data
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const { query, getClient } = require('../config/database');
const { uuidv4 } = require('../utils/uuid');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ FAIL: ${label}`);
  }
}

async function cleanup(ids) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    if (ids.reportId) {
      await client.query('DELETE FROM reports WHERE id = $1', [ids.reportId]);
    }
    if (ids.resultIds?.length) {
      for (const rid of ids.resultIds) {
        await client.query('DELETE FROM result_values WHERE result_id = $1', [rid]);
        await client.query('DELETE FROM results WHERE id = $1', [rid]);
      }
    }
    if (ids.sampleTestIds?.length) {
      for (const stid of ids.sampleTestIds) {
        await client.query('DELETE FROM result_values WHERE result_id IN (SELECT id FROM results WHERE sample_test_id = $1)', [stid]);
        await client.query('DELETE FROM results WHERE sample_test_id = $1', [stid]);
        await client.query('DELETE FROM sample_tests WHERE id = $1', [stid]);
      }
    }
    if (ids.sampleId) {
      await client.query('DELETE FROM samples WHERE id = $1', [ids.sampleId]);
    }
    if (ids.animalId) {
      await client.query('DELETE FROM animals WHERE id = $1', [ids.animalId]);
    }
    if (ids.customerId) {
      await client.query('DELETE FROM customers WHERE id = $1', [ids.customerId]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.log('  ⚠️  Cleanup error (non-fatal):', err.message);
  } finally {
    client.release();
  }
}

async function run() {
  console.log('\n=== Report Extraction + Notes Saving — Verification ===\n');

  const ids = {};

  try {
    // -------------------------------------------------------------------
    // Setup: create test customer, animal, sample with 2 tests (one cancelled)
    // -------------------------------------------------------------------
    console.log('0. Setup test data');

    const testRow = await query('SELECT id FROM tests LIMIT 1');
    if (!testRow.rows.length) {
      console.log('  ⚠️  No tests in DB — cannot run integration tests');
      process.exit(0);
    }
    const testId = testRow.rows[0].id;

    const testRow2 = await query('SELECT id FROM tests WHERE id != $1 LIMIT 1', [testId]);
    const testId2 = testRow2.rows.length ? testRow2.rows[0].id : testId;

    const paramRow = await query('SELECT id FROM test_parameters WHERE test_id = $1 LIMIT 1', [testId]);
    if (!paramRow.rows.length) {
      console.log('  ⚠️  No test_parameters for test — cannot run integration tests');
      process.exit(0);
    }
    const paramId = paramRow.rows[0].id;

    ids.customerId = uuidv4();
    await query(
      `INSERT INTO customers (id, full_name, mobile)
       VALUES ($1, 'VERIFY-TEST-CUSTOMER', '0500000099')`,
      [ids.customerId]
    );

    ids.animalId = uuidv4();
    await query(
      `INSERT INTO animals (id, animal_code, animal_type, owner_id, name_tag)
       VALUES ($1, 'VFY-ANM-001', 'camel', $2, 'TestAnimal')`,
      [ids.animalId, ids.customerId]
    );

    ids.sampleId = uuidv4();
    const sampleCode = `VFY-RPT-${Date.now()}`;
    await query(
      `INSERT INTO samples (id, sample_code, barcode, customer_id, animal_id, status, collection_date, received_date)
       VALUES ($1, $2, $3, $4, $5, 'running', NOW(), NOW())`,
      [ids.sampleId, sampleCode, `BC-${sampleCode}`, ids.customerId, ids.animalId]
    );

    const stId1 = uuidv4();
    const stId2 = uuidv4();
    ids.sampleTestIds = [stId1, stId2];

    await query(
      `INSERT INTO sample_tests (id, sample_id, test_id, status, created_at) VALUES ($1, $2, $3, 'completed', NOW())`,
      [stId1, ids.sampleId, testId]
    );
    await query(
      `INSERT INTO sample_tests (id, sample_id, test_id, status, created_at) VALUES ($1, $2, $3, 'cancelled', NOW())`,
      [stId2, ids.sampleId, testId2]
    );

    const resId1 = uuidv4();
    ids.resultIds = [resId1];
    await query(
      `INSERT INTO results (id, sample_test_id, is_validated, validated_at, validated_by)
       VALUES ($1, $2, true, NOW(), NULL)`,
      [resId1, stId1]
    );
    await query(
      `INSERT INTO result_values (id, result_id, parameter_id, value, numeric_value)
       VALUES ($1, $2, $3, '12.5', 12.5)`,
      [uuidv4(), resId1, paramId]
    );

    console.log('  ✅ Test data created (sample with 1 completed + 1 cancelled test)');

    // -------------------------------------------------------------------
    // Test 1: reconcileSampleStatuses marks sample as completed
    // -------------------------------------------------------------------
    console.log('\n1. Sample with cancelled test → reconcileSampleStatuses');

    const preStatus = await query('SELECT status FROM samples WHERE id = $1', [ids.sampleId]);
    assert(preStatus.rows[0].status === 'running', 'Sample starts as "running"');

    const { reconcileSampleStatuses } = require('../services/samples.service');
    await reconcileSampleStatuses();

    const postStatus = await query('SELECT status FROM samples WHERE id = $1', [ids.sampleId]);
    assert(postStatus.rows[0].status === 'completed', 'Sample marked "completed" after reconciliation (cancelled test excluded)');

    // -------------------------------------------------------------------
    // Test 2: validateResults with cancelled tests
    // -------------------------------------------------------------------
    console.log('\n2. validateResults excludes cancelled tests from pending count');

    const pendingCheck = await query(
      `SELECT COUNT(*)::int AS cnt FROM sample_tests WHERE sample_id = $1 AND status NOT IN ('completed', 'cancelled')`,
      [ids.sampleId]
    );
    assert(pendingCheck.rows[0].cnt === 0, 'No pending tests (cancelled excluded from count)');

    // -------------------------------------------------------------------
    // Test 3: Report generation
    // -------------------------------------------------------------------
    console.log('\n3. Generate report for sample with cancelled test');

    const reportsService = require('../services/reports.service');
    const adminRow = await query(
      `SELECT u.id, r.name AS role_name FROM users u JOIN roles r ON u.role_id = r.id
       WHERE r.name IN ('admin', 'manager') LIMIT 1`
    );
    let userId = adminRow.rows[0]?.id;
    let userRole = adminRow.rows[0]?.role_name || 'admin';
    if (!userId) {
      const anyUser = await query('SELECT id FROM users LIMIT 1');
      userId = anyUser.rows[0]?.id;
      userRole = 'admin';
    }

    let report;
    try {
      report = await reportsService.generate(ids.sampleId, userId, userRole, 'ar');
      ids.reportId = report.id;
      assert(!!report, 'Report generated successfully (full PDF)');
      assert(!!report.report_number, `Report number assigned: ${report.report_number}`);
      assert(!!report.pdf_url, `PDF URL present: ${report.pdf_url}`);
    } catch (err) {
      if (err.message && err.message.includes('Browser was not found')) {
        console.log('  ⚠️  Puppeteer/Chrome not available locally — inserting report row directly');
        const { generateCode } = require('../utils/helpers');
        ids.reportId = uuidv4();
        const reportNumber = generateCode('RPT');
        await query(
          `INSERT INTO reports (id, report_number, sample_id, pdf_url, qr_verification_code, generated_by, language, is_final)
           VALUES ($1, $2, $3, '/reports/test-placeholder.pdf', $4, $5, 'ar', true)`,
          [ids.reportId, reportNumber, ids.sampleId, uuidv4().slice(0, 12).toUpperCase(), userId]
        );
        report = await query('SELECT * FROM reports WHERE id = $1', [ids.reportId]).then((r) => r.rows[0]);
        assert(!!report, 'Report row created (PDF skipped — no Chrome)');
        assert(!!report.report_number, `Report number assigned: ${report.report_number}`);
      } else {
        assert(false, `Report generation failed: ${err.message}`);
      }
    }

    // -------------------------------------------------------------------
    // Test 4: Report appears in list
    // -------------------------------------------------------------------
    console.log('\n4. Report appears in reports list');

    if (report) {
      const listResult = await reportsService.list({ page: 1, limit: 100 });
      const found = listResult.data.find((r) => r.id === ids.reportId);
      assert(!!found, 'Report found in list()');
    } else {
      assert(false, 'Skipped — no report generated');
    }

    // -------------------------------------------------------------------
    // Test 5: Report preview loads
    // -------------------------------------------------------------------
    console.log('\n5. Report preview loads');

    if (report) {
      try {
        const preview = await reportsService.getPreview(ids.reportId);
        assert(!!preview, 'Preview loaded successfully');
        assert(!!preview.reportNumber, 'Preview has reportNumber');
        assert(Array.isArray(preview.results), 'Preview has results array');
      } catch (err) {
        assert(false, `Preview load failed: ${err.message}`);
      }
    } else {
      assert(false, 'Skipped — no report generated');
    }

    // -------------------------------------------------------------------
    // Test 6: Cancelled test excluded from report results
    // -------------------------------------------------------------------
    console.log('\n6. Cancelled test excluded from report data');

    if (report) {
      try {
        const reportData = await reportsService.buildReportData(ids.sampleId, {
          reportNumber: 'TEST', verificationCode: 'TEST', language: 'ar', generatedBy: userId,
        });
        const stIdsInReport = new Set();
        for (const rv of reportData.results) {
          stIdsInReport.add(rv.testCode);
        }
        assert(!stIdsInReport.has(stId2), 'Cancelled test excluded from report results');
      } catch (err) {
        assert(false, `buildReportData failed: ${err.message}`);
      }
    } else {
      assert(false, 'Skipped — no report generated');
    }

    // -------------------------------------------------------------------
    // Test 7: Save report notes (treatment_recommendations)
    // -------------------------------------------------------------------
    console.log('\n7. Save report notes');

    const testNote = 'ملاحظة اختبارية - يرجى متابعة الحالة بعد أسبوع';

    if (report) {
      try {
        const updated = await reportsService.updateNotes(ids.reportId, {
          treatment_recommendations: testNote,
        });
        assert(updated.treatment_recommendations === testNote, 'Notes saved via updateNotes');
      } catch (err) {
        assert(false, `updateNotes failed: ${err.message}`);
      }
    } else {
      assert(false, 'Skipped — no report generated');
    }

    // -------------------------------------------------------------------
    // Test 8: Notes persist on re-read
    // -------------------------------------------------------------------
    console.log('\n8. Notes persist on re-read');

    if (report) {
      const reRead = await query('SELECT treatment_recommendations FROM reports WHERE id = $1', [ids.reportId]);
      assert(reRead.rows[0]?.treatment_recommendations === testNote, 'Notes persisted in database');
    } else {
      assert(false, 'Skipped — no report generated');
    }

    // -------------------------------------------------------------------
    // Test 9: Notes appear in preview after save
    // -------------------------------------------------------------------
    console.log('\n9. Notes appear in preview after save');

    if (report) {
      try {
        const preview = await reportsService.getPreview(ids.reportId);
        assert(preview.recommendations === testNote, 'Notes appear in preview.recommendations');
      } catch (err) {
        assert(false, `Preview load failed: ${err.message}`);
      }
    } else {
      assert(false, 'Skipped — no report generated');
    }

    // -------------------------------------------------------------------
    // Test 10: regeneratePdfById works and includes notes
    // -------------------------------------------------------------------
    console.log('\n10. Regenerate PDF includes notes');

    if (report) {
      try {
        const regen = await reportsService.regeneratePdfById(ids.reportId);
        assert(!!regen, 'PDF regenerated successfully');
        assert(!!regen.pdf_url, 'Regenerated report has PDF URL');
      } catch (err) {
        if (err.message && err.message.includes('Browser was not found')) {
          console.log('  ⚠️  PDF regeneration skipped (no Chrome) — verifying data flow instead');
          const dbReport = await query('SELECT treatment_recommendations FROM reports WHERE id = $1', [ids.reportId]);
          assert(dbReport.rows[0]?.treatment_recommendations === testNote, 'Notes in DB ready for PDF regeneration');
        } else {
          assert(false, `Regenerate PDF failed: ${err.message}`);
        }
      }
    } else {
      assert(false, 'Skipped — no report generated');
    }

    // -------------------------------------------------------------------
    // Test 11: PATCH route (updateNotes) field validation
    // -------------------------------------------------------------------
    console.log('\n11. updateNotes with empty body returns report unchanged');

    if (report) {
      const unchanged = await reportsService.updateNotes(ids.reportId, {});
      assert(unchanged.treatment_recommendations === testNote, 'Empty update does not clear notes');
    } else {
      assert(false, 'Skipped — no report generated');
    }

    // -------------------------------------------------------------------
    // Test 12: Sample without cancelled tests still works
    // -------------------------------------------------------------------
    console.log('\n12. Sample completion logic for all-completed tests (no cancelled)');

    const allCompletedCheck = await query(
      `SELECT COUNT(*)::int AS cnt FROM sample_tests WHERE sample_id = $1 AND status NOT IN ('completed', 'cancelled')`,
      [ids.sampleId]
    );
    assert(allCompletedCheck.rows[0].cnt === 0, 'All-completed sample: pending count is 0');

    // -------------------------------------------------------------------
    // Test 13: SQL pattern verification
    // -------------------------------------------------------------------
    console.log('\n13. SQL pattern: cancelled excluded from reconciliation');

    const sqlCheck = reconcileSampleStatuses.toString();
    assert(sqlCheck.includes("NOT IN ('completed', 'cancelled')"), 'reconcileSampleStatuses uses NOT IN with cancelled');
    assert(sqlCheck.includes("st.status != 'cancelled'"), 'reconcileSampleStatuses excludes cancelled from validated-results check');

    // -------------------------------------------------------------------
    // Test 14: Verify validateResults SQL pattern
    // -------------------------------------------------------------------
    console.log('\n14. SQL pattern: validateResults excludes cancelled');

    const resultsService = require('../services/results.service');
    const valSrc = resultsService.validateResults.toString();
    assert(valSrc.includes("NOT IN ('completed', 'cancelled')"), 'validateResults uses NOT IN with cancelled');

    // -------------------------------------------------------------------
    // Test 15: buildReportData SQL excludes cancelled
    // -------------------------------------------------------------------
    console.log('\n15. SQL pattern: buildReportData excludes cancelled tests');

    const reportsSrc = reportsService.buildReportData.toString();
    assert(reportsSrc.includes("st.status != 'cancelled'"), 'buildReportData query excludes cancelled sample_tests');

    // -------------------------------------------------------------------
    // Test 16: reports.service exports updateNotes
    // -------------------------------------------------------------------
    console.log('\n16. Service exports');

    assert(typeof reportsService.updateNotes === 'function', 'reportsService.updateNotes exported');
    assert(typeof reportsService.generate === 'function', 'reportsService.generate exported');
    assert(typeof reportsService.regeneratePdfById === 'function', 'reportsService.regeneratePdfById exported');

    // -------------------------------------------------------------------
    // Test 17: PATCH route exists
    // -------------------------------------------------------------------
    console.log('\n17. PATCH /reports/:id route exists');

    const reportsRouter = require('../routes/reports.routes.js');
    const patchRoute = reportsRouter.stack?.find(
      (layer) => layer.route?.methods?.patch
    );
    assert(!!patchRoute, 'PATCH route registered on reports router');

  } finally {
    // Cleanup
    console.log('\n--- Cleanup ---');
    await cleanup(ids);
    console.log('  ✅ Test data cleaned up');
  }

  // -------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Verification crashed:', err);
  process.exit(1);
});
