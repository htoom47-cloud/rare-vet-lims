/**
 * Idempotent: BUN display as UR / Urea / اليوريا + urea reference ranges (Admin table).
 * Applies Admin urea bounds to every active CHEM-BASIC BUN parameter_id so reports resolve.
 * Does not overwrite complete manual ranges (non species-default notes) unless bounds empty.
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
/** Fallback when animal_type has no dedicated row (same band as camel Admin). */
const OTHER_FALLBACK = { min: 8, max: 28, crit_low: 2, crit_high: 38 };

async function ensureLabels() {
  const result = await query(
    `UPDATE test_parameters
     SET name = $1,
         name_ar = $2,
         short_code = $3,
         device_code = $3
     WHERE (
         UPPER(code) IN ('BUN', 'UREA', 'UR', 'URE')
         OR UPPER(COALESCE(short_code, '')) IN ('BUN', 'UREA', 'UR', 'URE')
       )
       AND (
         name IS DISTINCT FROM $1
         OR name_ar IS DISTINCT FROM $2
         OR short_code IS DISTINCT FROM $3
         OR device_code IS DISTINCT FROM $3
       )
     RETURNING id`,
    [EN_NAME, AR_NAME, DISPLAY_CODE]
  );
  console.log(`Updated ${result.rowCount} urea label(s) → ${DISPLAY_CODE} / ${AR_NAME}`);
  return result.rowCount;
}

async function listBunParams() {
  const result = await query(
    `SELECT tp.id, tp.code, tp.unit, t.code AS test_code
     FROM test_parameters tp
     JOIN tests t ON t.id = tp.test_id
     WHERE tp.is_active = true
       AND (
         UPPER(tp.code) IN ('BUN', 'UREA', 'UR', 'URE')
         OR UPPER(COALESCE(tp.short_code, '')) IN ('BUN', 'UREA', 'UR', 'URE')
       )`
  );
  return result.rows;
}

/**
 * Copy any existing Admin urea ranges onto every BUN parameter_id (fill gaps only).
 * Then ensure system species defaults from CHEM_REFERENCE_RANGES (Admin table values).
 */
async function ensureBunRanges() {
  const bunParams = await listBunParams();
  if (!bunParams.length) {
    logger.warn('No active BUN parameters found');
    return { upserted: 0, copied: 0, skipped: 0 };
  }

  const ids = bunParams.map((p) => p.id);
  const existing = await query(
    `SELECT parameter_id, animal_type, min_value, max_value, critical_low, critical_high, unit, notes
     FROM test_reference_ranges
     WHERE parameter_id = ANY($1::uuid[])
       AND (is_active IS NULL OR is_active = true)
       AND min_value IS NOT NULL AND max_value IS NOT NULL`,
    [ids]
  );

  // Prefer richest Admin row per animal_type (manual notes win over species-default).
  const bestBySpecies = new Map();
  for (const row of existing.rows) {
    const key = String(row.animal_type);
    const prev = bestBySpecies.get(key);
    const manual = String(row.notes || '').toLowerCase().includes('manual')
      || (row.notes && !String(row.notes).startsWith('Species default')
        && !String(row.notes).startsWith('Synced from'));
    if (!prev) {
      bestBySpecies.set(key, row);
      continue;
    }
    const prevManual = String(prev.notes || '').toLowerCase().includes('manual')
      || (prev.notes && !String(prev.notes).startsWith('Species default')
        && !String(prev.notes).startsWith('Synced from'));
    if (manual && !prevManual) bestBySpecies.set(key, row);
  }

  let copied = 0;
  let upserted = 0;
  let skipped = 0;

  // Propagate Admin screenshot ranges to every BUN UUID (onlyIfMissing).
  for (const param of bunParams) {
    for (const [, src] of bestBySpecies) {
      const result = await upsertReferenceRange({
        parameterId: param.id,
        animalType: src.animal_type,
        min: Number(src.min_value),
        max: Number(src.max_value),
        criticalLow: src.critical_low != null ? Number(src.critical_low) : undefined,
        criticalHigh: src.critical_high != null ? Number(src.critical_high) : undefined,
        unit: src.unit || param.unit || 'mg/dL',
        notes: src.notes || `Species default (${src.animal_type})`,
        source: 'species-defaults',
        onlyIfMissing: true,
      });
      if (result?.skipped_manual || result?.skipped_protected) skipped += 1;
      else if (result) copied += 1;
    }
  }

  const speciesList = ANIMAL_TYPE_CODES.filter((t) => t !== 'other');
  for (const param of bunParams) {
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
        refreshAutoDefaults: true,
      });
      if (result?.skipped_manual || result?.skipped_protected) skipped += 1;
      else if (result) upserted += 1;
    }

    // Alias: custom species foal/مهر → same band as horse if still missing
    const foal = await upsertReferenceRange({
      parameterId: param.id,
      animalType: 'foal',
      min: CHEM_REFERENCE_RANGES.horse.BUN.min,
      max: CHEM_REFERENCE_RANGES.horse.BUN.max,
      criticalLow: CHEM_REFERENCE_RANGES.horse.BUN.crit_low,
      criticalHigh: CHEM_REFERENCE_RANGES.horse.BUN.crit_high,
      unit: param.unit || 'mg/dL',
      notes: 'Species default (foal)',
      source: 'species-defaults',
      onlyIfMissing: true,
      refreshAutoDefaults: true,
    }).catch(() => null);
    if (foal?.skipped_manual || foal?.skipped_protected) skipped += 1;
    else if (foal) upserted += 1;

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
      refreshAutoDefaults: true,
    });
    if (other?.skipped_manual || other?.skipped_protected) skipped += 1;
    else if (other) upserted += 1;
  }

  console.log(
    `BUN ranges: bunParams=${bunParams.length}, copiedFromAdmin=${copied}, upsertedDefaults=${upserted}, skipped=${skipped}`
  );
  return { copied, upserted, skipped, bunParams: bunParams.length };
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
