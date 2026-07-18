#!/usr/bin/env node
/**
 * Ensure ELISA SP-RATIO parameters have a text_reference for each species.
 * Never overwrites an existing active range (manual or otherwise).
 *
 * Dry-run (default):  node src/scripts/ensure-elisa-text-refs.js
 * Apply inserts:      node src/scripts/ensure-elisa-text-refs.js --apply
 */
require('dotenv').config();
const { query, pool } = require('../config/database');
const { ANIMAL_TYPE_CODES } = require('../constants/animal-types');
const logger = require('../config/logger');

const SPECIES = ANIMAL_TYPE_CODES.filter((t) => t !== 'other');
const APPLY = process.env.APPLY === 'true' || process.argv.includes('--apply');

/** Kit cutoffs vary — lab should edit after insert. */
const DEFAULT_TEXT_REFERENCE = [
  'Negative: S/P% < 40',
  'Suspect: 40–50',
  'Positive: S/P% ≥ 50',
  '',
  'سلبي: S/P% < 40',
  'مشبوه: 40–50',
  'إيجابي: S/P% ≥ 50',
].join('\n');

const NOTES = 'ELISA text template (edit to match kit IFU)';

async function main() {
  const params = await query(`
    SELECT tp.id AS parameter_id, tp.code AS parameter_code, tp.unit,
           t.code AS test_code, t.name AS test_name
    FROM test_parameters tp
    JOIN tests t ON t.id = tp.test_id
    LEFT JOIN test_categories tc ON tc.id = t.category_id
    WHERE tp.is_active = true
      AND t.is_active = true
      AND UPPER(tp.code) = 'SP-RATIO'
      AND (
        tc.code = 'ELISA'
        OR t.code ILIKE '%ELISA%'
        OR t.name ILIKE '%ELISA%'
      )
    ORDER BY t.code
  `);

  let inserted = 0;
  let skipped = 0;
  let planned = 0;

  for (const p of params.rows) {
    for (const species of SPECIES) {
      const existing = await query(
        `SELECT id, text_reference, min_value, max_value, is_active
         FROM test_reference_ranges
         WHERE parameter_id = $1 AND animal_type = $2
           AND (is_active IS NULL OR is_active = true)
         ORDER BY updated_at DESC NULLS LAST
         LIMIT 1`,
        [p.parameter_id, species]
      );

      if (existing.rows[0]) {
        skipped += 1;
        continue;
      }

      planned += 1;
      console.log(`  + ${p.test_code} / SP-RATIO / ${species}`);

      if (!APPLY) continue;

      await query(
        `INSERT INTO test_reference_ranges
           (parameter_id, animal_type, min_value, max_value, critical_low, critical_high,
            unit, notes, text_reference, is_active)
         VALUES ($1, $2, NULL, NULL, NULL, NULL, $3, $4, $5, true)`,
        [p.parameter_id, species, p.unit || '%', NOTES, DEFAULT_TEXT_REFERENCE]
      );
      inserted += 1;
    }
  }

  console.log(`\nELISA SP-RATIO params: ${params.rows.length}`);
  console.log(`Species: ${SPECIES.join(', ')}`);
  console.log(`Would insert / inserted: ${APPLY ? inserted : planned}`);
  console.log(`Skipped (already exists): ${skipped}`);
  if (!APPLY && planned > 0) {
    console.log('\nDry-run only. Re-run with APPLY=true to insert.');
  }

  logger.info('ELISA text refs ensure done', { apply: APPLY, planned, inserted, skipped });
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
