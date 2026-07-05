/**
 * Ensure chemistry + hormone + legacy CBC reference ranges for all species.
 * Does not overwrite manual LIMS ranges (onlyIfMissing).
 *
 * Usage: node src/scripts/ensure-species-reference-ranges.js
 */
require('dotenv').config();
const { query, pool } = require('../config/database');
const { upsertReferenceRange } = require('../services/reference-ranges.service');
const { ANIMAL_TYPE_CODES } = require('../constants/animal-types');
const { CHEM_REFERENCE_RANGES } = require('../utils/chem-reference-ranges');
const { HORM_REFERENCE_RANGES } = require('../utils/horm-reference-ranges');
const { NORMA_CBC_REFERENCES } = require('../utils/norma-cbc-references');
const logger = require('../config/logger');

const SPECIES = ANIMAL_TYPE_CODES.filter((t) => t !== 'other');

const TEST_CONFIG = [
  { testCode: 'CHEM-BASIC', rangesBySpecies: CHEM_REFERENCE_RANGES },
  { testCode: 'HORM-T4', rangesBySpecies: HORM_REFERENCE_RANGES },
];

/** Legacy CBC params not in NORMA_CBC_PANEL but still in DB */
const LEGACY_CBC_CODES = ['RDW'];

async function ensureTestRanges(testCode, rangesBySpecies) {
  const test = await query('SELECT id FROM tests WHERE code = $1 LIMIT 1', [testCode]);
  const testId = test.rows[0]?.id;
  if (!testId) {
    logger.warn(`${testCode} not found — skipping`);
    return { upserted: 0, skippedManual: 0 };
  }

  const params = await query(
    'SELECT id, code, unit FROM test_parameters WHERE test_id = $1 AND is_active = true',
    [testId]
  );
  const paramByCode = Object.fromEntries(params.rows.map((p) => [p.code, p]));

  let upserted = 0;
  let skippedManual = 0;

  for (const species of SPECIES) {
    const ranges = rangesBySpecies[species];
    if (!ranges) continue;
    for (const [code, ref] of Object.entries(ranges)) {
      const param = paramByCode[code];
      if (!param || ref.min == null || ref.max == null) continue;
      const result = await upsertReferenceRange({
        parameterId: param.id,
        animalType: species,
        min: ref.min,
        max: ref.max,
        criticalLow: ref.crit_low,
        criticalHigh: ref.crit_high,
        unit: param.unit,
        notes: `Species default (${species})`,
        source: 'species-defaults',
        onlyIfMissing: true,
      });
      if (result?.skipped_manual) skippedManual += 1;
      else if (result) upserted += 1;
    }
  }

  return { upserted, skippedManual };
}

async function ensureLegacyCbcRanges() {
  const test = await query('SELECT id FROM tests WHERE code = $1 LIMIT 1', ['CBC-FULL']);
  const testId = test.rows[0]?.id;
  if (!testId) return { upserted: 0, skippedManual: 0 };

  const params = await query(
    'SELECT id, code, unit FROM test_parameters WHERE test_id = $1 AND is_active = true',
    [testId]
  );
  const paramByCode = Object.fromEntries(params.rows.map((p) => [p.code, p]));

  let upserted = 0;
  let skippedManual = 0;

  for (const species of SPECIES) {
    const ranges = NORMA_CBC_REFERENCES[species];
    if (!ranges) continue;
    for (const code of LEGACY_CBC_CODES) {
      const ref = ranges[code];
      const param = paramByCode[code];
      if (!ref || !param) continue;
      const result = await upsertReferenceRange({
        parameterId: param.id,
        animalType: species,
        min: ref.min,
        max: ref.max,
        criticalLow: ref.crit_low,
        criticalHigh: ref.crit_high,
        unit: param.unit,
        notes: `Species default (${species})`,
        source: 'species-defaults',
        onlyIfMissing: true,
      });
      if (result?.skipped_manual) skippedManual += 1;
      else if (result) upserted += 1;
    }
  }

  return { upserted, skippedManual };
}

async function main() {
  let totalUpserted = 0;
  let totalSkipped = 0;

  for (const cfg of TEST_CONFIG) {
    const { upserted, skippedManual } = await ensureTestRanges(cfg.testCode, cfg.rangesBySpecies);
    totalUpserted += upserted;
    totalSkipped += skippedManual;
    logger.info(`${cfg.testCode} species ranges ensured`, { upserted, skippedManual });
  }

  const legacy = await ensureLegacyCbcRanges();
  totalUpserted += legacy.upserted;
  totalSkipped += legacy.skippedManual;
  logger.info('Legacy CBC params ensured', legacy);

  logger.info('Species reference ranges complete', {
    upserted: totalUpserted,
    skippedManual: totalSkipped,
    species: SPECIES.length,
  });
  await pool.end();
}

main().catch((err) => {
  logger.error('ensure-species-reference-ranges failed', { error: err.message });
  process.exit(1);
});
