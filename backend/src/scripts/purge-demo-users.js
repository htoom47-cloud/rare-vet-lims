require('dotenv').config();
const { pool } = require('../config/database');
const logger = require('../config/logger');
const { purgeDemoUsers } = require('../services/users.service');

async function main() {
  const result = await purgeDemoUsers();
  if (result.count > 0) {
    logger.info('Demo accounts removed', { removed: result.removed });
  } else {
    logger.info('No demo accounts found');
  }
}

if (require.main === module) {
  main()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('purge-demo-users failed', { error: err.message });
      pool.end().finally(() => process.exit(1));
    });
}

module.exports = { main };
