/**
 * Prove historical report reference ranges stay frozen after Norma range changes.
 *
 * Scenario:
 *  1. Import CBC (Norma notes frozen in result_values)
 *  2. Build report #1 data
 *  3. Change device_reference_ranges (simulate Norma profile update)
 *  4. Re-build report on same sample → unchanged refs
 *  5. Import new CBC on second sample with new Norma refs
 *  6. Build report #2 → uses new refs
 *
 * Usage: node src/scripts/verify-report-historical-refs.js
 */
require('dotenv').config();
const assert = require('assert');
const { query, pool } = require('../config/database');
const { uuidv4 } = require('../utils/uuid');
const { buildReportData } = require('../services/reports.service');
const { importCbcResults } = require('../services/device-import.service');
const deviceRefRanges = require('../services/device-reference-ranges.service');

const OLD_WBC = { min: 5.5, max: 12.5 };
const NEW_WBC = { min: 6.0, max: 15.0 };
const CHANGED_DEVICE_WBC = { min: 99, max: 999 };

const cleanupIds = { samples: [], customers: [] };
let savedHorseWbcRange = null;

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${label}: ${err.message}`);
  }
}

const wbcFromReport = (reportData) => {
  const row = reportData.results.find((r) => r.code === 'WBC');
  assert.ok(row, 'WBC row missing in report');
  return { min: row.minValue, max: row.maxValue, reference: row.reference };
};

const makeCbcResults = (wbcRef) => ([
  {
    code: 'WBC',
    limsCode: 'WBC',
    parameterName: 'WBC',
    value: '8.2',
    unit: '10^3/uL',
    reference: `${wbcRef.min}-${wbcRef.max}`,
    referenceMin: wbcRef.min,
    referenceMax: wbcRef.max,
    flag: 'NORMAL',
  },
  {
    code: 'HGB',
    limsCode: 'HGB',
    parameterName: 'HGB',
    value: '115',
    unit: 'g/L',
    reference: '100-160',
    referenceMin: 100,
    referenceMax: 160,
    flag: 'NORMAL',
  },
]);

async function seedSample({ suffix, animalType, barcode }) {
  const ts = Date.now();
  const customerId = uuidv4();
  const animalId = uuidv4();
  const sampleId = uuidv4();
  const sampleTestId = uuidv4();

  await query(
    `INSERT INTO customers (id, full_name, full_name_ar, mobile)
     VALUES ($1, $2, $3, $4)`,
    [customerId, `Ref Audit ${suffix}`, `تدقيق ${suffix}`, `0599${String(ts).slice(-6)}`]
  );

  await query(
    `INSERT INTO animals (id, owner_id, animal_code, animal_type, name_tag, gender)
     VALUES ($1, $2, $3, $4, $5, 'male')`,
    [animalId, customerId, `AUD-${suffix}`, animalType, `Audit ${suffix}`]
  );

  await query(
    `INSERT INTO samples (id, sample_code, barcode, customer_id, animal_id, status, priority)
     VALUES ($1, $2, $3, $4, $5, 'completed', 'normal')`,
    [sampleId, `SMP-AUDIT-${suffix}`, barcode, customerId, animalId]
  );

  const testRow = await query(`SELECT id FROM tests WHERE code = 'CBC-FULL' LIMIT 1`);
  assert.ok(testRow.rows[0], 'CBC-FULL test must exist — run seed/migrate first');
  const testId = testRow.rows[0].id;

  await query(
    `INSERT INTO sample_tests (id, sample_id, test_id, status, completed_at)
     VALUES ($1, $2, $3, 'completed', NOW())`,
    [sampleTestId, sampleId, testId]
  );

  cleanupIds.customers.push(customerId);
  cleanupIds.samples.push(sampleId);

  return { sampleId, sampleTestId, animalType, barcode };
}

async function cleanup() {
  for (const sampleId of cleanupIds.samples) {
    await query(
      `DELETE FROM result_values rv
       USING results r, sample_tests st
       WHERE rv.result_id = r.id AND r.sample_test_id = st.id AND st.sample_id = $1`,
      [sampleId]
    );
    await query(
      `DELETE FROM results r
       USING sample_tests st
       WHERE r.sample_test_id = st.id AND st.sample_id = $1`,
      [sampleId]
    );
    await query('DELETE FROM sample_tests WHERE sample_id = $1', [sampleId]);
    await query('DELETE FROM reports WHERE sample_id = $1', [sampleId]);
    await query('DELETE FROM samples WHERE id = $1', [sampleId]);
  }
  for (const customerId of cleanupIds.customers) {
    await query('DELETE FROM animals WHERE owner_id = $1', [customerId]);
    await query('DELETE FROM customers WHERE id = $1', [customerId]);
  }

  if (savedHorseWbcRange) {
    await deviceRefRanges.upsertDeviceReferenceRange({
      deviceName: 'Norma CBC',
      parameterCode: 'WBC',
      parameterName: 'WBC',
      species: 'horse',
      unit: '10^3/uL',
      lowValue: savedHorseWbcRange.low_value,
      highValue: savedHorseWbcRange.high_value,
      source: savedHorseWbcRange.source || 'device',
    });
  }
}

async function main() {
  console.log('\n=== Historical report reference range freeze ===\n');

  const admin = await query(
    `SELECT u.id FROM users u
     JOIN roles r ON u.role_id = r.id
     WHERE r.name = 'admin' AND u.is_active = true
     LIMIT 1`
  );
  assert.ok(admin.rows[0], 'admin user required');
  const userId = admin.rows[0].id;

  const existingRange = await query(
    `SELECT low_value, high_value, source FROM device_reference_ranges
     WHERE device_name ILIKE '%norma%' AND parameter_code = 'WBC' AND species = 'horse'
       AND COALESCE(unit, '') = '10^3/uL'
     LIMIT 1`
  ).catch(() => ({ rows: [] }));
  savedHorseWbcRange = existingRange.rows[0] || null;

  try {
    const suffix1 = `OLD-${Date.now()}`;
    const sample1 = await seedSample({
      suffix: suffix1,
      animalType: 'horse',
      barcode: `BC-AUDIT-OLD-${Date.now()}`,
    });

    await importCbcResults({
      sampleId: sample1.sampleId,
      animalType: 'horse',
      limsAnimalType: 'horse',
      normaAnimalType: 'horse',
      results: makeCbcResults(OLD_WBC),
      testCode: 'CBC-FULL',
      deviceName: 'Norma CBC',
    });

    await query(
      `UPDATE results SET is_validated = true, validated_by = $1, validated_at = NOW()
       WHERE sample_test_id = $2`,
      [userId, sample1.sampleTestId]
    );

    const report1 = await buildReportData(sample1.sampleId, {
      reportNumber: 'RPT-AUDIT-OLD',
      verificationCode: 'AUDITOLD001',
      language: 'ar',
      generatedBy: userId,
      treatmentRecommendations: '',
      labApproval: { approved: false },
      vetApproval: { approved: false },
    });

    const snap1 = wbcFromReport(report1);
    const report1Json = JSON.stringify(snap1);

    check('Report #1 uses imported Norma WBC range', () => {
      assert.strictEqual(snap1.min, OLD_WBC.min);
      assert.strictEqual(snap1.max, OLD_WBC.max);
    });

    await deviceRefRanges.upsertDeviceReferenceRange({
      deviceName: 'Norma CBC',
      parameterCode: 'WBC',
      parameterName: 'WBC',
      species: 'horse',
      unit: '10^3/uL',
      lowValue: CHANGED_DEVICE_WBC.min,
      highValue: CHANGED_DEVICE_WBC.max,
      source: 'device',
    });

    const report1AfterNormaChange = await buildReportData(sample1.sampleId, {
      reportNumber: 'RPT-AUDIT-OLD-REBUILD',
      verificationCode: 'AUDITOLD002',
      language: 'ar',
      generatedBy: userId,
      treatmentRecommendations: '',
      labApproval: { approved: false },
      vetApproval: { approved: false },
    });

    const snap1b = wbcFromReport(report1AfterNormaChange);

    check('Same sample after Norma range change — report data unchanged', () => {
      assert.strictEqual(JSON.stringify(snap1b), report1Json);
      assert.strictEqual(snap1b.min, OLD_WBC.min);
      assert.strictEqual(snap1b.max, OLD_WBC.max);
      assert.notStrictEqual(snap1b.min, CHANGED_DEVICE_WBC.min);
    });

    const suffix2 = `NEW-${Date.now()}`;
    const sample2 = await seedSample({
      suffix: suffix2,
      animalType: 'horse',
      barcode: `BC-AUDIT-NEW-${Date.now()}`,
    });

    await importCbcResults({
      sampleId: sample2.sampleId,
      animalType: 'horse',
      limsAnimalType: 'horse',
      normaAnimalType: 'horse',
      results: makeCbcResults(NEW_WBC),
      testCode: 'CBC-FULL',
      deviceName: 'Norma CBC',
    });

    await query(
      `UPDATE results SET is_validated = true, validated_by = $1, validated_at = NOW()
       WHERE sample_test_id = $2`,
      [userId, sample2.sampleTestId]
    );

    const report2 = await buildReportData(sample2.sampleId, {
      reportNumber: 'RPT-AUDIT-NEW',
      verificationCode: 'AUDITNEW001',
      language: 'ar',
      generatedBy: userId,
      treatmentRecommendations: '',
      labApproval: { approved: false },
      vetApproval: { approved: false },
    });

    const snap2 = wbcFromReport(report2);

    check('Report #2 uses new Norma WBC range from fresh import', () => {
      assert.strictEqual(snap2.min, NEW_WBC.min);
      assert.strictEqual(snap2.max, NEW_WBC.max);
      assert.notStrictEqual(snap2.min, snap1.min);
    });

    check('Old report snapshot still differs from new report', () => {
      assert.notStrictEqual(JSON.stringify(snap2), report1Json);
    });

    console.log('\n  Summary:');
    console.log(`    Report #1 WBC ref: ${snap1.min} - ${snap1.max} (frozen)`);
    console.log(`    After device DB → ${CHANGED_DEVICE_WBC.min}-${CHANGED_DEVICE_WBC.max}: still ${snap1b.min} - ${snap1b.max}`);
    console.log(`    Report #2 WBC ref: ${snap2.min} - ${snap2.max} (new import)`);
  } finally {
    await cleanup();
    await pool.end();
  }

  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  try { await cleanup(); } catch { /* ignore */ }
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
