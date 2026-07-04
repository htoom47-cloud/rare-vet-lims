const { query } = require('../config/database');
const { defaultCritical } = require('../utils/reference-range');
const engine = require('./reference-range-engine.service');

const {
  LIMS_REF_SELECT_SQL,
  limsRefLateralJoin,
  RANGE_PRIORITY_ORDER: LIMS_REF_PRIORITY_ORDER,
  isManualLimsNotes,
} = engine;

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
    `SELECT id, notes FROM test_reference_ranges trr
     WHERE trr.parameter_id = $1 AND trr.animal_type = $2
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

/** Manual LIMS reference range for a parameter + animal type (via Reference Range Engine). */
const getLimsReferenceRange = async (parameterId, animalType, extras = {}) => {
  const resolved = await engine.resolveReferenceRange({
    parameter_id: parameterId,
    animal_type: animalType,
    ...extras,
  });
  if (!resolved) return null;
  return {
    min_value: resolved.min_value,
    max_value: resolved.max_value,
    critical_low: resolved.critical_low,
    critical_high: resolved.critical_high,
    unit: resolved.unit,
    notes: resolved.notes,
  };
};

const formatLimsRange = (range) => {
  if (!range || range.min_value == null || range.max_value == null) return null;
  const note = range.notes != null ? String(range.notes).trim() : '';
  if (note) return note;
  const fmt = (n) => {
    const num = Number(n);
    if (Number.isNaN(num)) return String(n);
    return Number.isInteger(num) ? String(num) : String(num).replace(/\.?0+$/, '');
  };
  return `${fmt(range.min_value)}-${fmt(range.max_value)}`;
};

module.exports = {
  upsertReferenceRange,
  getLimsReferenceRange,
  formatLimsRange,
  LIMS_REF_SELECT_SQL,
  limsRefLateralJoin,
  isManualLimsNotes,
  LIMS_REF_PRIORITY_ORDER,
};
