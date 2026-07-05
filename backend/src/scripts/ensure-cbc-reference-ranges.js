/**
 * Ensure all Norma CBC reference ranges exist in LIMS (test_reference_ranges).
 * Fills missing LYM_PCT, MON_PCT, NEU_PCT, EOS_PCT, BAS_PCT, etc. without overwriting manual ranges.
 *
 * Usage: node src/scripts/ensure-cbc-reference-ranges.js
 */
require('dotenv').config();
const { query, pool } = require('../config/database');
const { NORMA_CBC_PANEL } = require('../utils/norma-cbc-panel');
const { NORMA_CBC_REFERENCES } = require('../utils/norma-cbc-references');
const { upsertReferenceRange } = require('../services/reference-ranges.service');
const { ANIMAL_TYPE_CODES } = require('../constants/animal-types');
const logger = require('../config/logger');

const CBC_TEST_CODE = 'CBC-FULL';
const SPECIES = ANIMAL_TYPE_CODES.filter((t) => t !== 'other');

async function main() {
  const test = await query('SELECT id FROM tests WHERE code = $1 LIMIT 1', [CBC_TEST_CODE]);
  const testId = test.rows[0]?.id;
  if (!testId) {
    logger.warn('CBC-FULL not found — skipping CBC reference range ensure');
    await pool.end();
    return;
  }

  const params = await query(
    'SELECT id, code, unit FROM test_parameters WHERE test_id = $1 AND is_active = true',
    [testId]
  );
  const paramByCode = Object.fromEntries(params.rows.map((p) => [p.code, p]));
  const fallback = NORMA_CBC_REFERENCES.camel;

  let upserted = 0;
  let skippedManual = 0;
  let missingParam = 0;

  for (const species of SPECIES) {
    const ranges = NORMA_CBC_REFERENCES[species] || fallback;
    for (const panel of NORMA_CBC_PANEL) {
      const ref = ranges[panel.code];
      if (!ref) continue;
      const param = paramByCode[panel.code];
      if (!param) {
        missingParam += 1;
        continue;
      }

      const result = await upsertReferenceRange({
        parameterId: param.id,
        animalType: species,
        min: ref.min,
        max: ref.max,
        criticalLow: ref.crit_low,
        criticalHigh: ref.crit_high,
        unit: param.unit || panel.unit,
        notes: 'Synced from norma-defaults',
        source: 'norma-defaults',
        onlyIfMissing: true,
      });

      if (result?.skipped_manual) skippedManual += 1;
      else if (result) upserted += 1;
    }
  }

  logger.info('CBC reference ranges ensured', {
    upserted,
    skippedManual,
    missingParam,
    species: SPECIES.length,
    parameters: NORMA_CBC_PANEL.length,
  });
  await pool.end();
}

main().catch((err) => {
  logger.error('ensure-cbc-reference-ranges failed', { error: err.message });
  process.exit(1);
});
