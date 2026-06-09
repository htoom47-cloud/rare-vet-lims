const { query } = require('../config/database');
const { paginate, buildPagination } = require('../utils/helpers');
const env = require('../config/env');
const logger = require('../config/logger');

const queue = async ({ channel, recipient, subject, body, metadata }) => {
  const result = await query(
    `INSERT INTO notification_queue (channel, recipient, subject, body, metadata) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [channel, recipient, subject, body, metadata ? JSON.stringify(metadata) : null]
  );
  return result.rows[0];
};

const list = async ({ status, channel, page, limit }) => {
  const { offset, page: p, limit: l } = paginate(page, limit);
  const params = [];
  let where = 'WHERE 1=1';

  if (status) { params.push(status); where += ` AND status = $${params.length}`; }
  if (channel) { params.push(channel); where += ` AND channel = $${params.length}`; }

  const countResult = await query(`SELECT COUNT(*) FROM notification_queue ${where}`, params);
  const total = parseInt(countResult.rows[0].count, 10);

  params.push(l, offset);
  const result = await query(
    `SELECT * FROM notification_queue ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { data: result.rows, pagination: buildPagination(total, p, l) };
};

const sendReportNotification = async (sampleId, channel, recipient) => {
  const sample = await query(
    `SELECT s.sample_code, c.full_name, c.mobile, c.full_name as email
     FROM samples s JOIN customers c ON s.customer_id = c.id WHERE s.id = $1`,
    [sampleId]
  );

  if (!sample.rows[0]) return null;

  const { sample_code, full_name } = sample.rows[0];
  const body = `Your laboratory report for sample ${sample_code} is ready. - Rare Veterinary Care`;

  return queue({
    channel,
    recipient: recipient || sample.rows[0].mobile,
    subject: 'Lab Report Ready',
    body,
    metadata: { sample_id: sampleId, sample_code, customer: full_name },
  });
};

const processPending = async () => {
  const pending = await query(`SELECT * FROM notification_queue WHERE status = 'pending' LIMIT 50`);

  for (const notification of pending.rows) {
    try {
      if (notification.channel === 'whatsapp' && !env.notifications.whatsapp) {
        logger.info('WhatsApp disabled, skipping', { id: notification.id });
        continue;
      }
      if (notification.channel === 'sms' && !env.notifications.sms) {
        logger.info('SMS disabled, skipping', { id: notification.id });
        continue;
      }
      if (notification.channel === 'email' && !env.notifications.email) {
        logger.info('Email disabled, skipping', { id: notification.id });
        continue;
      }

      // Placeholder for actual provider integration
      logger.info('Notification queued for delivery', {
        channel: notification.channel,
        recipient: notification.recipient,
      });

      await query(`UPDATE notification_queue SET status = 'sent', sent_at = NOW() WHERE id = $1`, [notification.id]);
    } catch (err) {
      await query(`UPDATE notification_queue SET status = 'failed' WHERE id = $1`, [notification.id]);
      logger.error('Notification failed', { id: notification.id, error: err.message });
    }
  }

  return { processed: pending.rows.length };
};

module.exports = { queue, list, sendReportNotification, processPending };
