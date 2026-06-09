const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');
const { pool } = require('./config/database');

const start = async () => {
  try {
    await pool.query('SELECT 1');
    logger.info('Database connected');

    app.listen(env.port, () => {
      logger.info(`Rare Vet LIMS API running on port ${env.port}`);
      logger.info(`API docs: http://localhost:${env.port}/api/docs`);
    });
  } catch (err) {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
};

start();
