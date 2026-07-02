/**
 * Device reference ranges — Norma CBC normal ranges stored per device/species/parameter.
 * Never deletes rows; changes are logged in device_reference_range_logs.
 */
const { query } = require('../config/database');
const logger = require('../config/logger');
const { resolveNormaResultLimsCode } = require('../utils/norma-cbc-map');
const { mapNormaSpeciesToRefSpeciesExact, normalizeSpeciesKey } = require('../utils/norma-species-map');
const { verbatimFromResultNotes } = require('../utils/reference-range');

const DEFAULT_DEVICE_NAME = 'Norma CBC';

const resolveSpecies = (parsed, fallbackSpecies) => {
  const imp = parsed?.import || {};
  const candidates = [
    parsed?.animalTypeRaw,
    imp.norma_species_raw,
    parsed?.animalType,
    imp.norma_animal_type,
    imp.reference_animal_type,
  ];
  for (const raw of candidates) {
    const exact = mapNormaSpeciesToRefSpeciesExact(raw);
    if (exact) return exact;
  }
  for (const raw of candidates) {
    const key = normalizeSpeciesKey(raw);
    if (key) return key;
  }
  if (fallbackSpecies) {
    return mapNormaSpeciesToRefSpeciesExact(fallbackSpecies) || normalizeSpeciesKey(fallbackSpecies);
  }
  return null;
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
  referenceText,
  source = 'device',
  messageId,
}) => {
  if (!parameterCode || !species) return null;
  const refText = String(referenceText || '').trim();
  if (!refText && (lowValue == null || highValue == null)) return null;

  const unitKey = unit || '';
  const existing = await query(
    `SELECT id, low_value, high_value, reference_text FROM device_reference_ranges
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
           low_value = $2, high_value = $3,
           reference_text = COALESCE($4, reference_text),
           source = $5,
           last_synced_at = NOW(), updated_at = NOW(),
           device_id = COALESCE($6, device_id)
       WHERE id = $7 RETURNING *`,
      [parameterName, lowValue, highValue, refText || null, source, deviceId, row.id]
    );
    return { row: updated.rows[0], action: 'updated' };
  }

  const inserted = await query(
    `INSERT INTO device_reference_ranges
       (device_name, device_id, parameter_code, parameter_name, species, unit,
        low_value, high_value, reference_text, source, last_synced_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW()) RETURNING *`,
    [deviceName, deviceId || null, parameterCode, parameterName || parameterCode,
      species, unit || null, lowValue, highValue, refText || null, source]
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
    const refRaw = String(row.reference || '').trim();
    if (!limsCode || !refRaw) {
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
      referenceText: refRaw,
      source: 'device',
      messageId,
    });

    if (upsert?.action === 'inserted') inserted += 1;
    else if (upsert?.action === 'updated') updated += 1;
    else skipped += 1;
  }

  logger.info('Device reference ranges synced (Norma OBX-7 only)', {
    device: deviceName,
    species,
    inserted,
    updated,
    skipped,
    messageId,
  });

  return { inserted, updated, skipped, species };
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
    SELECT low_value, high_value, reference_text, unit AS device_ref_unit, source AS device_ref_source, last_synced_at
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
  const fromNotes = verbatimFromResultNotes(row.rv_notes);
  if (fromNotes) return fromNotes;

  if (row.device_ref_text) return row.device_ref_text;
  if (row.reference_text) return row.reference_text;

  return null;
};

/** Effective range for flag evaluation — LIMS manual test_reference_ranges only. */
const getEffectiveRangeForParameter = async ({ parameterId, species }) => {
  if (!parameterId || !species) return null;
  const { getLimsReferenceRange } = require('./reference-ranges.service');
  const lims = await getLimsReferenceRange(parameterId, species);
  if (lims?.min_value != null && lims?.max_value != null) {
    return {
      min_value: lims.min_value,
      max_value: lims.max_value,
      critical_low: lims.critical_low,
      critical_high: lims.critical_high,
      source: 'lims-manual',
    };
  }
  return null;
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
