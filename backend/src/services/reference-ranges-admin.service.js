const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { defaultCritical } = require('../utils/reference-range');
const { paginate, buildPagination } = require('../utils/helpers');
const { validateMinMax } = require('./parameter-display.utils');
const { DEFAULT_CBC_TEST_CODE } = require('../utils/norma-cbc-map');
const {
  cbcReferenceDisplayCode,
  CBC_ABS_DIFF_CODES,
  isPercentLikeRange,
} = require('../utils/cbc-reference-params');

const logChange = async (rangeId, userId, action, oldValue, newValue) => {
  await query(
    `INSERT INTO reference_range_audit_logs (reference_range_id, user_id, action, old_value, new_value)
     VALUES ($1, $2, $3, $4, $5)`,
    [rangeId, userId, action, oldValue ? JSON.stringify(oldValue) : null, newValue ? JSON.stringify(newValue) : null]
  );
};

const list = async ({ species, test_id, parameter_id, search, device_id, page, limit, include_inactive }) => {
  const { offset, page: p, limit: l } = paginate(page, limit);
  const params = [];
  const where = include_inactive === 'true' || include_inactive === true ? [] : ['trr.is_active = true'];

  if (species) {
    params.push(species);
    where.push(`trr.animal_type = $${params.length}`);
  }
  if (test_id) {
    params.push(test_id);
    where.push(`tp.test_id = $${params.length}`);
  }
  if (parameter_id) {
    params.push(parameter_id);
    where.push(`trr.parameter_id = $${params.length}`);
  }
  if (device_id) {
    params.push(device_id);
    where.push(`trr.device_id = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(tp.code ILIKE $${params.length} OR tp.name ILIKE $${params.length} OR di.name ILIKE $${params.length})`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  params.push(l, offset);
  const result = await query(
    `SELECT trr.*, tp.code AS parameter_code, tp.name AS parameter_name, tp.name_ar AS parameter_name_ar,
            t.id AS test_id, t.code AS test_code, t.name AS test_name,
            di.name AS device_name
     FROM test_reference_ranges trr
     JOIN test_parameters tp ON tp.id = trr.parameter_id
     JOIN tests t ON t.id = tp.test_id
     LEFT JOIN device_integrations di ON di.id = trr.device_id
     ${whereSql}
     ORDER BY t.code, tp.sort_order, trr.animal_type
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const countParams = params.slice(0, -2);
  const count = await query(
    `SELECT COUNT(*)::int AS total
     FROM test_reference_ranges trr
     JOIN test_parameters tp ON tp.id = trr.parameter_id
     ${whereSql}`,
    countParams
  );

  return {
    rows: result.rows.map((row) => {
      const isCbc = row.test_code === DEFAULT_CBC_TEST_CODE;
      const display = isCbc ? cbcReferenceDisplayCode(row.parameter_code) : row.parameter_code;
      const misplaced = isCbc
        && CBC_ABS_DIFF_CODES.has(row.parameter_code)
        && isPercentLikeRange(row.min_value, row.max_value, row.unit);
      return {
        ...row,
        parameter_display: display,
        parameter_misplaced: misplaced,
      };
    }),
    pagination: buildPagination(count.rows[0]?.total || 0, p, l),
  };
};

const speciesService = require('./animal-species.service');

const create = async (body, userId) => {
  const {
    parameter_id, animal_type, min_value, max_value, critical_low, critical_high,
    unit, notes, text_reference, sex, age_min, age_max, age_unit, device_id,
  } = body;

  if (!parameter_id || !animal_type) {
    throw new AppError('Parameter and species required', 400, 'VALIDATION');
  }

  const speciesCode = await speciesService.assertActiveSpecies(animal_type);

  const rangeError = validateMinMax(min_value, max_value);
  if (rangeError) throw new AppError(rangeError, 400, 'INVALID_RANGE');

  const dupActive = await query(
    `SELECT id FROM test_reference_ranges
     WHERE parameter_id = $1 AND animal_type = $2
       AND COALESCE(sex, '') = COALESCE($3, '')
       AND COALESCE(device_id::text, '') = COALESCE($4::text, '')
       AND is_active = true`,
    [parameter_id, speciesCode, sex || null, device_id || null]
  );
  if (dupActive.rows[0]) throw new AppError('Duplicate reference range', 409, 'DUPLICATE');

  const crit = defaultCritical(min_value, max_value);
  const cLow = critical_low ?? crit.crit_low;
  const cHigh = critical_high ?? crit.crit_high;

  // Inactive row still occupies unique (parameter_id, animal_type) — reactivate instead of INSERT.
  const inactive = await query(
    `SELECT * FROM test_reference_ranges
     WHERE parameter_id = $1 AND animal_type = $2
       AND COALESCE(sex, '') = COALESCE($3, '')
       AND COALESCE(device_id::text, '') = COALESCE($4::text, '')
       AND is_active = false
     ORDER BY updated_at DESC NULLS LAST
     LIMIT 1`,
    [parameter_id, speciesCode, sex || null, device_id || null]
  );

  let row;
  if (inactive.rows[0]) {
    const result = await query(
      `UPDATE test_reference_ranges SET
         min_value = $1, max_value = $2, critical_low = $3, critical_high = $4,
         unit = COALESCE($5, unit), notes = COALESCE($6, notes),
         text_reference = COALESCE($7, text_reference),
         age_min = COALESCE($8, age_min), age_max = COALESCE($9, age_max),
         age_unit = COALESCE($10, age_unit),
         is_active = true, updated_by = $11, updated_at = NOW()
       WHERE id = $12 RETURNING *`,
      [min_value, max_value, cLow, cHigh, unit, notes, text_reference,
        age_min, age_max, age_unit, userId, inactive.rows[0].id]
    );
    row = result.rows[0];
    await logChange(row.id, userId, 'reactivate', inactive.rows[0], row);
  } else {
    const result = await query(
      `INSERT INTO test_reference_ranges
         (parameter_id, animal_type, min_value, max_value, critical_low, critical_high,
          unit, notes, text_reference, sex, age_min, age_max, age_unit, device_id,
          created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15) RETURNING *`,
      [parameter_id, speciesCode, min_value, max_value, cLow, cHigh,
        unit, notes, text_reference, sex || null, age_min, age_max, age_unit, device_id || null, userId]
    );
    row = result.rows[0];
    await logChange(row.id, userId, 'create', null, row);
  }

  const lifecycle = require('./report-lifecycle.service');
  await lifecycle.markReportsNeedsUpdateByParameterId(parameter_id, 'REFERENCE');
  return row;
};

const update = async (id, body, userId) => {
  const existing = await query('SELECT * FROM test_reference_ranges WHERE id = $1', [id]);
  if (!existing.rows[0]) throw new AppError('Reference range not found', 404, 'NOT_FOUND');

  const minVal = body.min_value ?? existing.rows[0].min_value;
  const maxVal = body.max_value ?? existing.rows[0].max_value;
  const rangeError = validateMinMax(minVal, maxVal);
  if (rangeError) throw new AppError(rangeError, 400, 'INVALID_RANGE');

  const crit = defaultCritical(body.min_value ?? existing.rows[0].min_value, body.max_value ?? existing.rows[0].max_value);
  const result = await query(
    `UPDATE test_reference_ranges SET
       min_value = COALESCE($1, min_value),
       max_value = COALESCE($2, max_value),
       critical_low = COALESCE($3, critical_low),
       critical_high = COALESCE($4, critical_high),
       unit = COALESCE($5, unit),
       notes = COALESCE($6, notes),
       text_reference = COALESCE($7, text_reference),
       sex = COALESCE($8, sex),
       age_min = COALESCE($9, age_min),
       age_max = COALESCE($10, age_max),
       age_unit = COALESCE($11, age_unit),
       device_id = COALESCE($12, device_id),
       updated_by = $13,
       updated_at = NOW()
     WHERE id = $14 RETURNING *`,
    [body.min_value, body.max_value, body.critical_low ?? crit.crit_low, body.critical_high ?? crit.crit_high,
      body.unit, body.notes, body.text_reference, body.sex, body.age_min, body.age_max, body.age_unit,
      body.device_id, userId, id]
  );

  await logChange(id, userId, 'update', existing.rows[0], result.rows[0]);
  const lifecycle = require('./report-lifecycle.service');
  await lifecycle.markReportsNeedsUpdateByParameterId(existing.rows[0].parameter_id, 'REFERENCE');
  return result.rows[0];
};

const deactivate = async (id, userId) => {
  const existing = await query('SELECT * FROM test_reference_ranges WHERE id = $1', [id]);
  if (!existing.rows[0]) throw new AppError('Reference range not found', 404, 'NOT_FOUND');

  await query(
    'UPDATE test_reference_ranges SET is_active = false, updated_by = $1, updated_at = NOW() WHERE id = $2',
    [userId, id]
  );
  await logChange(id, userId, 'deactivate', existing.rows[0], { is_active: false });
  const lifecycle = require('./report-lifecycle.service');
  await lifecycle.markReportsNeedsUpdateByParameterId(existing.rows[0].parameter_id, 'REFERENCE');
  return { deleted: true };
};

const listLogs = async (rangeId) => {
  const result = await query(
    `SELECT l.*, u.full_name AS user_name
     FROM reference_range_audit_logs l
     LEFT JOIN users u ON u.id = l.user_id
     WHERE l.reference_range_id = $1
     ORDER BY l.created_at DESC LIMIT 50`,
    [rangeId]
  );
  return result.rows;
};

module.exports = { list, create, update, deactivate, listLogs };
