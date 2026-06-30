/**
 * Clear imported/entered results for a sample test (e.g. before re-import from Norma).
 * Usage: node src/scripts/clear-sample-results.js SMP-260630-037056 [CBC-FULL]
 */
require('dotenv').config();
const { pool } = require('../config/database');
const logger = require('../config/logger');
const { clearSampleResultsByCode } = require('../services/results.service');

const sampleCode = process.argv[2];
const testCode = process.argv[3] || 'CBC-FULL';

if (!sampleCode) {
  console.error('Usage: node src/scripts/clear-sample-results.js <sample_code> [test_code]');
  process.exit(1);
}

clearSampleResultsByCode(sampleCode, testCode)
  .then((result) => {
    logger.info('Results cleared', result);
    console.log(`Cleared ${testCode} results for ${sampleCode}`);
  })
  .catch((err) => {
    logger.error('Clear failed', { error: err.message });
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
