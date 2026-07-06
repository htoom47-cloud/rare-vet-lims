/**
 * Permanently purge soft-deleted records past retention window.
 * Schedule on Render cron (e.g. hourly): node src/scripts/purge-soft-deleted.js
 */
require('dotenv').config();
const { purgeExpired } = require('../services/soft-delete.service');
const logger = require('../config/logger');
const { pool } = require('../config/database');

purgeExpired()
  .then((result) => {
    logger.info('Soft-delete purge complete', result);
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((err) => {
    logger.error('Soft-delete purge failed', { error: err.message });
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
