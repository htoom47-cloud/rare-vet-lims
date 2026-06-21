const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');
const { pool } = require('./config/database');
const notificationsService = require('./services/notifications.service');

const NOTIFICATION_POLL_MS = 60_000;

const start = async () => {
  try {
    let connected = false;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        await pool.query('SELECT 1');
        connected = true;
        break;
      } catch (err) {
        logger.warn(`Database connection attempt ${attempt}/5 failed`, { error: err.message });
        if (attempt < 5) await new Promise((r) => setTimeout(r, 3000));
        else throw err;
      }
    }
    if (connected) logger.info('Database connected');

    app.listen(env.port, '0.0.0.0', () => {
      logger.info(`Rare Vet LIMS API running on port ${env.port}`);
      if (env.serveFrontend) logger.info('Serving frontend from /frontend/dist');

      if (env.notifications.sms || env.notifications.whatsapp || env.notifications.email) {
        setInterval(() => {
          notificationsService.processPending().catch((err) => {
            logger.error('Notification queue processing failed', { error: err.message });
          });
        }, NOTIFICATION_POLL_MS);
        logger.info('Notification queue processor started');
      }
    });
  } catch (err) {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
};

start();
