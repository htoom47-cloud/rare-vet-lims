const { query } = require('../config/database');
const { AppError } = require('./errorHandler');

const authenticateDevice = async (req, _res, next) => {
  try {
    const deviceId = req.params.deviceId || req.params.id;
    const apiKey = req.headers['x-device-key'] || req.body?.api_key;

    if (!deviceId || !apiKey) {
      throw new AppError('Device ID and API key required', 401, 'UNAUTHORIZED');
    }

    const result = await query('SELECT * FROM device_integrations WHERE id = $1', [deviceId]);
    const device = result.rows[0];
    if (!device || !device.is_active) {
      throw new AppError('Device not found or inactive', 404, 'NOT_FOUND');
    }

    const storedKey = device.config?.api_key;
    if (!storedKey || storedKey !== apiKey) {
      throw new AppError('Invalid device API key', 401, 'UNAUTHORIZED');
    }

    req.device = device;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { authenticateDevice };
