const { query } = require('../config/database');
const { defaultCritical, normaReferenceNote } = require('../utils/reference-range');
const { getNormaReference } = require('../utils/norma-cbc-references');
const { DEFAULT_CBC_TEST_CODE, resolveNormaResultLimsCode } = require('../utils/norma-cbc-map');

/** Prefer manually entered LIMS ranges over Norma-synced duplicates. */
const LIMS_REF_PRIORITY_ORDER = `
  CASE
    WHEN trr.notes IS NOT NULL
      AND trr.notes NOT LIKE 'Norma:%'
      AND trr.notes NOT LIKE 'Synced from%' THEN 0
    WHEN trr.notes IS NULL OR TRIM(trr.notes) = '' THEN 1
    ELSE 2
  END,
  trr.id DESC`;

const isManualLimsNotes = (notes) => {
  const n = String(notes || '').trim();
  if (!n) return false;
  return !n.startsWith('Norma:') && !n.startsWith('Synced from');
};

const LIMS_REF_SELECT_SQL = `
  trr.min_value AS trr_min,
  trr.max_value AS trr_max,
  trr.critical_low AS trr_critical_low,
  trr.critical_high AS trr_critical_high,
  trr.notes AS trr_notes`;

const limsRefLateralJoin = (paramExpr = 'tp.id', speciesExpr = 'a.animal_type') => `
  LEFT JOIN LATERAL (
    SELECT min_value, max_value, critical_low, critical_high, notes
    FROM test_reference_ranges trr
    WHERE trr.parameter_id = ${paramExpr} AND trr.animal_type = ${speciesExpr}
    ORDER BY ${LIMS_REF_PRIORITY_ORDER}
    LIMIT 1
  ) trr ON true`;

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
  onlyIfMissing = false,
  force = false,
}) => {
  if (parameterId == null || !animalType || min == null || max == null) return null;

  const crit = defaultCritical(min, max);
  const cLow = criticalLow ?? crit.crit_low;
  const cHigh = criticalHigh ?? crit.crit_high;
  const noteText = notes ?? (source === 'manual' ? null : `Synced from ${source}`);

  const existing = await query(
    `SELECT id, notes FROM test_reference_ranges
     WHERE parameter_id = $1 AND animal_type = $2
     ORDER BY ${LIMS_REF_PRIORITY_ORDER}
     LIMIT 1`,
    [parameterId, animalType]
  );

  if (existing.rows[0] && onlyIfMissing) return existing.rows[0];
  if (existing.rows[0] && isManualLimsNotes(existing.rows[0].notes) && !force) {
    return { ...existing.rows[0], skipped_manual: true };
  }

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

const syncFromParsedResults = async ({
  results,
  testCode,
  animalType,
  overwriteNorma = false,
  force = false,
}) => {
  if (!results?.length || !animalType) return { updated: 0, skipped: 0, protected: 0 };

  const code = testCode || DEFAULT_CBC_TEST_CODE;
  let updated = 0;
  let skipped = 0;
  let protectedManual = 0;

  for (const row of results) {
    const limsCode = resolveNormaResultLimsCode(row);
    if (!limsCode) {
      skipped += 1;
      continue;
    }

    const fromHl7 = row.referenceMin != null && row.referenceMax != null;
    let refMin = row.referenceMin;
    let refMax = row.referenceMax;

    if (!fromHl7) {
      const profile = getNormaReference(animalType, limsCode);
      if (profile) {
        refMin = profile.min;
        refMax = profile.max;
      }
    }

    if (refMin == null || refMax == null || (refMin === 0 && refMax === 0)) {
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

    const profile = getNormaReference(animalType, limsCode);
    const noteText = fromHl7 ? normaReferenceNote(row.reference) : undefined;

    const saved = await upsertReferenceRange({
      parameterId: param.rows[0].id,
      animalType,
      min: refMin,
      max: refMax,
      criticalLow: fromHl7 ? undefined : profile?.crit_low,
      criticalHigh: fromHl7 ? undefined : profile?.crit_high,
      unit: row.unit || param.rows[0].unit,
      notes: noteText,
      source: fromHl7 ? 'norma-hl7' : 'norma-profile',
      onlyIfMissing: !overwriteNorma && !fromHl7,
      force,
    });
    if (saved?.skipped_manual) protectedManual += 1;
    else updated += 1;
  }

  return { updated, skipped, protected: protectedManual };
};

/** Copy Norma OBX-7 from a sample import into LIMS test_reference_ranges for its animal type. */
const syncLimsRefsFromSample = async (sampleId, opts = {}) => {
  const { AppError } = require('../middleware/errorHandler');
  const sample = await query(
    `SELECT s.id, a.animal_type, s.sample_code
     FROM samples s
     JOIN animals a ON s.animal_id = a.id
     WHERE s.id = $1`,
    [sampleId]
  );
  if (!sample.rows[0]) throw new AppError('Sample not found', 404, 'NOT_FOUND');
  const { animal_type: animalType, sample_code: sampleCode } = sample.rows[0];

  const msg = await query(
    `SELECT id, parsed_data FROM device_messages
     WHERE sample_id = $1 AND status = 'imported' AND parsed_data IS NOT NULL
     ORDER BY created_at DESC LIMIT 1`,
    [sampleId]
  );
  if (!msg.rows[0]) throw new AppError('No Norma import found for this sample', 404, 'NOT_FOUND');

  const parsed = typeof msg.rows[0].parsed_data === 'object'
    ? msg.rows[0].parsed_data
    : JSON.parse(msg.rows[0].parsed_data);
  if (!parsed?.results?.length) throw new AppError('Norma message has no parsed results', 400, 'INVALID');

  const sync = await syncFromParsedResults({
    results: parsed.results,
    testCode: opts.testCode,
    animalType,
    overwriteNorma: true,
    force: opts.force === true,
  });

  return {
    sampleId,
    sampleCode,
    animalType,
    messageId: msg.rows[0].id,
    ...sync,
  };
};

/** Seed missing Norma profile reference ranges (does not overwrite HL7-synced values). */
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
      onlyIfMissing: true,
    });
    updated += 1;
  }
  return { updated };
};

/** Manual LIMS reference range for a parameter + animal type. */
const getLimsReferenceRange = async (parameterId, animalType) => {
  if (!parameterId || !animalType) return null;
  const result = await query(
    `SELECT min_value, max_value, critical_low, critical_high, unit, notes
     FROM test_reference_ranges trr
     WHERE trr.parameter_id = $1 AND trr.animal_type = $2
     ORDER BY ${LIMS_REF_PRIORITY_ORDER}
     LIMIT 1`,
    [parameterId, animalType]
  );
  return result.rows[0] || null;
};

const formatLimsRange = (range) => {
  if (!range || range.min_value == null || range.max_value == null) return null;
  const note = range.notes != null ? String(range.notes).trim() : '';
  if (note && !note.startsWith('Synced from') && !note.startsWith('Norma:')) return note;
  const fmt = (n) => {
    const num = Number(n);
    if (Number.isNaN(num)) return String(n);
    return Number.isInteger(num) ? String(num) : String(num).replace(/\.?0+$/, '');
  };
  return `${fmt(range.min_value)}-${fmt(range.max_value)}`;
};

module.exports = {
  upsertReferenceRange,
  syncFromParsedResults,
  syncNormaProfileForAnimal,
  syncLimsRefsFromSample,
  getLimsReferenceRange,
  formatLimsRange,
  LIMS_REF_SELECT_SQL,
  limsRefLateralJoin,
  isManualLimsNotes,
};
