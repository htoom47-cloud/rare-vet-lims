const { query } = require('../config/database');
const { defaultCritical } = require('../utils/reference-range');
const { getNormaReference } = require('../utils/norma-cbc-references');

const upsertReferenceRange = async ({
  parameterId,
  animalType,
  min,
  max,
  criticalLow,
  criticalHigh,
  unit,
  notes,
  source = 'norma',
}) => {
  if (parameterId == null || !animalType || min == null || max == null) return null;

  const crit = defaultCritical(min, max);
  const cLow = criticalLow ?? crit.crit_low;
  const cHigh = criticalHigh ?? crit.crit_high;
  const noteText = notes || `Synced from ${source}`;

  const existing = await query(
    `SELECT id FROM test_reference_ranges WHERE parameter_id = $1 AND animal_type = $2`,
    [parameterId, animalType]
  );

  if (existing.rows[0]) {
    const result = await query(
      `UPDATE test_reference_ranges
       SET min_value = $1, max_value = $2, critical_low = $3, critical_high = $4,
           unit = COALESCE($5, unit), notes = $6
       WHERE id = $7 RETURNING *`,
      [min, max, cLow, cHigh, unit, noteText, existing.rows[0].id]
    );
    return result.rows[0];
  }

  const result = await query(
    `INSERT INTO test_reference_ranges
       (parameter_id, animal_type, min_value, max_value, critical_low, critical_high, unit, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [parameterId, animalType, min, max, cLow, cHigh, unit, noteText]
  );
  return result.rows[0];
};

const syncFromParsedResults = async ({ results, testCode, animalType }) => {
  if (!results?.length || !animalType) return { updated: 0, skipped: 0 };

  const { mapNormaCode, DEFAULT_CBC_TEST_CODE } = require('../utils/norma-cbc-map');
  const code = testCode || DEFAULT_CBC_TEST_CODE;
  let updated = 0;
  let skipped = 0;

  for (const row of results) {
    const limsCode = mapNormaCode(row.code);
    let refMin = row.referenceMin;
    let refMax = row.referenceMax;

    if (refMin == null || refMax == null) {
      const profile = getNormaReference(animalType, limsCode);
      if (profile) {
        refMin = profile.min;
        refMax = profile.max;
      }
    }

    if (refMin == null || refMax == null) {
      skipped += 1;
      continue;
    }

    const param = await query(
      `SELECT tp.id, tp.unit FROM test_parameters tp
       JOIN tests t ON tp.test_id = t.id
       WHERE t.code = $1 AND tp.code = $2 LIMIT 1`,
      [code, limsCode]
    );
    if (!param.rows[0]) {
      skipped += 1;
      continue;
    }
    await upsertReferenceRange({
      parameterId: param.rows[0].id,
      animalType,
      min: refMin,
      max: refMax,
      criticalLow: getNormaReference(animalType, limsCode)?.crit_low,
      criticalHigh: getNormaReference(animalType, limsCode)?.crit_high,
      unit: row.unit || param.rows[0].unit,
      source: row.referenceMin != null ? 'norma-hl7' : 'norma-profile',
    });
    updated += 1;
  }

  return { updated, skipped };
};

/** Ensure all Norma profile reference ranges exist for a CBC test + animal type. */
const syncNormaProfileForAnimal = async (testCode, animalType) => {
  const { NORMA_CBC_REFERENCES } = require('../utils/norma-cbc-references');
  const ranges = NORMA_CBC_REFERENCES[animalType];
  if (!ranges) return { updated: 0 };

  const test = await query('SELECT id FROM tests WHERE code = $1 LIMIT 1', [testCode]);
  if (!test.rows[0]) return { updated: 0 };

  const params = await query(
    'SELECT id, code, unit FROM test_parameters WHERE test_id = $1',
    [test.rows[0].id]
  );
  const byCode = Object.fromEntries(params.rows.map((p) => [p.code, p]));

  let updated = 0;
  for (const [code, ref] of Object.entries(ranges)) {
    const param = byCode[code];
    if (!param) continue;
    await upsertReferenceRange({
      parameterId: param.id,
      animalType,
      min: ref.min,
      max: ref.max,
      criticalLow: ref.crit_low,
      criticalHigh: ref.crit_high,
      unit: param.unit,
      source: 'norma-profile',
    });
    updated += 1;
  }
  return { updated };
};

module.exports = { upsertReferenceRange, syncFromParsedResults, syncNormaProfileForAnimal };
