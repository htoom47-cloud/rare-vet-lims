/**
 * Consolidated customer report notifications — one message per batch, duplicate tracking.
 * Scopes reports across all customer records sharing the same mobile (exact or last 9 digits).
 */
const { randomUUID } = require('crypto');
const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const env = require('../config/env');
const logger = require('../config/logger');
const { formatToE164 } = require('../utils/phone');
const { resolveCustomerIdsByMobile } = require('../utils/customer-scope');
const portalSync = require('./portal-sync.service');
const notifications = require('./notifications.service');
const {
  BATCH_TYPE,
  buildConsolidatedReportMessage,
  messageHash,
  extractSentReportIds,
  findDuplicateReportIds,
} = require('./customer-report-notifications.utils');

const visibilitySql = portalSync.portalVisibilitySql('r').replace(/\s+/g, ' ').trim();

const READY_REPORTS_BASE = `
  SELECT r.id, r.report_number, r.pdf_url, r.language, r.is_final, r.created_at,
         r.lab_specialist_approved_by, r.vet_approved_by,
         s.id AS sample_id, s.sample_code, s.customer_id,
         a.id AS animal_id, a.name_tag AS animal_name, a.animal_type,
         (
           SELECT string_agg(DISTINCT COALESCE(t.name_ar, t.name), ', ' ORDER BY COALESCE(t.name_ar, t.name))
           FROM sample_tests st
           JOIN tests t ON t.id = st.test_id
           WHERE st.sample_id = s.id
         ) AS test_names
  FROM reports r
  JOIN samples s ON r.sample_id = s.id
  LEFT JOIN animals a ON s.animal_id = a.id
  WHERE s.customer_id = ANY($1::uuid[])
    AND ${visibilitySql}
`;

const READY_REPORTS_SQL = `${READY_REPORTS_BASE} ORDER BY r.created_at DESC`;

const loadSentBatches = async (customerIds) => {
  const ids = Array.isArray(customerIds) ? customerIds : [customerIds];
  const result = await query(
    `SELECT id, metadata, sent_at, channel, status
     FROM notification_queue
     WHERE status IN ('sent')
       AND metadata->>'customer_id' = ANY($1::text[])
       AND (
         metadata->>'type' = $2
         OR metadata->>'batch_id' IS NOT NULL
       )
     ORDER BY sent_at DESC NULLS LAST, created_at DESC`,
    [ids.map(String), BATCH_TYPE]
  );
  return result.rows;
};

const mapReportRow = (row, sentIds) => {
  const lifecycle = portalSync.resolveReportLifecycle(row);
  return {
    id: row.id,
    report_number: row.report_number,
    pdf_url: row.pdf_url,
    created_at: row.created_at,
    animal_name: row.animal_name,
    animal_type: row.animal_type,
    test_names: row.test_names,
    sample_code: row.sample_code,
    customer_id: row.customer_id,
    lifecycle,
    status: lifecycle,
    previously_sent: sentIds.has(String(row.id)),
  };
};

const listReadyReports = async (customerId) => {
  const scopeIds = await resolveCustomerIdsByMobile(customerId);
  const customer = await query(
    'SELECT id, full_name, full_name_ar, mobile FROM customers WHERE id = $1 AND is_active = true',
    [customerId]
  );
  if (!customer.rows[0]) throw new AppError('Customer not found', 404, 'NOT_FOUND');

  const sentRows = await loadSentBatches(scopeIds);
  const sentIds = extractSentReportIds(sentRows);

  const reports = await query(READY_REPORTS_SQL, [scopeIds]);
  const rows = reports.rows.map((r) => mapReportRow(r, sentIds));

  return {
    customer: customer.rows[0],
    scopeCustomerIds: scopeIds,
    reports: rows,
    unsentCount: rows.filter((r) => !r.previously_sent).length,
    portalUrl: env.portalAppUrl,
  };
};

const sendReadyReports = async (customerId, { reportIds, channel, forceResend = false }, userId) => {
  if (!Array.isArray(reportIds) || reportIds.length === 0) {
    throw new AppError('Select at least one report', 400, 'VALIDATION');
  }

  const scopeIds = await resolveCustomerIdsByMobile(customerId);
  const selectedChannel = channel || env.notifications.defaultChannel || 'whatsapp';

  const customer = await query(
    'SELECT id, full_name, full_name_ar, mobile FROM customers WHERE id = $1 AND is_active = true',
    [customerId]
  );
  if (!customer.rows[0]) throw new AppError('Customer not found', 404, 'NOT_FOUND');

  const row = customer.rows[0];
  const e164 = formatToE164(row.mobile);
  if (!e164) throw new AppError('Customer mobile number is missing or invalid', 400, 'NO_RECIPIENT');

  const reportsResult = await query(
    `${READY_REPORTS_BASE} AND r.id = ANY($2::uuid[]) ORDER BY r.created_at DESC`,
    [scopeIds, reportIds]
  );

  if (reportsResult.rows.length !== reportIds.length) {
    throw new AppError('One or more reports are not ready for customer delivery', 400, 'INVALID_REPORTS');
  }

  const wrongScope = reportsResult.rows.some((r) => !scopeIds.includes(r.customer_id));
  if (wrongScope) {
    throw new AppError('Report does not belong to this customer scope', 403, 'CUSTOMER_SCOPE_MISMATCH');
  }

  const sentRows = await loadSentBatches(scopeIds);
  const sentIds = extractSentReportIds(sentRows);
  const duplicates = findDuplicateReportIds(reportIds, sentIds);

  if (duplicates.length && !forceResend) {
    throw new AppError(
      'These reports were already sent to the customer. Resend?',
      409,
      'ALREADY_SENT',
      { duplicateReportIds: duplicates }
    );
  }

  const body = buildConsolidatedReportMessage({
    customerName: row.full_name_ar || row.full_name,
    reports: reportsResult.rows,
    portalUrl: env.portalAppUrl,
    labNameAr: env.lab.nameAr,
  });

  const batchId = randomUUID();
  const hash = messageHash(body);
  const metadata = {
    type: BATCH_TYPE,
    customer_id: customerId,
    scope_customer_ids: scopeIds,
    report_ids: reportIds,
    batch_id: batchId,
    message_hash: hash,
    sent_by: userId,
    force_resend: Boolean(forceResend && duplicates.length),
    dry_run: !env.notifications.sendReal,
  };

  const queued = await notifications.queue({
    channel: selectedChannel,
    recipient: e164,
    subject: 'Lab Reports Ready',
    body,
    metadata,
  });

  try {
    const result = await notifications.dispatchOne(queued);
    logger.info('Customer report batch sent', {
      customerId,
      scopeIds,
      batchId,
      reportCount: reportIds.length,
      channel: selectedChannel,
      dryRun: !env.notifications.sendReal,
      userId,
    });
    return {
      batchId,
      notificationId: result.id,
      reportIds,
      channel: selectedChannel,
      dryRun: !env.notifications.sendReal,
      duplicatesIgnored: forceResend ? duplicates : [],
    };
  } catch (err) {
    await query(`UPDATE notification_queue SET status = 'failed' WHERE id = $1`, [queued.id]);
    throw new AppError(err.message || 'Failed to send notification', 502, 'SEND_FAILED');
  }
};

/** Customers with at least one unsent portal-visible report (for dashboard). */
const listCustomersReadyToSend = async (limit = 20) => {
  const result = await query(
    `SELECT c.id, c.full_name, c.full_name_ar, c.mobile,
            COUNT(DISTINCT r.id)::int AS ready_count
     FROM customers c
     JOIN samples s ON s.customer_id = c.id
     JOIN reports r ON r.sample_id = s.id AND ${visibilitySql}
     WHERE c.is_active = true
       AND NOT EXISTS (
         SELECT 1 FROM notification_queue nq
         WHERE nq.status = 'sent'
           AND nq.metadata->>'customer_id' = c.id::text
           AND nq.metadata->>'type' = $1
           AND nq.metadata->'report_ids' ? r.id::text
       )
     GROUP BY c.id
     HAVING COUNT(DISTINCT r.id) > 0
     ORDER BY MAX(r.created_at) DESC
     LIMIT $2`,
    [BATCH_TYPE, limit]
  );
  return result.rows;
};

module.exports = {
  listReadyReports,
  sendReadyReports,
  listCustomersReadyToSend,
  READY_REPORTS_SQL,
};
