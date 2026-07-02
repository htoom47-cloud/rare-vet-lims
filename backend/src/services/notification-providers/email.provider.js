const env = require('../../config/env');
const logger = require('../../config/logger');

/** Email channel — requires SMTP_HOST in production. Dev logs only. */
module.exports = {
  send: async ({ recipient, subject, body }) => {
    if (!process.env.SMTP_HOST) {
      if (env.nodeEnv === 'development') {
        logger.info('Email queued (dev — SMTP not configured)', {
          recipient,
          subject,
          bodyLength: body?.length || 0,
        });
        return { provider: 'dev-log', delivered: true };
      }
      throw new Error('SMTP_HOST is not configured for email delivery');
    }
    throw new Error('SMTP delivery requires SMTP_HOST configuration (Phase 9A stub)');
  },
};
