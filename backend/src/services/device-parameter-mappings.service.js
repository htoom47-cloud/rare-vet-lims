const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const mappingEngine = require('./device-mapping-engine.service');

const list = async ({ device_id, device_name, search, page = 1, limit = 200 } = {}) => {
  const params = [];
  const where = ['dpm.is_active = true'];

  if (device_id) {
    params.push(device_id);
    where.push(`dpm.device_id = $${params.length}`);
  }
  if (device_name) {
    params.push(`%${device_name}%`);
    where.push(`dpm.device_name ILIKE $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(dpm.device_parameter_code ILIKE $${params.length} OR tp.code ILIKE $${params.length})`);
  }

  const offset = (Math.max(1, page) - 1) * limit;
  params.push(limit, offset);

  const result = await query(
    `SELECT dpm.*, tp.code AS system_parameter_code, tp.name AS system_parameter_name
     FROM device_parameter_mappings dpm
     LEFT JOIN test_parameters tp ON tp.id = dpm.system_parameter_id
     WHERE ${where.join(' AND ')}
     ORDER BY dpm.device_name, dpm.device_parameter_code
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const countParams = params.slice(0, -2);
  const count = await query(
    `SELECT COUNT(*)::int AS total FROM device_parameter_mappings dpm WHERE ${where.join(' AND ')}`,
    countParams
  );

  return { rows: result.rows, total: count.rows[0]?.total || 0, page, limit };
};

const resolveLimsCode = async ({ deviceId, deviceName, deviceParameterCode, unit }) => {
  const mapping = await mappingEngine.resolveDeviceParameterMapping(
    deviceId,
    deviceParameterCode,
    { deviceName, unit }
  );
  return mapping?.system_parameter_code || null;
};

const upsert = async (data, userId) => {
  const {
    device_id, device_name, device_parameter_code, system_parameter_id,
    display_name_ar, display_name_en, unit, value_type, sort_order,
  } = data;

  if (!device_parameter_code || !system_parameter_id) {
    throw new AppError('Device parameter code and system parameter required', 400, 'VALIDATION');
  }

  if (data.id) {
    const byId = await query('SELECT id FROM device_parameter_mappings WHERE id = $1', [data.id]);
    if (byId.rows[0]) {
      const updated = await query(
        `UPDATE device_parameter_mappings
         SET device_id = COALESCE($1, device_id),
             device_name = COALESCE($2, device_name),
             device_parameter_code = COALESCE($3, device_parameter_code),
             system_parameter_id = COALESCE($4, system_parameter_id),
             display_name_ar = COALESCE($5, display_name_ar),
             display_name_en = COALESCE($6, display_name_en),
             unit = COALESCE($7, unit),
             value_type = COALESCE($8, value_type),
             sort_order = COALESCE($9, sort_order),
             updated_at = NOW()
         WHERE id = $10 RETURNING *`,
        [
          device_id ?? null, device_name, device_parameter_code, system_parameter_id,
          display_name_ar, display_name_en, unit, value_type, sort_order, data.id,
        ]
      );
      return updated.rows[0];
    }
  }

  const existing = await query(
    `SELECT id FROM device_parameter_mappings
     WHERE device_id IS NOT DISTINCT FROM $1
       AND UPPER(device_parameter_code) = UPPER($2)
       AND is_active = true`,
    [device_id || null, device_parameter_code]
  );

  if (existing.rows[0]) {
    const updated = await query(
      `UPDATE device_parameter_mappings
       SET system_parameter_id = $1, display_name_ar = $2, display_name_en = $3,
           unit = $4, value_type = $5, sort_order = COALESCE($6, sort_order),
           device_name = COALESCE($7, device_name),
           updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [system_parameter_id, display_name_ar, display_name_en, unit, value_type,
        sort_order, device_name, existing.rows[0].id]
    );
    return updated.rows[0];
  }

  const inserted = await query(
    `INSERT INTO device_parameter_mappings
       (device_id, device_name, device_parameter_code, system_parameter_id,
        display_name_ar, display_name_en, unit, value_type, sort_order, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [device_id || null, device_name || 'Norma CBC', device_parameter_code,
      system_parameter_id, display_name_ar, display_name_en, unit, value_type || 'numeric',
      sort_order ?? 0, userId]
  );
  return inserted.rows[0];
};

const deactivate = async (id) => {
  const result = await query(
    `UPDATE device_parameter_mappings SET is_active = false, updated_at = NOW()
     WHERE id = $1 RETURNING id`,
    [id]
  );
  if (!result.rows[0]) throw new AppError('Mapping not found', 404, 'NOT_FOUND');
  return { deleted: true };
};

/** Seed Norma CBC mappings from code map when table is empty. */
const seedNormaCbcMappings = async (client) => {
  const count = await client.query('SELECT COUNT(*)::int AS n FROM device_parameter_mappings');
  if (count.rows[0]?.n > 0) return { seeded: 0 };

  const device = await client.query(
    `SELECT id, name FROM device_integrations WHERE name ILIKE '%norma%' LIMIT 1`
  );
  const deviceId = device.rows[0]?.id || null;
  const deviceName = device.rows[0]?.name || 'Norma CBC';

  const params = await client.query(
    `SELECT tp.id, tp.code FROM test_parameters tp
     JOIN tests t ON t.id = tp.test_id WHERE t.code = 'CBC-FULL'`
  );
  const byCode = Object.fromEntries(params.rows.map((p) => [p.code, p.id]));

  const NORMA_CODES = [
    ['WBC', 'WBC', 'count'], ['LYM', 'LYM', 'count'], ['MON', 'MON', 'count'],
    ['NEU', 'NEU', 'count'], ['EOS', 'EOS', 'count'], ['BAS', 'BAS', 'count'],
    ['LYM%', 'LYM_PCT', 'percentage'], ['MON%', 'MON_PCT', 'percentage'],
    ['NEU%', 'NEU_PCT', 'percentage'], ['EOS%', 'EOS_PCT', 'percentage'],
    ['BAS%', 'BAS_PCT', 'percentage'],
    ['RBC', 'RBC', 'count'], ['HGB', 'HGB', 'numeric'], ['HCT', 'HCT', 'percentage'],
    ['MCV', 'MCV', 'numeric'], ['MCH', 'MCH', 'numeric'], ['MCHC', 'MCHC', 'numeric'],
    ['RDW-CV', 'RDW-CV', 'numeric'], ['RDW-SD', 'RDW-SD', 'numeric'],
    ['PLT', 'PLT', 'count'], ['MPV', 'MPV', 'numeric'], ['PCT', 'PCT', 'percentage'],
    ['PDW-CV', 'PDW-CV', 'numeric'], ['PDW-SD', 'PDW-SD', 'numeric'],
    ['PLC-R', 'PLC-R', 'percentage'], ['PLC-C', 'PLC-C', 'count'],
  ];

  let seeded = 0;
  for (const [deviceCode, limsCode, valueType] of NORMA_CODES) {
    const paramId = byCode[limsCode];
    if (!paramId) continue;
    await client.query(
      `INSERT INTO device_parameter_mappings
         (device_id, device_name, device_parameter_code, system_parameter_id, value_type, is_active)
       VALUES ($1,$2,$3,$4,$5,true)
       ON CONFLICT DO NOTHING`,
      [deviceId, deviceName, deviceCode, paramId, valueType]
    );
    seeded += 1;
  }
  return { seeded };
};

module.exports = {
  list,
  resolveLimsCode,
  upsert,
  deactivate,
  seedNormaCbcMappings,
};
