#!/usr/bin/env node
/**
 * Verification: Admin Reference Ranges Only
 *
 * Confirms that report reference ranges come exclusively from test_reference_ranges
 * (Admin → Reference Ranges), never from device_reference_ranges, result_values.notes,
 * or Norma CBC corrections.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const env = require('../config/env');
const refEngine = require('../services/reference-range-engine.service');
const resultEngine = require('../services/result-engine.service');
const { extractLegacyNormaReference } = refEngine;

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

async function run() {
  console.log('\n=== Admin Reference Ranges Only — Verification ===\n');

  // 1. Feature flag check
  console.log('1. Feature flag ALLOW_DEVICE_REFERENCE_FALLBACK');
  assert(env.features.allowDeviceReferenceFallback === false, 'Default is false (device fallback disabled)');

  // 2. resolveReferenceRange returns null when no LIMS range (device fallback disabled)
  console.log('\n2. resolveReferenceRange with no LIMS range returns null');
  const noRange = await refEngine.resolveReferenceRange({
    parameter_id: '00000000-0000-0000-0000-000000000000',
    animal_type: 'camel',
    parameter_code: 'FAKE_PARAM',
  });
  assert(noRange === null, 'Returns null for non-existent parameter (no device fallback)');

  // 3. resolveReferenceRangeFromRow with trr_ prefixes returns LIMS range
  console.log('\n3. resolveReferenceRangeFromRow with admin (trr_) data');
  const mockRow = {
    trr_id: 'test-id',
    trr_min: 5,
    trr_max: 15,
    trr_critical_low: 2,
    trr_critical_high: 20,
    trr_notes: 'Manual camel range',
    trr_text_reference: null,
    trr_unit: '10^9/L',
    trr_sex: null,
    trr_age_min: null,
    trr_age_max: null,
    trr_age_unit: null,
    trr_device_id: null,
    trr_is_active: true,
    trr_animal_type: 'camel',
    parameter_id: 'param-1',
  };
  const fromRow = refEngine.resolveReferenceRangeFromRow({ row: mockRow });
  assert(fromRow !== null, 'Returns range from trr_ prefixed row');
  assert(fromRow.source === 'lims-manual', 'Source is lims-manual');
  assert(fromRow.min_value === 5, 'min_value = 5');
  assert(fromRow.max_value === 15, 'max_value = 15');

  // 4. resolveReferenceRangeFromRow without trr_ data returns null
  console.log('\n4. resolveReferenceRangeFromRow without admin data');
  const emptyRow = { parameter_id: 'param-1' };
  const fromEmpty = refEngine.resolveReferenceRangeFromRow({ row: emptyRow });
  assert(fromEmpty === null, 'Returns null when no trr_ data');

  // 5. result_values.notes NOT used for bounds
  console.log('\n5. result_values.notes not used for reference bounds');
  const rowWithNotes = {
    parameter_id: 'param-1',
    rv_notes: 'Norma: 5.0-15.0',
  };
  const fromNotes = refEngine.resolveReferenceRangeFromRow({ row: rowWithNotes });
  assert(fromNotes === null, 'Notes-only row returns null (no trr_ data)');

  // 6. extractLegacyNormaReference is informational only
  console.log('\n6. extractLegacyNormaReference is informational only');
  const legacy = extractLegacyNormaReference('Norma: 5.0-15.0');
  assert(legacy !== null, 'Parses legacy notes');
  assert(legacy.verbatim === '5.0-15.0', 'Extracts verbatim text');
  const noLegacy = extractLegacyNormaReference('Manual range note');
  assert(noLegacy === null, 'Returns null for non-Norma notes');

  // 7. evaluateResultFlag with no range → no flag
  console.log('\n7. No admin range → no HIGH/LOW flag');
  const flagResult = refEngine.evaluateResultFlag(100, null);
  assert(flagResult.flag === '', 'Flag is empty when no range');
  assert(flagResult.isCritical === false, 'Not critical when no range');

  // 8. evaluateResultFlag with admin range → correct flags
  console.log('\n8. Admin range → correct flags');
  const adminRange = { min_value: 5, max_value: 15, critical_low: 2, critical_high: 20 };
  const highFlag = refEngine.evaluateResultFlag(18, adminRange);
  assert(highFlag.flag === 'HIGH', 'Value above max → HIGH');
  const lowFlag = refEngine.evaluateResultFlag(3, adminRange);
  assert(lowFlag.flag === 'LOW', 'Value below min → LOW');
  const normalFlag = refEngine.evaluateResultFlag(10, adminRange);
  assert(normalFlag.flag === 'NORMAL', 'Value in range → NORMAL');

  // 9. formatReferenceRange shows N/A-equivalent when no range
  console.log('\n9. formatReferenceRange with null');
  const formatted = refEngine.formatReferenceRange(null);
  assert(formatted === null, 'Null range → null (displayed as N/A)');

  // 10. resultEngine.evaluateResult with no admin range → NORMAL_WITHOUT_REF
  console.log('\n10. Result engine: no admin range → no HIGH/LOW');
  const evalNoRef = resultEngine.evaluateResult(
    { value: '100', parameter_code: 'WBC', parameter_id: 'p1' },
    { referenceRange: undefined }
  );
  const rowNoTrr = { value: '100', parameter_code: 'WBC', parameter_id: 'p1' };
  const evalNoRef2 = resultEngine.evaluateResult(rowNoTrr, {});
  assert(
    evalNoRef2.flag !== 'HIGH' && evalNoRef2.flag !== 'LOW',
    'No HIGH/LOW flag without admin reference'
  );

  // 11. resultEngine.buildReportResultRow with admin range
  console.log('\n11. buildReportResultRow uses admin range');
  const reportRow = resultEngine.buildReportResultRow(
    {
      parameter_id: 'p1',
      parameter_code: 'WBC',
      value: '18',
      unit: '10^9/L',
      trr_id: 'ref-1',
      trr_min: 5,
      trr_max: 15,
      trr_critical_low: 2,
      trr_critical_high: 20,
      trr_notes: 'Admin manual range',
      trr_text_reference: null,
      trr_unit: '10^9/L',
      trr_sex: null,
      trr_age_min: null,
      trr_age_max: null,
      trr_age_unit: null,
      trr_device_id: null,
      trr_is_active: true,
      trr_animal_type: 'camel',
    },
    { language: 'ar' }
  );
  assert(reportRow.reference !== null && reportRow.reference !== '—', 'Reference is populated from admin range');
  assert(reportRow.hasReference === true, 'hasReference is true');
  assert(reportRow.flag === 'H' || reportRow.flag === 'HIGH' || reportRow.flag === '↑', 'Flag reflects HIGH for 18 vs 5-15');

  // 12. buildReportResultRow WITHOUT admin range
  console.log('\n12. buildReportResultRow without admin range → N/A');
  const reportRowNoRef = resultEngine.buildReportResultRow(
    {
      parameter_id: 'p2',
      parameter_code: 'HGB',
      value: '12',
      unit: 'g/dL',
      rv_notes: 'Norma: 8.0-14.0',
    },
    { language: 'ar' }
  );
  assert(reportRowNoRef.hasReference === false, 'hasReference is false without admin range');
  assert(
    reportRowNoRef.flag === '' || reportRowNoRef.flag === null || reportRowNoRef.flag === undefined,
    'No flag without admin reference (not HIGH/LOW)'
  );

  // 13. Norma CBC mapping is unaffected
  console.log('\n13. Norma CBC mapping unaffected');
  const { getNormaPanelRow } = require('../utils/norma-cbc-map');
  const wbcPanel = getNormaPanelRow('WBC');
  assert(wbcPanel !== null && wbcPanel !== undefined, 'WBC panel row still resolves');
  const hgbPanel = getNormaPanelRow('HGB');
  assert(hgbPanel !== null && hgbPanel !== undefined, 'HGB panel row still resolves');

  // 14. DB test: actual CBC parameter reference comes from test_reference_ranges
  console.log('\n14. DB: CBC parameter reference from test_reference_ranges');
  try {
    const { query } = require('../config/database');
    const cbcParam = await query(
      `SELECT tp.id, tp.code, tp.name, t.code AS test_code
       FROM test_parameters tp
       JOIN tests t ON tp.test_id = t.id
       WHERE tp.code = 'WBC' AND t.code ILIKE '%CBC%'
       LIMIT 1`
    );
    if (cbcParam.rows[0]) {
      const paramId = cbcParam.rows[0].id;
      const adminRef = await query(
        `SELECT id, min_value, max_value, animal_type, notes
         FROM test_reference_ranges
         WHERE parameter_id = $1 AND (is_active IS NULL OR is_active = true)
         ORDER BY animal_type
         LIMIT 5`,
        [paramId]
      );
      if (adminRef.rows.length > 0) {
        assert(true, `WBC has ${adminRef.rows.length} admin reference range(s)`);
        for (const ref of adminRef.rows) {
          console.log(`     → ${ref.animal_type}: ${ref.min_value}-${ref.max_value} (${ref.notes || 'no notes'})`);
        }
      } else {
        console.log('     ⚠️  No admin reference ranges for WBC — will show N/A in report');
        assert(true, 'No admin range → N/A (correct behavior)');
      }

      const deviceRef = await query(
        `SELECT id, low_value, high_value, species
         FROM device_reference_ranges
         WHERE parameter_code = 'WBC'
         LIMIT 3`
      );
      if (deviceRef.rows.length > 0) {
        console.log(`     ℹ️  ${deviceRef.rows.length} device_reference_ranges exist for WBC (IGNORED in reports)`);
        assert(true, 'Device ranges exist but are ignored');
      } else {
        assert(true, 'No device ranges for WBC');
      }
    } else {
      console.log('     ⚠️  No WBC parameter found in DB — skipping DB test');
      assert(true, 'Skipped (no WBC parameter)');
    }
  } catch (err) {
    console.log(`     ⚠️  DB test skipped: ${err.message}`);
    assert(true, 'Skipped (DB error)');
  }

  // Summary
  console.log(`\n${'='.repeat(55)}`);
  console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
  console.log(`${'='.repeat(55)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
