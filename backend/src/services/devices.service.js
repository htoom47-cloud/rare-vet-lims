const crypto = require('crypto');
const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../config/logger');
const { parseDeviceMessage } = require('../utils/device-parsers');
const deviceImport = require('./device-import.service');
const deviceRefRanges = require('./device-reference-ranges.service');

const SUPPORTED_DEVICES = [
  { name: 'Norma CBC', model: 'iVet-5 / Icon-5', protocol: 'HL7', connection_type: 'tcp', default_port: 21110 },
  { name: 'Diasys Respons 910', model: 'Respons 910', protocol: 'ASTM', connection_type: 'tcp', default_port: 5000 },
  { name: 'Mini Vidas', model: 'Mini Vidas', protocol: 'ASTM', connection_type: 'serial' },
];

const generateApiKey = () => crypto.randomBytes(24).toString('hex');

const parseMessage = (raw, protocol) => parseDeviceMessage(raw, protocol);

const list = async () => {
  const result = await query('SELECT * FROM device_integrations ORDER BY name');
  return { configured: result.rows, supported: SUPPORTED_DEVICES };
};

const getById = async (id) => {
  const result = await query('SELECT * FROM device_integrations WHERE id = $1', [id]);
  if (!result.rows[0]) throw new AppError('Device not found', 404, 'NOT_FOUND');
  return result.rows[0];
};

const create = async (data) => {
  const config = { ...(data.config || {}), api_key: data.config?.api_key || generateApiKey() };
  const result = await query(
    `INSERT INTO device_integrations (name, model, protocol, connection_type, host, port, serial_port, config, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      data.name,
      data.model,
      data.protocol || 'HL7',
      data.connection_type || 'tcp',
      data.host,
      data.port || 21110,
      data.serial_port,
      JSON.stringify(config),
      data.is_active ?? false,
    ]
  );
  return result.rows[0];
};

const update = async (id, data) => {
  const existing = await getById(id);
  const config = { ...(existing.config || {}), ...(data.config || {}) };
  if (!config.api_key) config.api_key = generateApiKey();

  const result = await query(
    `UPDATE device_integrations SET name=$1, model=$2, protocol=$3, connection_type=$4, host=$5, port=$6,
     serial_port=$7, config=$8, is_active=$9, last_connected=CASE WHEN $9 = true THEN NOW() ELSE last_connected END
     WHERE id=$10 RETURNING *`,
    [
      data.name ?? existing.name,
      data.model ?? existing.model,
      data.protocol ?? existing.protocol,
      data.connection_type ?? existing.connection_type,
      data.host ?? existing.host,
      data.port ?? existing.port,
      data.serial_port ?? existing.serial_port,
      JSON.stringify(config),
      data.is_active ?? existing.is_active,
      id,
    ]
  );
  return result.rows[0];
};

const regenerateApiKey = async (id) => {
  const existing = await getById(id);
  const config = { ...(existing.config || {}), api_key: generateApiKey() };
  const result = await query(
    `UPDATE device_integrations SET config = $1 WHERE id = $2 RETURNING *`,
    [JSON.stringify(config), id]
  );
  return result.rows[0];
};

const processInboundMessage = async (device, rawMessage) => {
  const parsed = parseMessage(rawMessage, device.protocol);
  const msgResult = await query(
    `INSERT INTO device_messages (device_id, direction, raw_message, parsed_data, status)
     VALUES ($1, 'inbound', $2, $3, 'received') RETURNING *`,
    [device.id, rawMessage, JSON.stringify(parsed)]
  );

  await query('UPDATE device_integrations SET last_connected = NOW() WHERE id = $1', [device.id]);

  const sampleId = String(parsed.sampleId || '').trim();
  if (!sampleId || !parsed.results?.length) {
    await query(`UPDATE device_messages SET status = 'unmatched', parsed_data = $1 WHERE id = $2`, [
      JSON.stringify({
        ...parsed,
        sampleId: sampleId || null,
        error: !sampleId ? 'Missing sample ID in HL7 message' : 'Missing results in HL7 message',
        hint: 'Enter BC-... or SMP-... on Norma and enable Repeat Sample ID as Patient ID',
      }),
      msgResult.rows[0].id,
    ]);
    return {
      message: msgResult.rows[0],
      parsed: { ...parsed, sampleId: sampleId || null },
      imported: null,
      warning: 'Message stored but sample ID or results missing',
    };
  }
  parsed.sampleId = sampleId;

  try {
    const imported = await deviceImport.importFromParsed(parsed, device);
    await deviceRefRanges.syncFromParsedMessage({
      device,
      parsed,
      messageId: msgResult.rows[0].id,
      species: imported.reference_animal_type || parsed.animalType,
    });
    await query(
      `UPDATE device_messages SET status = 'imported', parsed_data = $1, sample_id = $2 WHERE id = $3`,
      [JSON.stringify({ ...parsed, import: imported }), imported.sample_id, msgResult.rows[0].id]
    );
    logger.info('Norma CBC results imported', { deviceId: device.id, sample: imported.sample_code, count: imported.imported });
    return { message: msgResult.rows[0], parsed, imported };
  } catch (err) {
    await query(
      `UPDATE device_messages SET status = 'failed', parsed_data = $1 WHERE id = $2`,
      [JSON.stringify({ ...parsed, error: err.message, code: err.code }), msgResult.rows[0].id]
    );
    throw err;
  }
};

const receiveMessage = async (deviceId, rawMessage, direction = 'inbound', device = null) => {
  const dev = device || await getById(deviceId);
  if (direction !== 'inbound') {
    const result = await query(
      `INSERT INTO device_messages (device_id, direction, raw_message, status) VALUES ($1,$2,$3,'sent') RETURNING *`,
      [deviceId, direction, rawMessage]
    );
    return { message: result.rows[0] };
  }
  return processInboundMessage(dev, rawMessage);
};

const getMessages = async (deviceId, limit = 50) => {
  const result = await query(
    'SELECT * FROM device_messages WHERE device_id = $1 ORDER BY created_at DESC LIMIT $2',
    [deviceId, limit]
  );
  return result.rows;
};

module.exports = {
  list, getById, create, update, regenerateApiKey, receiveMessage, getMessages, SUPPORTED_DEVICES, generateApiKey,
};
