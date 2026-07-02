/**
 * Device reference ranges — Norma CBC normal ranges stored per device/species/parameter.
 * Never deletes rows; changes are logged in device_reference_range_logs.
 */
const { query } = require('../config/database');
const logger = require('../config/logger');
const { resolveNormaResultLimsCode } = require('../utils/norma-cbc-map');
const { mapNormaSpeciesToRefSpecies } = require('../utils/norma-species-map');
const { normaReferenceNote } = require('../utils/reference-range');
const referenceRangesService = require('./reference-ranges.service');

const DEFAULT_DEVICE_NAME = 'Norma CBC';

const resolveSpecies = (parsed, fallbackSpecies) => {
  const imp = parsed?.import || {};
  const candidates = [
    imp.reference_animal_type,
    parsed?.animalType,
    imp.norma_animal_type,
    fallbackSpecies,
  ];
  for (const raw of candidates) {
    const mapped = mapNormaSpeciesToRefSpecies(raw) || raw;
    if (mapped && mapped !== 'other') return mapped;
  }
  return fallbackSpecies || 'camel';
};

const logRangeChange = async ({
  rangeId,
  deviceName,
  parameterCode,
  species,
  unit,
  oldLow,
  oldHigh,
  newLow,
  newHigh,
  messageId,
  reason = 'device_sync',
}) => {
  if (oldLow == null && oldHigh == null) return;
  if (Number(oldLow) === Number(newLow) && Number(oldHigh) === Number(newHigh)) return;

  await query(
    `INSERT INTO device_reference_range_logs
       (device_reference_range_id, device_name, parameter_code, species, unit,
        old_low_value, old_high_value, new_low_value, new_high_value, change_reason, message_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [rangeId, deviceName, parameterCode, species, unit || null,
      oldLow, oldHigh, newLow, newHigh, reason, messageId || null]
  );
};

const upsertDeviceReferenceRange = async ({
  deviceName,
  deviceId,
  parameterCode,
  parameterName,
  species,
  unit,
  lowValue,
  highValue,
  source = 'device',
  messageId,
}) => {
  if (!parameterCode || !species || lowValue == null || highValue == null) return null;

  const unitKey = unit || '';
  const existing = await query(
    `SELECT id, low_value, high_value FROM device_reference_ranges
     WHERE device_name = $1 AND parameter_code = $2 AND species = $3
       AND COALESCE(unit, '') = $4`,
    [deviceName, parameterCode, species, unitKey]
  );

  if (existing.rows[0]) {
    const row = existing.rows[0];
    await logRangeChange({
      rangeId: row.id,
      deviceName,
      parameterCode,
      species,
      unit: unitKey,
      oldLow: row.low_value,
      oldHigh: row.high_value,
      newLow: lowValue,
      newHigh: highValue,
      messageId,
    });

    const updated = await query(
      `UPDATE device_reference_ranges
       SET parameter_name = COALESCE($1, parameter_name),
           low_value = $2, high_value = $3, source = $4,
           last_synced_at = NOW(), updated_at = NOW(),
           device_id = COALESCE($5, device_id)
       WHERE id = $6 RETURNING *`,
      [parameterName, lowValue, highValue, source, deviceId, row.id]
    );
    return { row: updated.rows[0], action: 'updated' };
  }

  const inserted = await query(
    `INSERT INTO device_reference_ranges
       (device_name, device_id, parameter_code, parameter_name, species, unit,
        low_value, high_value, source, last_synced_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) RETURNING *`,
    [deviceName, deviceId || null, parameterCode, parameterName || parameterCode,
      species, unit || null, lowValue, highValue, source]
  );
  return { row: inserted.rows[0], action: 'inserted' };
};

/** Sync reference ranges from a parsed device message (does not touch result values). */
const syncFromParsedMessage = async ({
  device,
  parsed,
  messageId,
  species: speciesOverride,
  testCode = 'CBC-FULL',
}) => {
  const deviceName = device?.name || DEFAULT_DEVICE_NAME;
  const deviceId = device?.id || null;
  const species = resolveSpecies(parsed, speciesOverride);
  const results = parsed?.results || [];

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of results) {
    const limsCode = resolveNormaResultLimsCode(row);
    if (!limsCode || row.referenceMin == null || row.referenceMax == null) {
      skipped += 1;
      continue;
    }

    const upsert = await upsertDeviceReferenceRange({
      deviceName,
      deviceId,
      parameterCode: limsCode,
      parameterName: row.parameterName || row.code || limsCode,
      species,
      unit: row.unit || null,
      lowValue: row.referenceMin,
      highValue: row.referenceMax,
      source: 'device',
      messageId,
    });

    if (upsert?.action === 'inserted') inserted += 1;
    else if (upsert?.action === 'updated') updated += 1;
    else skipped += 1;
  }

  // Keep legacy test_reference_ranges in sync for reports fallback chain
  const legacy = await referenceRangesService.syncFromParsedResults({
    results,
    testCode,
    animalType: species,
  });

  logger.info('Device reference ranges synced', {
    device: deviceName,
    species,
    inserted,
    updated,
    skipped,
    legacyUpdated: legacy.updated,
    messageId,
  });

  return { inserted, updated, skipped, species, legacyUpdated: legacy.updated };
};

/** Daily job — scan Norma messages from the last N hours. */
const syncFromRecentMessages = async ({ hours = 24 } = {}) => {
  const messages = await query(
    `SELECT dm.id, dm.parsed_data, dm.device_id, dm.sample_id,
            di.name AS device_name, di.id AS integration_id,
            a.animal_type AS lims_animal_type
     FROM device_messages dm
     JOIN device_integrations di ON di.id = dm.device_id
     LEFT JOIN samples s ON s.id = dm.sample_id
     LEFT JOIN animals a ON a.id = s.animal_id
     WHERE di.name ILIKE '%norma%'
       AND dm.status IN ('imported', 'received')
       AND dm.created_at >= NOW() - ($1::text || ' hours')::interval
       AND dm.parsed_data IS NOT NULL
     ORDER BY dm.created_at ASC`,
    [String(hours)]
  );

  let totalInserted = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let messagesProcessed = 0;

  for (const row of messages.rows) {
    const parsed = typeof row.parsed_data === 'string'
      ? JSON.parse(row.parsed_data)
      : row.parsed_data;
    if (!parsed?.results?.length) continue;

    const sync = await syncFromParsedMessage({
      device: { id: row.integration_id, name: row.device_name },
      parsed,
      messageId: row.id,
      species: resolveSpecies(parsed, row.lims_animal_type),
    });

    totalInserted += sync.inserted;
    totalUpdated += sync.updated;
    totalSkipped += sync.skipped;
    messagesProcessed += 1;
  }

  const summary = {
    messagesProcessed,
    inserted: totalInserted,
    updated: totalUpdated,
    skipped: totalSkipped,
    hours,
  };

  logger.info('Daily device reference range sync completed', summary);
  return summary;
};

const list = async ({
  device_name,
  species,
  parameter_code,
  search,
  page = 1,
  limit = 100,
}) => {
  const params = [];
  const where = ['1=1'];

  if (device_name) {
    params.push(`%${device_name}%`);
    where.push(`drr.device_name ILIKE $${params.length}`);
  }
  if (species) {
    params.push(species);
    where.push(`drr.species = $${params.length}`);
  }
  if (parameter_code) {
    params.push(parameter_code);
    where.push(`drr.parameter_code = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(drr.parameter_code ILIKE $${params.length} OR drr.parameter_name ILIKE $${params.length})`);
  }

  const offset = (Math.max(1, page) - 1) * limit;
  params.push(limit, offset);

  const result = await query(
    `SELECT drr.*, tp.name AS lims_parameter_name, tp.name_ar AS lims_parameter_name_ar
     FROM device_reference_ranges drr
     LEFT JOIN test_parameters tp ON tp.code = drr.parameter_code
     LEFT JOIN tests t ON t.id = tp.test_id AND t.code = 'CBC-FULL'
     WHERE ${where.join(' AND ')}
     ORDER BY drr.device_name, drr.species, drr.parameter_code
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const countParams = params.slice(0, -2);
  const count = await query(
    `SELECT COUNT(*)::int AS total FROM device_reference_ranges drr WHERE ${where.join(' AND ')}`,
    countParams
  );

  return { rows: result.rows, total: count.rows[0]?.total || 0, page, limit };
};

const listLogs = async ({ limit = 50, device_name, parameter_code } = {}) => {
  const params = [];
  const where = ['1=1'];
  if (device_name) {
    params.push(`%${device_name}%`);
    where.push(`device_name ILIKE $${params.length}`);
  }
  if (parameter_code) {
    params.push(parameter_code);
    where.push(`parameter_code = $${params.length}`);
  }
  params.push(limit);

  const result = await query(
    `SELECT * FROM device_reference_range_logs
     WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${params.length}`,
    params
  );
  return result.rows;
};

/** SQL fragment: prefer device_reference_ranges over test_reference_ranges. */
const DEVICE_REF_LATERAL_SQL = `
  LEFT JOIN LATERAL (
    SELECT low_value, high_value, unit AS device_ref_unit, source AS device_ref_source, last_synced_at
    FROM device_reference_ranges drr
    WHERE drr.device_name ILIKE '%norma%'
      AND drr.parameter_code = tp.code
      AND drr.species = a.animal_type::text
      AND (drr.unit IS NULL OR drr.unit = '' OR drr.unit = tp.unit)
    ORDER BY
      CASE WHEN drr.unit = tp.unit THEN 0 WHEN drr.unit IS NULL OR drr.unit = '' THEN 1 ELSE 2 END,
      drr.last_synced_at DESC
    LIMIT 1
  ) dref ON true`;

const formatEffectiveReference = (row) => {
  const fromValue = row.rv_notes?.startsWith('Norma:') ? row.rv_notes.slice(6).trim() : null;
  if (fromValue) return fromValue;

  const min = row.device_min ?? row.min_value;
  const max = row.device_max ?? row.max_value;
  if (min != null && max != null) {
    return normaReferenceNote(null, min, max) || `${min}-${max}`;
  }
  const fromRange = row.tr_notes?.startsWith('Norma:') ? row.tr_notes.slice(6).trim() : null;
  if (fromRange) return fromRange;
  return normaReferenceNote(null, row.min_value, row.max_value);
};

/** Effective range for flag evaluation: device table first, then test_reference_ranges. */
const getEffectiveRangeForParameter = async ({ parameterId, parameterCode, species, unit }) => {
  if (parameterCode && species) {
    const device = await query(
      `SELECT low_value AS min_value, high_value AS max_value,
              NULL::decimal AS critical_low, NULL::decimal AS critical_high, source
       FROM device_reference_ranges
       WHERE device_name ILIKE '%norma%'
         AND parameter_code = $1 AND species = $2
         AND (unit IS NULL OR unit = '' OR unit = $3)
       ORDER BY CASE WHEN unit = $3 THEN 0 WHEN unit IS NULL OR unit = '' THEN 1 ELSE 2 END,
                last_synced_at DESC
       LIMIT 1`,
      [parameterCode, species, unit || '']
    );
    if (device.rows[0]) return device.rows[0];
  }

  const legacy = await query(
    `SELECT min_value, max_value, critical_low, critical_high
     FROM test_reference_ranges
     WHERE parameter_id = $1 AND (animal_type = $2 OR animal_type IS NULL)
     ORDER BY CASE WHEN animal_type = $2 THEN 0 ELSE 1 END
     LIMIT 1`,
    [parameterId, species]
  );
  return legacy.rows[0] || null;
};

module.exports = {
  DEFAULT_DEVICE_NAME,
  upsertDeviceReferenceRange,
  syncFromParsedMessage,
  syncFromRecentMessages,
  list,
  listLogs,
  resolveSpecies,
  DEVICE_REF_LATERAL_SQL,
  formatEffectiveReference,
  getEffectiveRangeForParameter,
};
