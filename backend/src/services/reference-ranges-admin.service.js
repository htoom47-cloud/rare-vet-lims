const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { defaultCritical } = require('../utils/reference-range');
const { paginate, buildPagination } = require('../utils/helpers');
const { validateMinMax } = require('./parameter-display.utils');

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

  return { rows: result.rows, pagination: buildPagination(count.rows[0]?.total || 0, p, l) };
};

const create = async (body, userId) => {
  const {
    parameter_id, animal_type, min_value, max_value, critical_low, critical_high,
    unit, notes, text_reference, sex, age_min, age_max, age_unit, device_id,
  } = body;

  if (!parameter_id || !animal_type) {
    throw new AppError('Parameter and species required', 400, 'VALIDATION');
  }

  const rangeError = validateMinMax(min_value, max_value);
  if (rangeError) throw new AppError(rangeError, 400, 'INVALID_RANGE');

  const dup = await query(
    `SELECT id FROM test_reference_ranges
     WHERE parameter_id = $1 AND animal_type = $2
       AND COALESCE(sex, '') = COALESCE($3, '')
       AND COALESCE(device_id::text, '') = COALESCE($4::text, '')
       AND is_active = true`,
    [parameter_id, animal_type, sex || null, device_id || null]
  );
  if (dup.rows[0]) throw new AppError('Duplicate reference range', 409, 'DUPLICATE');

  const crit = defaultCritical(min_value, max_value);
  const result = await query(
    `INSERT INTO test_reference_ranges
       (parameter_id, animal_type, min_value, max_value, critical_low, critical_high,
        unit, notes, text_reference, sex, age_min, age_max, age_unit, device_id,
        created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15) RETURNING *`,
    [parameter_id, animal_type, min_value, max_value,
      critical_low ?? crit.crit_low, critical_high ?? crit.crit_high,
      unit, notes, text_reference, sex || null, age_min, age_max, age_unit, device_id || null, userId]
  );

  await logChange(result.rows[0].id, userId, 'create', null, result.rows[0]);
  const lifecycle = require('./report-lifecycle.service');
  await lifecycle.markReportsNeedsUpdateByParameterId(parameter_id, 'REFERENCE');
  return result.rows[0];
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
