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

const buildReportMessage = ({ reportNumber, customerName }) => {
  const name = (customerName || 'العميل').trim();
  return [
    env.lab.nameAr,
    `عزيزي ${name}، تقريركم جاهز`,
    `التقرير: ${reportNumber}`,
    env.portalAppUrl ? `البوابة: ${env.portalAppUrl}` : null,
    `للاستفسار: ${env.lab.phone}`,
  ].filter(Boolean).join('\n');
};

const queue = async ({ channel, recipient, subject, body, metadata }) => {
  const result = await query(
    `INSERT INTO notification_queue (channel, recipient, subject, body, metadata) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [channel, recipient, subject, body, metadata ? JSON.stringify(metadata) : null]
  );
  return result.rows[0];
};

const dispatchOne = async (notification) => {
  if (!env.notifications.sendReal) {
    await query(
      `UPDATE notification_queue SET status = 'dry_run', sent_at = NOW(),
       metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
       WHERE id = $1`,
      [notification.id, JSON.stringify({ provider_result: { provider: 'dry-run', dryRun: true } })]
    );
    logger.info('Notification dry-run (not sent)', {
      id: notification.id,
      channel: notification.channel,
      recipient: notification.recipient,
    });
    return {
      ...notification,
      status: 'dry_run',
      dryRun: true,
      provider_result: { provider: 'dry-run', dryRun: true },
      userMessage: 'النظام يعمل في وضع الاختبار (Dry Run)، ولم يتم إرسال رسالة فعلية.',
      userMessageEn: 'System is in test mode (Dry Run). No real message was sent.',
    };
  }

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
    reportNumber: row.report_number,
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

const validateConfigOnStartup = () => {
  const n = env.notifications;
  const issues = [];

  if (!n.sendReal) {
    logger.warn('SEND_REAL_NOTIFICATIONS is not enabled — all notifications will be DRY-RUN only');
    issues.push('SEND_REAL_NOTIFICATIONS=false');
  }

  if (!n.sms && !n.whatsapp) {
    logger.warn('Both SMS and WhatsApp are disabled — no notification channel is available');
    issues.push('No channel enabled');
  }

  if (n.sendReal && n.sms && n.provider === 'msegat') {
    const { username, apiKey, sender } = n.msegat;
    if (!username || !apiKey || !sender) {
      logger.error('SEND_REAL_NOTIFICATIONS=true with SMS enabled but Msegat credentials are missing!', {
        hasUsername: !!username, hasApiKey: !!apiKey, hasSender: !!sender,
      });
      issues.push('Msegat credentials incomplete');
    }
  }

  if (n.sendReal && n.whatsapp) {
    const { accountSid, authToken, whatsappFrom } = n.twilio;
    if (!accountSid || !authToken || !whatsappFrom) {
      logger.error('SEND_REAL_NOTIFICATIONS=true with WhatsApp enabled but Twilio credentials are missing!', {
        hasSid: !!accountSid, hasToken: !!authToken, hasFrom: !!whatsappFrom,
      });
      issues.push('Twilio credentials incomplete');
    }
  }

  if (issues.length === 0) {
    logger.info('Notification config OK', {
      sendReal: n.sendReal, sms: n.sms, whatsapp: n.whatsapp, provider: n.provider,
    });
  }

  return issues;
};

const getConfigStatus = () => {
  const n = env.notifications;
  const msegatOk = !!(n.msegat.username && n.msegat.apiKey && n.msegat.sender);
  const twilioOk = !!(n.twilio.accountSid && n.twilio.authToken);
  return {
    sendReal: n.sendReal,
    smsEnabled: n.sms,
    whatsappEnabled: n.whatsapp,
    emailEnabled: n.email,
    provider: n.provider,
    defaultChannel: n.defaultChannel,
    msegatConfigured: msegatOk,
    twilioConfigured: twilioOk,
  };
};

const getDailyStats = async () => {
  const tz = 'Asia/Riyadh';
  const today = `(created_at AT TIME ZONE '${tz}')::date = (NOW() AT TIME ZONE '${tz}')::date`;
  const result = await query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'sent' AND ${today})::int AS sent_today,
      COUNT(*) FILTER (WHERE status = 'failed' AND ${today})::int AS failed_today,
      COUNT(*) FILTER (WHERE status = 'dry_run' AND ${today})::int AS dry_run_today,
      COUNT(*) FILTER (WHERE status = 'pending' AND ${today})::int AS pending_today,
      COUNT(*) FILTER (WHERE ${today})::int AS total_today,
      COUNT(*) FILTER (WHERE status = 'sent')::int AS sent_all,
      COUNT(*) FILTER (WHERE status = 'dry_run')::int AS dry_run_all,
      COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_all
    FROM notification_queue
  `);
  return result.rows[0] || {};
};

module.exports = {
  queue,
  list,
  getEnabledChannels,
  sendReportNotification,
  processPending,
  dispatchOne,
  validateConfigOnStartup,
  getConfigStatus,
  getDailyStats,
};
