/**
 * Fix missing/inactive camel CBC reference ranges and regenerate affected report PDFs.
 *
 * Safety:
 *   - CBC-FULL + animal_type=camel only
 *   - Reactivates inactive rows; fills gaps from Norma defaults
 *   - Does not overwrite rows with Manual LIMS notes
 *   - Report regen only for camel samples that have CBC results
 *
 * Usage:
 *   cd backend
 *   node src/scripts/fix-camel-cbc-reference-gaps.js          # dry-run
 *   node src/scripts/fix-camel-cbc-reference-gaps.js --fix     # apply + regen PDFs
 */
require('dotenv').config();
const { query, pool } = require('../config/database');
const { NORMA_CBC_PANEL } = require('../utils/norma-cbc-panel');
const { NORMA_CBC_REFERENCES } = require('../utils/norma-cbc-references');
const { upsertReferenceRange } = require('../services/reference-ranges.service');
const logger = require('../config/logger');

const APPLY = process.argv.includes('--fix');
const CBC_TEST_CODE = 'CBC-FULL';
const SPECIES = 'camel';

const TARGET_CODES = [
  'LYM_PCT', 'MON_PCT', 'NEU_PCT', 'EOS_PCT', 'BAS_PCT',
  'RDW-SD', 'RDW-CV',
  'MPV', 'PCT', 'PDW-SD', 'PDW-CV', 'PLC-R', 'PLC-C',
];

async function main() {
  console.log(`\n=== Camel CBC reference gap fix (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===\n`);

  const test = await query('SELECT id FROM tests WHERE code = $1 LIMIT 1', [CBC_TEST_CODE]);
  const testId = test.rows[0]?.id;
  if (!testId) {
    console.error('CBC-FULL test not found');
    process.exitCode = 1;
    return;
  }

  const params = await query(
    `SELECT id, code, unit FROM test_parameters
     WHERE test_id = $1 AND is_active = true AND code = ANY($2::text[])`,
    [testId, TARGET_CODES]
  );
  const byCode = Object.fromEntries(params.rows.map((p) => [p.code, p]));

  const existing = await query(
    `SELECT trr.id, tp.code, trr.min_value, trr.max_value, trr.is_active, trr.notes
     FROM test_reference_ranges trr
     JOIN test_parameters tp ON tp.id = trr.parameter_id
     WHERE tp.test_id = $1 AND trr.animal_type = $2 AND tp.code = ANY($3::text[])
     ORDER BY tp.code`,
    [testId, SPECIES, TARGET_CODES]
  );

  console.log('Current camel CBC gap params:');
  for (const row of existing.rows) {
    console.log(
      `  ${row.code}: active=${row.is_active !== false} min=${row.min_value} max=${row.max_value}`
    );
  }
  const present = new Set(existing.rows.map((r) => r.code));
  const missingCodes = TARGET_CODES.filter((c) => !present.has(c));
  const inactiveCodes = existing.rows.filter((r) => r.is_active === false).map((r) => r.code);
  console.log(`\nMissing rows: ${missingCodes.join(', ') || 'none'}`);
  console.log(`Inactive rows: ${inactiveCodes.join(', ') || 'none'}`);

  // Always reactivate any inactive TARGET rows first (even if dry-run shows message only)
  if (APPLY && inactiveCodes.length) {
    await query(
      `UPDATE test_reference_ranges trr
       SET is_active = true, updated_at = NOW()
       FROM test_parameters tp
       JOIN tests t ON t.id = tp.test_id
       WHERE trr.parameter_id = tp.id
         AND t.code = $1
         AND trr.animal_type = $2
         AND trr.is_active = false
         AND tp.code = ANY($3::text[])`,
      [CBC_TEST_CODE, SPECIES, TARGET_CODES]
    );
    console.log(`Reactivated ${inactiveCodes.length} inactive camel rows`);
  }

  if (!APPLY) {
    const reports = await listCamelCbcReports();
    console.log(`\nCamel CBC reports that would be regenerated: ${reports.length}`);
    for (const r of reports.slice(0, 20)) {
      console.log(`  ${r.report_number} | ${r.sample_code}`);
    }
    if (reports.length > 20) console.log(`  … and ${reports.length - 20} more`);
    console.log('\nRe-run with --fix to apply ranges and regenerate PDFs.');
    return;
  }

  const camelDefaults = NORMA_CBC_REFERENCES.camel;
  let upserted = 0;
  let skipped = 0;

  for (const code of TARGET_CODES) {
    const param = byCode[code];
    const panel = NORMA_CBC_PANEL.find((p) => p.code === code);
    const ref = camelDefaults[code];
    if (!param || !ref) {
      console.warn(`  skip ${code}: param or default missing`);
      skipped += 1;
      continue;
    }
    const result = await upsertReferenceRange({
      parameterId: param.id,
      animalType: SPECIES,
      min: ref.min,
      max: ref.max,
      criticalLow: ref.crit_low,
      criticalHigh: ref.crit_high,
      unit: param.unit || panel?.unit,
      notes: `Species default (${SPECIES})`,
      source: 'norma-defaults',
      refreshAutoDefaults: true,
    });
    if (result?.skipped_manual || result?.skipped_protected) {
      // Still reactivate if inactive but protected bounds
      await query(
        `UPDATE test_reference_ranges SET is_active = true, updated_at = NOW()
         WHERE parameter_id = $1 AND animal_type = $2 AND is_active = false`,
        [param.id, SPECIES]
      );
      skipped += 1;
      console.log(`  ${code}: skipped overwrite (manual/protected) — reactivated if inactive`);
    } else {
      upserted += 1;
      console.log(`  ${code}: upserted/reactivated ${result?.min_value}-${result?.max_value}`);
    }
  }

  // Mark reports needing update by parameter ids
  const lifecycle = require('../services/report-lifecycle.service');
  for (const param of params.rows) {
    await lifecycle.markReportsNeedsUpdateByParameterId(param.id, 'REFERENCE');
  }

  const reports = await listCamelCbcReports();
  console.log(`\nRegenerating ${reports.length} camel CBC report PDF(s)…`);
  const reportsService = require('../services/reports.service');
  let ok = 0;
  let fail = 0;
  for (const r of reports) {
    try {
      await reportsService.regeneratePdfById(r.id);
      ok += 1;
      console.log(`  OK ${r.report_number}`);
    } catch (err) {
      fail += 1;
      console.error(`  FAIL ${r.report_number}: ${err.message}`);
    }
  }

  console.log(`\nDone. upserted=${upserted} skipped=${skipped} regen_ok=${ok} regen_fail=${fail}`);
}

async function listCamelCbcReports() {
  const result = await query(
    `SELECT DISTINCT r.id, r.report_number, s.sample_code
     FROM reports r
     JOIN samples s ON s.id = r.sample_id
     JOIN animals a ON a.id = s.animal_id
     JOIN sample_tests st ON st.sample_id = s.id
     JOIN tests t ON t.id = st.test_id
     WHERE a.animal_type::text = $1
       AND t.code = $2
       AND EXISTS (
         SELECT 1 FROM results res
         JOIN result_values rv ON rv.result_id = res.id
         WHERE res.sample_test_id = st.id
       )
     ORDER BY r.report_number`,
    [SPECIES, CBC_TEST_CODE]
  );
  return result.rows;
}

main()
  .catch((err) => {
    logger.error(err);
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
