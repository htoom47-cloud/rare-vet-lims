const { query } = require('../config/database');
const { paginate, buildPagination } = require('../utils/helpers');
const { AppError } = require('../middleware/errorHandler');
const env = require('../config/env');
const logger = require('../config/logger');
const provider = require('./notification-providers');
const { formatToE164 } = require('../utils/phone');

const CHANNEL_ENABLED = {
  sms: () => env.notifications.sms,
  whatsapp: () => env.notifications.whatsapp,
  email: () => env.notifications.email,
};

const assertChannelEnabled = (channel) => {
  if (!CHANNEL_ENABLED[channel]?.()) {
    throw new AppError(`${channel.toUpperCase()} notifications are disabled`, 503, 'CHANNEL_DISABLED');
  }
};

const buildReportMessage = ({ sampleCode, reportNumber, verificationCode, customerName }) => {
  const verifyLine = verificationCode ? `\nرمز التحقق: ${verificationCode}` : '';
  const verifyLineEn = verificationCode ? `\nVerify code: ${verificationCode}` : '';

  return [
    `${env.lab.nameAr}`,
    `عزيزي ${customerName || 'العميل'}، تقريركم جاهز.`,
    `العينة: ${sampleCode}`,
    `رقم التقرير: ${reportNumber}${verifyLine}`,
    `للاستفسار: ${env.lab.phone}`,
    '',
    `${env.lab.name}`,
    `Dear ${customerName || 'customer'}, your lab report is ready.`,
    `Sample: ${sampleCode}`,
    `Report: ${reportNumber}${verifyLineEn}`,
    `Contact: ${env.lab.phone}`,
  ].join('\n');
};

const queue = async ({ channel, recipient, subject, body, metadata }) => {
  const result = await query(
    `INSERT INTO notification_queue (channel, recipient, subject, body, metadata) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [channel, recipient, subject, body, metadata ? JSON.stringify(metadata) : null]
  );
  return result.rows[0];
};

const dispatchOne = async (notification) => {
  assertChannelEnabled(notification.channel);

  const result = await provider.send({
    channel: notification.channel,
    recipient: notification.recipient,
    body: notification.body,
    subject: notification.subject,
  });

  await query(
    `UPDATE notification_queue SET status = 'sent', sent_at = NOW(), metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb WHERE id = $1`,
    [notification.id, JSON.stringify({ provider_result: result })]
  );

  logger.info('Notification sent', {
    id: notification.id,
    channel: notification.channel,
    recipient: notification.recipient,
    provider: result.provider,
  });

  return { ...notification, status: 'sent', provider_result: result };
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

const getEnabledChannels = () => {
  const channels = [];
  if (env.notifications.sms) channels.push('sms');
  if (env.notifications.whatsapp) channels.push('whatsapp');
  if (env.notifications.email) channels.push('email');
  return {
    channels,
    defaultChannel: env.notifications.defaultChannel,
    provider: env.notifications.provider,
  };
};

const sendReportNotification = async (sampleId, channel, recipient) => {
  const selectedChannel = channel || env.notifications.defaultChannel;
  assertChannelEnabled(selectedChannel);

  const sample = await query(
    `SELECT s.id, s.sample_code, c.full_name, c.mobile,
            r.report_number, r.qr_verification_code
     FROM samples s
     JOIN customers c ON s.customer_id = c.id
     LEFT JOIN LATERAL (
       SELECT report_number, qr_verification_code
       FROM reports
       WHERE sample_id = s.id
       ORDER BY created_at DESC
       LIMIT 1
     ) r ON true
     WHERE s.id = $1`,
    [sampleId]
  );

  if (!sample.rows[0]) throw new AppError('Sample not found', 404, 'NOT_FOUND');
  if (!sample.rows[0].report_number) {
    throw new AppError('Generate a report before sending to the customer', 400, 'NO_REPORT');
  }

  const row = sample.rows[0];
  const target = recipient || row.mobile;
  if (!target) throw new AppError('Customer mobile number is missing', 400, 'NO_RECIPIENT');

  const e164 = formatToE164(target);
  if (!e164) throw new AppError('Invalid customer phone number', 400, 'INVALID_PHONE');

  const body = buildReportMessage({
    sampleCode: row.sample_code,
    reportNumber: row.report_number,
    verificationCode: row.qr_verification_code,
    customerName: row.full_name,
  });

  const queued = await queue({
    channel: selectedChannel,
    recipient: e164,
    subject: 'Lab Report Ready',
    body,
    metadata: { sample_id: sampleId, sample_code: row.sample_code, customer: row.full_name },
  });

  try {
    return await dispatchOne(queued);
  } catch (err) {
    await query(`UPDATE notification_queue SET status = 'failed' WHERE id = $1`, [queued.id]);
    logger.error('Notification failed', { id: queued.id, error: err.message });
    throw new AppError(err.message || 'Failed to send notification', 502, 'SEND_FAILED');
  }
};

const processPending = async () => {
  const pending = await query(`SELECT * FROM notification_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 50`);
  let sent = 0;
  let failed = 0;

  for (const notification of pending.rows) {
    try {
      if (!CHANNEL_ENABLED[notification.channel]?.()) {
        logger.info('Notification channel disabled, skipping', { id: notification.id, channel: notification.channel });
        continue;
      }
      await dispatchOne(notification);
      sent += 1;
    } catch (err) {
      failed += 1;
      await query(`UPDATE notification_queue SET status = 'failed' WHERE id = $1`, [notification.id]);
      logger.error('Notification failed', { id: notification.id, error: err.message });
    }
  }

  return { processed: pending.rows.length, sent, failed };
};

module.exports = {
  queue,
  list,
  getEnabledChannels,
  sendReportNotification,
  processPending,
  dispatchOne,
};
