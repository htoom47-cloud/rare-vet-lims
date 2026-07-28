/**
 * Idempotent: BUN display as UR / Urea / اليوريا + missing species reference ranges.
 * Does not change internal code, results, ingest mappings, or overwrite complete manual ranges.
 *
 * Usage: node src/scripts/ensure-bun-urea-labels.js
 */
require('dotenv').config();
const { query, pool } = require('../config/database');
const { upsertReferenceRange } = require('../services/reference-ranges.service');
const { ANIMAL_TYPE_CODES } = require('../constants/animal-types');
const { CHEM_REFERENCE_RANGES } = require('../utils/chem-reference-ranges');
const logger = require('../config/logger');

const EN_NAME = 'Urea';
const AR_NAME = 'اليوريا';
const DISPLAY_CODE = 'UR';
const OTHER_FALLBACK = { min: 10, max: 30, crit_low: 5, crit_high: 80 };

async function ensureLabels() {
  const result = await query(
    `UPDATE test_parameters
     SET name = $1,
         name_ar = $2,
         short_code = $3,
         device_code = $3
     WHERE UPPER(code) = 'BUN'
       AND (
         name IS DISTINCT FROM $1
         OR name_ar IS DISTINCT FROM $2
         OR short_code IS DISTINCT FROM $3
         OR device_code IS DISTINCT FROM $3
       )
     RETURNING id, code, name, name_ar, short_code, device_code`,
    [EN_NAME, AR_NAME, DISPLAY_CODE]
  );

  console.log(
    `Updated ${result.rowCount} BUN label(s) → ${DISPLAY_CODE} / ${EN_NAME} / ${AR_NAME}`
  );
  return result.rowCount;
}

async function ensureBunRanges() {
  const test = await query(`SELECT id FROM tests WHERE code = 'CHEM-BASIC' LIMIT 1`);
  const testId = test.rows[0]?.id;
  if (!testId) {
    logger.warn('CHEM-BASIC not found — skip BUN ranges');
    return { upserted: 0, skipped: 0 };
  }

  const params = await query(
    `SELECT id, code, unit FROM test_parameters
     WHERE test_id = $1 AND UPPER(code) = 'BUN' AND is_active = true`,
    [testId]
  );
  if (!params.rows.length) {
    logger.warn('BUN parameter not found under CHEM-BASIC');
    return { upserted: 0, skipped: 0 };
  }

  let upserted = 0;
  let skipped = 0;
  const speciesList = ANIMAL_TYPE_CODES.filter((t) => t !== 'other');

  for (const param of params.rows) {
    for (const species of speciesList) {
      const ref = CHEM_REFERENCE_RANGES[species]?.BUN;
      if (!ref) continue;
      const result = await upsertReferenceRange({
        parameterId: param.id,
        animalType: species,
        min: ref.min,
        max: ref.max,
        criticalLow: ref.crit_low,
        criticalHigh: ref.crit_high,
        unit: param.unit || 'mg/dL',
        notes: `Species default (${species})`,
        source: 'species-defaults',
        onlyIfMissing: true,
      });
      if (result?.skipped_manual || result?.skipped_protected) skipped += 1;
      else if (result) upserted += 1;
    }

    const other = await upsertReferenceRange({
      parameterId: param.id,
      animalType: 'other',
      min: OTHER_FALLBACK.min,
      max: OTHER_FALLBACK.max,
      criticalLow: OTHER_FALLBACK.crit_low,
      criticalHigh: OTHER_FALLBACK.crit_high,
      unit: param.unit || 'mg/dL',
      notes: 'Species default (other)',
      source: 'species-defaults',
      onlyIfMissing: true,
    });
    if (other?.skipped_manual || other?.skipped_protected) skipped += 1;
    else if (other) upserted += 1;
  }

  console.log(`BUN reference ranges: upserted=${upserted}, skipped=${skipped}`);
  return { upserted, skipped };
}

async function main() {
  await ensureLabels();
  await ensureBunRanges();
}

main()
  .catch((err) => {
    logger.error('ensure-bun-urea-labels failed', { error: err.message });
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
