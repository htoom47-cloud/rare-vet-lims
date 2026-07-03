/**
 * Admin CRUD for test parameter display fields & device mapping context.
 */
const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { paginate, buildPagination } = require('../utils/helpers');
const deviceMappings = require('./device-parameter-mappings.service');

const listParameters = async ({ test_id, search, page, limit, include_hidden = false }) => {
  const { offset, page: p, limit: l } = paginate(page, limit);
  const params = [];
  const where = ['tp.is_active = true'];
  if (!include_hidden) where.push('COALESCE(tp.show_in_report, true) = true');
  if (test_id) {
    params.push(test_id);
    where.push(`tp.test_id = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(tp.code ILIKE $${params.length} OR tp.name ILIKE $${params.length} OR tp.name_ar ILIKE $${params.length})`);
  }
  params.push(l, offset);

  const result = await query(
    `SELECT tp.*, t.code AS test_code, t.name AS test_name,
            dpm.device_parameter_code AS mapped_device_code,
            dpm.display_name_ar AS mapped_name_ar,
            dpm.display_name_en AS mapped_name_en
     FROM test_parameters tp
     JOIN tests t ON t.id = tp.test_id
     LEFT JOIN LATERAL (
       SELECT device_parameter_code, display_name_ar, display_name_en
       FROM device_parameter_mappings
       WHERE system_parameter_id = tp.id AND is_active = true
       ORDER BY updated_at DESC NULLS LAST
       LIMIT 1
     ) dpm ON true
     WHERE ${where.join(' AND ')}
     ORDER BY t.code, tp.sort_order, tp.code
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const countParams = params.slice(0, -2);
  const count = await query(
    `SELECT COUNT(*)::int AS total FROM test_parameters tp WHERE ${where.join(' AND ')}`,
    countParams
  );

  return { rows: result.rows, pagination: buildPagination(count.rows[0]?.total || 0, p, l) };
};

const updateParameter = async (id, body) => {
  const existing = await query('SELECT * FROM test_parameters WHERE id = $1', [id]);
  if (!existing.rows[0]) throw new AppError('Parameter not found', 404, 'NOT_FOUND');

  const result = await query(
    `UPDATE test_parameters SET
       code = COALESCE($1, code),
       name = COALESCE($2, name),
       name_ar = COALESCE($3, name_ar),
       unit = COALESCE($4, unit),
       sort_order = COALESCE($5, sort_order),
       device_code = COALESCE($6, device_code),
       short_code = COALESCE($7, short_code),
       show_in_report = COALESCE($8, show_in_report),
       value_type = COALESCE($9, value_type),
       category = COALESCE($10, category)
     WHERE id = $11 RETURNING *`,
    [
      body.code,
      body.name,
      body.name_ar,
      body.unit,
      body.sort_order,
      body.device_code,
      body.short_code,
      body.show_in_report,
      body.value_type,
      body.category,
      id,
    ]
  );
  return result.rows[0];
};

const loadReportDisplayContext = async () => {
  const result = await query(
    `SELECT dpm.system_parameter_id, dpm.device_parameter_code,
            dpm.display_name_ar, dpm.display_name_en, dpm.unit, dpm.value_type,
            tp.device_code AS param_device_code, tp.short_code, tp.show_in_report
     FROM device_parameter_mappings dpm
     JOIN test_parameters tp ON tp.id = dpm.system_parameter_id
     WHERE dpm.is_active = true`
  );

  const deviceCodeMap = {};
  const displayNameArMap = {};
  const displayNameEnMap = {};
  const valueTypeMap = {};
  const showInReportMap = {};

  result.rows.forEach((row) => {
    const pid = row.system_parameter_id;
    deviceCodeMap[pid] = row.device_parameter_code || row.param_device_code || row.short_code;
    if (row.display_name_ar) displayNameArMap[pid] = row.display_name_ar;
    if (row.display_name_en) displayNameEnMap[pid] = row.display_name_en;
    if (row.value_type) valueTypeMap[pid] = row.value_type;
    showInReportMap[pid] = row.show_in_report !== false;
  });

  const params = await query(
    `SELECT id, code, device_code, short_code, name_ar, name, show_in_report, value_type
     FROM test_parameters WHERE is_active = true`
  );
  params.rows.forEach((p) => {
    if (!deviceCodeMap[p.id]) {
      deviceCodeMap[p.id] = p.device_code || p.short_code || p.code;
    }
    if (!displayNameArMap[p.id] && p.name_ar) displayNameArMap[p.id] = p.name_ar;
    if (!displayNameEnMap[p.id] && p.name) displayNameEnMap[p.id] = p.name;
    if (!valueTypeMap[p.id] && p.value_type) valueTypeMap[p.id] = p.value_type;
    if (showInReportMap[p.id] === undefined) showInReportMap[p.id] = p.show_in_report !== false;
  });

  return { deviceCodeMap, displayNameArMap, displayNameEnMap, valueTypeMap, showInReportMap };
};

module.exports = {
  listParameters,
  updateParameter,
  loadReportDisplayContext,
  listMappings: deviceMappings.list,
  upsertMapping: deviceMappings.upsert,
  deactivateMapping: deviceMappings.deactivate,
};
