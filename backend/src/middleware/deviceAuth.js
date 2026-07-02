const { query } = require('../config/database');
const logger = require('../config/logger');
const { AppError } = require('./errorHandler');
const {
  verifyApiKey,
  prepareConfigWithHashedKey,
  upgradeLegacyKeyInConfig,
  sanitizeDevice,
} = require('../utils/device-api-key');

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

    const config = typeof device.config === 'string' ? JSON.parse(device.config) : (device.config || {});
    const check = await verifyApiKey(config, apiKey);
    if (!check.valid) {
      throw new AppError('Invalid device API key', 401, 'UNAUTHORIZED');
    }

    if (check.legacy) {
      const upgraded = await upgradeLegacyKeyInConfig(config, apiKey);
      await query(
        'UPDATE device_integrations SET config = $1 WHERE id = $2',
        [JSON.stringify(upgraded), device.id]
      ).catch((err) => {
        logger.warn('Failed to upgrade legacy device API key hash', { deviceId, error: err.message });
      });
    }

    req.device = device;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { authenticateDevice };
