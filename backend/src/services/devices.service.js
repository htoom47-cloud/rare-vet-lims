const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../config/logger');

const SUPPORTED_DEVICES = [
  { name: 'Diasys Respons 910', model: 'Respons 910', protocol: 'ASTM', connection_type: 'tcp' },
  { name: 'Norma CBC', model: 'Norma', protocol: 'HL7', connection_type: 'serial' },
  { name: 'Mini Vidas', model: 'Mini Vidas', protocol: 'ASTM', connection_type: 'serial' },
];

const list = async () => {
  const result = await query('SELECT * FROM device_integrations ORDER BY name');
  return { configured: result.rows, supported: SUPPORTED_DEVICES };
};

const create = async (data) => {
  const result = await query(
    `INSERT INTO device_integrations (name, model, protocol, connection_type, host, port, serial_port, config, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [data.name, data.model, data.protocol, data.connection_type, data.host, data.port, data.serial_port, JSON.stringify(data.config || {}), data.is_active || false]
  );
  return result.rows[0];
};

const update = async (id, data) => {
  const result = await query(
    `UPDATE device_integrations SET name=$1, model=$2, protocol=$3, connection_type=$4, host=$5, port=$6,
     serial_port=$7, config=$8, is_active=$9 WHERE id=$10 RETURNING *`,
    [data.name, data.model, data.protocol, data.connection_type, data.host, data.port, data.serial_port, JSON.stringify(data.config || {}), data.is_active, id]
  );
  if (!result.rows[0]) throw new AppError('Device not found', 404, 'NOT_FOUND');
  return result.rows[0];
};

const receiveMessage = async (deviceId, rawMessage, direction = 'inbound') => {
  const result = await query(
    `INSERT INTO device_messages (device_id, direction, raw_message, status) VALUES ($1,$2,$3,'received') RETURNING *`,
    [deviceId, direction, rawMessage]
  );

  logger.info('Device message received', { deviceId, direction });

  // Placeholder for HL7/ASTM parsing
  return {
    message: result.rows[0],
    parsed: null,
    note: 'Message stored. Protocol parser ready for HL7/ASTM/TCP/Serial integration.',
  };
};

const getMessages = async (deviceId, limit = 50) => {
  const result = await query(
    'SELECT * FROM device_messages WHERE device_id = $1 ORDER BY created_at DESC LIMIT $2',
    [deviceId, limit]
  );
  return result.rows;
};

module.exports = { list, create, update, receiveMessage, getMessages, SUPPORTED_DEVICES };
