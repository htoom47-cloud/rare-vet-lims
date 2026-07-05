/**
 * Move misplaced WBC differential % reference ranges from LYM/MON/NEU/EOS/BAS
 * to LYM_PCT/MON_PCT/NEU_PCT/EOS_PCT/BAS_PCT (where results and UI read them).
 *
 * Usage: node src/scripts/reconcile-cbc-reference-codes.js
 */
require('dotenv').config();
const { query, pool } = require('../config/database');
const {
  PCT_BY_ABS,
  isSyncedNotes,
} = require('../utils/cbc-reference-params');
const { upsertReferenceRange } = require('../services/reference-ranges.service');
const logger = require('../config/logger');

const CBC_TEST_CODE = 'CBC-FULL';

async function main() {
  const test = await query('SELECT id FROM tests WHERE code = $1 LIMIT 1', [CBC_TEST_CODE]);
  const testId = test.rows[0]?.id;
  if (!testId) {
    logger.warn('CBC-FULL not found — skip reconcile-cbc-reference-codes');
    await pool.end();
    return;
  }

  const params = await query(
    'SELECT id, code, unit FROM test_parameters WHERE test_id = $1 AND is_active = true',
    [testId]
  );
  const paramByCode = Object.fromEntries(params.rows.map((p) => [p.code, p]));

  let migrated = 0;
  let deactivated = 0;
  let skipped = 0;

  for (const [absCode, pctCode] of Object.entries(PCT_BY_ABS)) {
    const absParam = paramByCode[absCode];
    const pctParam = paramByCode[pctCode];
    if (!absParam || !pctParam) continue;

    const ranges = await query(
      `SELECT * FROM test_reference_ranges
       WHERE parameter_id = ANY($1::uuid[])
         AND (is_active IS NULL OR is_active = true)
       ORDER BY animal_type, id`,
      [[absParam.id, pctParam.id]]
    );

    const byKey = (row) => `${row.parameter_id}:${row.animal_type}`;
    const grouped = new Map();
    for (const row of ranges.rows) {
      grouped.set(byKey(row), row);
    }

    const absRows = ranges.rows.filter((r) => String(r.parameter_id) === String(absParam.id));

    for (const absRange of absRows) {
      if (isSyncedNotes(absRange.notes)) {
        skipped += 1;
        continue;
      }

      const pctRange = ranges.rows.find(
        (r) => String(r.parameter_id) === String(pctParam.id) && r.animal_type === absRange.animal_type
      );

      if (pctRange && !isSyncedNotes(pctRange.notes)) {
        skipped += 1;
        continue;
      }

      // WBC differential is always shown as % in Norma screen — manual ranges on LYM/NEU/… belong on *_PCT.
      await upsertReferenceRange({
        parameterId: pctParam.id,
        animalType: absRange.animal_type,
        min: absRange.min_value,
        max: absRange.max_value,
        criticalLow: absRange.critical_low,
        criticalHigh: absRange.critical_high,
        unit: '%',
        notes: absRange.notes || 'Migrated from WBC diff % parameter',
        source: 'manual',
        onlyIfMissing: false,
        force: true,
      });

      await query(
        `UPDATE test_reference_ranges
         SET is_active = false, notes = COALESCE(notes, '') || ' [migrated to ${pctCode}]', updated_at = NOW()
         WHERE id = $1`,
        [absRange.id]
      );

      migrated += 1;
      deactivated += 1;
      logger.info('Migrated CBC % reference', {
        from: absCode,
        to: pctCode,
        species: absRange.animal_type,
        min: absRange.min_value,
        max: absRange.max_value,
      });
    }
  }

  logger.info('CBC reference code reconciliation done', { migrated, deactivated, skipped });
  await pool.end();
}

main().catch((err) => {
  logger.error('reconcile-cbc-reference-codes failed', { error: err.message });
  process.exit(1);
});
