/**
 * Reference Range Engine — single source for range selection, display, and flags.
 *
 * Priority (LIMS test_reference_ranges only — Admin Reference Ranges):
 *   1. manual active
 *   2. species-specific (animal_type match)
 *   3. general fallback (animal_type = 'other' for same parameter)
 *
 * When no Admin range exists: returns null → report shows N/A, no HIGH/LOW flag.
 */
const { query } = require('../config/database');
const { evaluateFlag } = require('../utils/helpers');

const RANGE_SOURCES = {
  LIMS_MANUAL: 'lims-manual',
  LIMS_SPECIES: 'lims-species',
  LIMS_GENERAL: 'lims-general',
};

const isSyncedOrNormaNotes = (notes) => {
  const n = String(notes || '').trim();
  if (!n) return false;
  return n.startsWith('Synced from') || n.startsWith('Norma:') || n.startsWith('Species default');
};

const isManualLimsNotes = (notes) => {
  const n = String(notes || '').trim();
  if (!n) return false;
  return !isSyncedOrNormaNotes(n);
};

const isActiveRange = (row) => row?.is_active !== false;

const parseAnimalAgeYears = (ageRaw) => {
  if (ageRaw == null || ageRaw === '') return null;
  const m = String(ageRaw).match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
};

const normalizeSex = (sex) => {
  const s = String(sex || '').trim().toLowerCase();
  if (!s || s === 'unknown') return null;
  return s;
};

const ageMatchesRange = (ageYears, row) => {
  if (ageYears == null) return true;
  if (row?.age_min == null && row?.age_max == null) return true;
  const min = row.age_min != null ? Number(row.age_min) : null;
  const max = row.age_max != null ? Number(row.age_max) : null;
  if (min != null && ageYears < min) return false;
  if (max != null && ageYears > max) return false;
  return true;
};

const sexMatchesRange = (sex, row) => {
  const want = normalizeSex(sex);
  if (!want) return true;
  const rowSex = normalizeSex(row?.sex);
  if (!rowSex) return true;
  return rowSex === want;
};

const deviceMatchesRange = (deviceId, row) => {
  if (!deviceId) return true;
  if (!row?.device_id) return true;
  return String(row.device_id) === String(deviceId);
};

const classifyLimsTier = (row) => {
  if (!row || !isActiveRange(row)) return null;
  if (row.created_by) return RANGE_SOURCES.LIMS_MANUAL;
  if (isManualLimsNotes(row.notes)) return RANGE_SOURCES.LIMS_MANUAL;
  if (row.animal_type && row.animal_type !== 'other') return RANGE_SOURCES.LIMS_SPECIES;
  return RANGE_SOURCES.LIMS_GENERAL;
};

const rowFromLimsPrefixes = (row) => {
  if (!row) return null;
  const hasBounds = row.trr_min != null && row.trr_max != null;
  const hasText = row.trr_text_reference != null && String(row.trr_text_reference).trim() !== '';
  if (!hasBounds && !hasText) return null;

  return {
    id: row.trr_id,
    parameter_id: row.parameter_id,
    animal_type: row.trr_animal_type,
    min_value: row.trr_min != null ? Number(row.trr_min) : null,
    max_value: row.trr_max != null ? Number(row.trr_max) : null,
    critical_low: row.trr_critical_low != null ? Number(row.trr_critical_low) : null,
    critical_high: row.trr_critical_high != null ? Number(row.trr_critical_high) : null,
    notes: row.trr_notes,
    text_reference: row.trr_text_reference,
    unit: row.trr_unit,
    sex: row.trr_sex,
    age_min: row.trr_age_min,
    age_max: row.trr_age_max,
    age_unit: row.trr_age_unit,
    device_id: row.trr_device_id,
    is_active: row.trr_is_active,
    created_by: row.trr_created_by ?? row.created_by ?? null,
  };
};

const normalizeLimsRow = (row, source) => ({
  source,
  id: row.id,
  parameter_id: row.parameter_id,
  animal_type: row.animal_type,
  min_value: row.min_value != null ? Number(row.min_value) : null,
  max_value: row.max_value != null ? Number(row.max_value) : null,
  critical_low: row.critical_low != null ? Number(row.critical_low) : null,
  critical_high: row.critical_high != null ? Number(row.critical_high) : null,
  text_reference: row.text_reference,
  unit: row.unit,
  notes: row.notes,
});


/**
 * SQL ORDER BY tier: manual → species → general; then demographic specificity.
 * Used inside limsRefLateralJoin / engineRefLateralJoin.
 */
const RANGE_PRIORITY_ORDER = `
  CASE
    WHEN trr.created_by IS NOT NULL THEN 0
    WHEN trr.notes IS NOT NULL
      AND TRIM(trr.notes) <> ''
      AND trr.notes NOT LIKE 'Synced from%'
      AND trr.notes NOT LIKE 'Norma:%'
      AND trr.notes NOT LIKE 'Species default%' THEN 1
    WHEN trr.animal_type IS NOT NULL AND trr.animal_type::text <> 'other' THEN 2
    ELSE 3
  END,
  CASE
    WHEN trr.sex IS NULL OR trr.sex = '' THEN 1
    ELSE 0
  END,
  CASE
    WHEN trr.age_min IS NULL AND trr.age_max IS NULL THEN 1
    ELSE 0
  END,
  trr.id DESC`;

const ENGINE_REF_SELECT_SQL = `
  trr.id AS trr_id,
  trr.min_value AS trr_min,
  trr.max_value AS trr_max,
  trr.critical_low AS trr_critical_low,
  trr.critical_high AS trr_critical_high,
  trr.notes AS trr_notes,
  trr.text_reference AS trr_text_reference,
  trr.unit AS trr_unit,
  trr.sex AS trr_sex,
  trr.age_min AS trr_age_min,
  trr.age_max AS trr_age_max,
  trr.age_unit AS trr_age_unit,
  trr.device_id AS trr_device_id,
  trr.is_active AS trr_is_active,
  trr.animal_type AS trr_animal_type,
  trr.created_by AS trr_created_by`;

/** Backward-compatible alias for reports/results queries. */
const LIMS_REF_SELECT_SQL = ENGINE_REF_SELECT_SQL;

const engineRefLateralJoin = (
  paramExpr = 'tp.id',
  speciesExpr = 'a.animal_type',
  sexExpr = 'a.gender',
  deviceExpr = null
) => `
  LEFT JOIN LATERAL (
    SELECT
      trr.id, trr.min_value, trr.max_value, trr.critical_low, trr.critical_high,
      trr.notes, trr.text_reference, trr.unit, trr.sex, trr.age_min, trr.age_max,
      trr.age_unit, trr.device_id, trr.is_active, trr.animal_type, trr.created_by
    FROM test_reference_ranges trr
    WHERE trr.parameter_id = ${paramExpr}
      AND (trr.is_active IS NULL OR trr.is_active = true)
      AND (
        trr.animal_type = ${speciesExpr}
        OR trr.animal_type = 'other'
      )
      AND (
        trr.sex IS NULL OR trr.sex = '' OR LOWER(trr.sex) = LOWER(${sexExpr}::text)
      )
      AND (
        ${deviceExpr
    ? `(trr.device_id IS NULL OR trr.device_id = ${deviceExpr})`
    : 'TRUE'}
      )
    ORDER BY
      CASE WHEN trr.animal_type = ${speciesExpr} THEN 0 ELSE 1 END,
      ${RANGE_PRIORITY_ORDER}
    LIMIT 1
  ) trr ON true`;

const limsRefLateralJoin = engineRefLateralJoin;

const scoreLimsCandidate = (row, context) => {
  if (!row || !isActiveRange(row)) return -1;
  if (String(row.parameter_id) !== String(context.parameter_id)) return -1;

  const species = context.animal_type || context.species;
  const isSpeciesRow = species && row.animal_type === species;
  const isGeneralRow = row.animal_type === 'other';
  if (!isSpeciesRow && !isGeneralRow) return -1;

  if (!sexMatchesRange(context.sex, row)) return -1;
  if (!ageMatchesRange(parseAnimalAgeYears(context.age), row)) return -1;
  if (!deviceMatchesRange(context.device_id, row)) return -1;

  const tier = classifyLimsTier(row);
  if (!tier) return -1;

  let score = 0;
  if (row.created_by) score += 3000;
  else if (tier === RANGE_SOURCES.LIMS_MANUAL) score += 1000;
  else if (tier === RANGE_SOURCES.LIMS_SPECIES) score += 500;
  else score += 100;
  if (isSpeciesRow) score += 50;
  if (row.sex) score += 10;
  if (row.age_min != null || row.age_max != null) score += 10;
  if (context.test_id && row.test_id && String(row.test_id) === String(context.test_id)) score += 5;
  return score;
};

const pickBestLimsRow = (rows, context) => {
  let best = null;
  let bestScore = -1;
  for (const row of rows) {
    const score = scoreLimsCandidate(row, context);
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }
  if (!best) return null;
  return normalizeLimsRow(best, classifyLimsTier(best));
};

const fetchLimsCandidates = async (context) => {
  const { parameter_id, animal_type, species } = context;
  const sp = animal_type || species;
  if (!parameter_id || !sp) return [];

  const result = await query(
    `SELECT trr.*, tp.test_id
     FROM test_reference_ranges trr
     JOIN test_parameters tp ON tp.id = trr.parameter_id
     WHERE trr.parameter_id = $1
       AND (trr.is_active IS NULL OR trr.is_active = true)
       AND trr.animal_type IN ($2, 'other')`,
    [parameter_id, sp]
  );
  return result.rows;
};


/**
 * Resolve range from a SQL row (lateral join prefixes trr_*).
 */
const resolveReferenceRangeFromRow = (context = {}) => {
  const { row } = context;
  const limsRaw = rowFromLimsPrefixes(row);
  if (limsRaw) {
    const tier = classifyLimsTier(limsRaw);
    if (tier && sexMatchesRange(row?.gender || row?.animal_gender, limsRaw)
      && ageMatchesRange(parseAnimalAgeYears(row?.age || row?.animal_age), limsRaw)) {
      return normalizeLimsRow(limsRaw, tier);
    }
  }
  return null;
};

/**
 * Resolve reference range (async DB path or sync from row).
 * @param {object} context
 * @param {string} context.parameter_id
 * @param {string} [context.animal_type] — species
 * @param {string} [context.test_id]
 * @param {string} [context.sex] — male/female
 * @param {string|number} [context.age]
 * @param {string} [context.device_id]
 * @param {object} [context.row] — if set, uses sync path first
 */
const resolveReferenceRange = async (context = {}) => {
  if (context.row) {
    const fromRow = resolveReferenceRangeFromRow(context);
    if (fromRow) return fromRow;
  }

  const limsRows = await fetchLimsCandidates(context);
  const lims = pickBestLimsRow(limsRows, context);
  return lims || null;
};

const formatReferenceRange = (range) => {
  if (!range) return null;
  if (range.text_reference) return String(range.text_reference).trim();
  if (range.min_value != null && range.max_value != null) {
    const fmt = (n) => {
      const num = Number(n);
      if (Number.isNaN(num)) return String(n);
      return Number.isInteger(num) ? String(num) : String(num).replace(/\.?0+$/, '');
    };
    return `${fmt(range.min_value)}-${fmt(range.max_value)}`;
  }
  const note = range.notes != null ? String(range.notes).trim() : '';
  if (note && isManualLimsNotes(note)) return note;
  return null;
};

const evaluateResultFlag = (value, range) => {
  if (value == null || value === '') return { flag: '', isCritical: false };
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (Number.isNaN(num)) return { flag: '', isCritical: false };
  if (!range || range.min_value == null || range.max_value == null) {
    return { flag: '', isCritical: false };
  }
  return evaluateFlag(
    num,
    range.min_value,
    range.max_value,
    range.critical_low,
    range.critical_high
  );
};

/** Report bounds helper — same shape as legacy resolveReportReferenceBounds. */
const resolveReportReferenceBounds = (row) => {
  const range = resolveReferenceRangeFromRow({ row });
  if (!range) return { min: null, max: null };
  return { min: range.min_value, max: range.max_value };
};

const resolveReportReferenceDisplay = (row) => {
  const range = resolveReferenceRangeFromRow({ row });
  return formatReferenceRange(range);
};

module.exports = {
  RANGE_SOURCES,
  RANGE_PRIORITY_ORDER,
  ENGINE_REF_SELECT_SQL,
  LIMS_REF_SELECT_SQL,
  engineRefLateralJoin,
  limsRefLateralJoin,
  isManualLimsNotes,
  resolveReferenceRange,
  resolveReferenceRangeFromRow,
  formatReferenceRange,
  evaluateResultFlag,
  resolveReportReferenceBounds,
  resolveReportReferenceDisplay,
  parseAnimalAgeYears,
  pickBestLimsRow,
};
