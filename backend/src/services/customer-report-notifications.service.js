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
  parseMetadata,
} = require('./customer-report-notifications.utils');

const visibilitySql = portalSync.portalVisibilitySql('r').replace(/\s+/g, ' ').trim();

const READY_REPORTS_BASE = `
  SELECT r.id, r.report_number, r.pdf_url, r.language, r.is_final, r.created_at,
         r.lab_specialist_approved_by, r.lab_specialist_approved_at,
         r.vet_approved_by, r.vet_approved_at,
         GREATEST(
           COALESCE(r.lab_specialist_approved_at, r.created_at),
           COALESCE(r.vet_approved_at, r.created_at)
         ) AS approved_at,
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
    `SELECT nq.id, nq.metadata, nq.sent_at, nq.created_at, nq.channel, nq.status,
            u.full_name AS sent_by_name
     FROM notification_queue nq
     LEFT JOIN users u ON u.id::text = nq.metadata->>'sent_by'
     WHERE nq.status IN ('sent', 'dry_run')
       AND (
         nq.metadata->>'type' = $2
         OR nq.metadata->>'batch_id' IS NOT NULL
       )
       AND (
         nq.metadata->>'customer_id' = ANY($1::text[])
         OR EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(COALESCE(nq.metadata->'scope_customer_ids', '[]'::jsonb)) sid
           WHERE sid = ANY($1::text[])
         )
       )
     ORDER BY COALESCE(nq.sent_at, nq.created_at) DESC`,
    [ids.map(String), BATCH_TYPE]
  );
  return result.rows;
};

const loadFailedBatches = async (customerIds) => {
  const ids = Array.isArray(customerIds) ? customerIds : [customerIds];
  const result = await query(
    `SELECT nq.id, nq.metadata, nq.created_at, nq.channel, nq.status
     FROM notification_queue nq
     WHERE nq.status = 'failed'
       AND nq.metadata->>'type' = $2
       AND nq.created_at >= NOW() - INTERVAL '30 days'
       AND (
         nq.metadata->>'customer_id' = ANY($1::text[])
         OR EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(COALESCE(nq.metadata->'scope_customer_ids', '[]'::jsonb)) sid
           WHERE sid = ANY($1::text[])
         )
       )
     ORDER BY nq.created_at DESC`,
    [ids.map(String), BATCH_TYPE]
  );
  return result.rows;
};

const findBatchForReportIds = (batches, reportIds) => {
  const wanted = new Set(reportIds.map(String));
  return batches.find((row) => {
    const meta = parseMetadata(row.metadata);
    return (meta.report_ids || []).some((id) => wanted.has(String(id)));
  }) || null;
};

const dispatchStatusFromCounts = (readyCount, unsentCount, hasFailed) => {
  if (readyCount === 0) return 'none';
  if (hasFailed && unsentCount > 0) return 'failed';
  if (unsentCount >= 2) return 'ready_multi';
  if (unsentCount === 1) return 'ready_one';
  if (unsentCount === 0) return 'sent';
  return 'none';
};

const reportWasSent = (reportId, sentIds) => sentIds.has(String(reportId));

const mapReportRow = (row, sentIds, sentBatches, failedBatches) => {
  const lifecycle = portalSync.resolveReportLifecycle(row);
  const previouslySent = reportWasSent(row.id, sentIds);
  const sentBatch = previouslySent ? findBatchForReportIds(sentBatches, [row.id]) : null;
  const failedBatch = !previouslySent ? findBatchForReportIds(failedBatches, [row.id]) : null;
  let send_status = 'unsent';
  if (previouslySent) send_status = 'sent';
  else if (failedBatch) send_status = 'failed';

  return {
    id: row.id,
    report_number: row.report_number,
    pdf_url: row.pdf_url,
    created_at: row.created_at,
    approved_at: row.approved_at,
    report_type: row.test_names,
    animal_name: row.animal_name,
    animal_type: row.animal_type,
    test_names: row.test_names,
    sample_code: row.sample_code,
    customer_id: row.customer_id,
    lifecycle,
    status: lifecycle,
    send_status,
    previously_sent: previouslySent,
    last_sent_at: sentBatch?.sent_at || sentBatch?.created_at || null,
    last_sent_channel: sentBatch?.channel || null,
    last_sent_by_name: sentBatch?.sent_by_name || null,
  };
};

const listReadyReports = async (customerId) => {
  const scopeIds = await resolveCustomerIdsByMobile(customerId);
  const customer = await query(
    'SELECT id, full_name, full_name_ar, mobile FROM customers WHERE id = $1 AND is_active = true',
    [customerId]
  );
  if (!customer.rows[0]) throw new AppError('Customer not found', 404, 'NOT_FOUND');

  const [sentRows, failedRows, reports] = await Promise.all([
    loadSentBatches(scopeIds),
    loadFailedBatches(scopeIds),
    query(READY_REPORTS_SQL, [scopeIds]),
  ]);
  const sentIds = extractSentReportIds(sentRows);
  const rows = reports.rows.map((r) => mapReportRow(r, sentIds, sentRows, failedRows));
  const unsent = rows.filter((r) => !r.previously_sent);

  return {
    customer: customer.rows[0],
    scopeCustomerIds: scopeIds,
    reports: rows,
    unsentReports: unsent,
    unsentCount: unsent.length,
    portalUrl: env.portalAppUrl,
    dispatchStatus: dispatchStatusFromCounts(
      rows.length,
      unsent.length,
      failedRows.length > 0 && unsent.length > 0
    ),
  };
};

const getCustomerDispatchStatus = async (customerId) => {
  const scopeIds = await resolveCustomerIdsByMobile(customerId);
  const [sentRows, failedRows, reports] = await Promise.all([
    loadSentBatches(scopeIds),
    loadFailedBatches(scopeIds),
    query(READY_REPORTS_SQL, [scopeIds]),
  ]);
  const sentIds = extractSentReportIds(sentRows);
  const readyCount = reports.rows.length;
  const unsentCount = reports.rows.filter((r) => !sentIds.has(String(r.id))).length;
  const hasFailed = failedRows.length > 0 && unsentCount > 0;

  return {
    status: dispatchStatusFromCounts(readyCount, unsentCount, hasFailed),
    readyCount,
    unsentCount,
  };
};

const enrichCustomersDispatchStatus = async (customerRows = []) => {
  if (!customerRows.length) return customerRows;
  const statuses = await Promise.all(
    customerRows.map((row) => getCustomerDispatchStatus(row.id))
  );
  return customerRows.map((row, i) => ({
    ...row,
    report_dispatch_status: statuses[i].status,
    report_dispatch_unsent_count: statuses[i].unsentCount,
    report_dispatch_ready_count: statuses[i].readyCount,
  }));
};

/** Customers with ≥1 unsent portal-visible report (count customers, not reports). */
const countCustomersWaitingToSend = async () => {
  const result = await query(
    `SELECT COUNT(DISTINCT c.id)::int AS count
     FROM customers c
     WHERE c.is_active = true
       AND EXISTS (
         SELECT 1
         FROM reports r
         JOIN samples s ON r.sample_id = s.id
         JOIN customers c2 ON s.customer_id = c2.id
         WHERE ${visibilitySql}
           AND (
             c2.id = c.id
             OR RIGHT(regexp_replace(c2.mobile, '[^0-9]', '', 'g'), 9)
               = RIGHT(regexp_replace(c.mobile, '[^0-9]', '', 'g'), 9)
           )
           AND NOT EXISTS (
             SELECT 1 FROM notification_queue nq
             WHERE nq.status IN ('sent', 'dry_run')
               AND nq.metadata->>'type' = $1
               AND nq.metadata->'report_ids' ? r.id::text
           )
       )`,
    [BATCH_TYPE]
  );
  return result.rows[0]?.count || 0;
};

const sendReadyReports = async (customerId, { reportIds, channel, forceResend = false }, userId) => {
  const scopeIds = await resolveCustomerIdsByMobile(customerId);
  const selectedChannel = channel || env.notifications.defaultChannel || 'whatsapp';

  const customer = await query(
    'SELECT id, full_name, full_name_ar, mobile FROM customers WHERE id = $1 AND is_active = true',
    [customerId]
  );
  if (!customer.rows[0]) throw new AppError('Customer not found', 404, 'NOT_FOUND');

  let idsToSend = Array.isArray(reportIds) ? reportIds.filter(Boolean) : [];
  if (!idsToSend.length) {
    const ready = await listReadyReports(customerId);
    idsToSend = ready.unsentReports.map((r) => r.id);
  }
  if (!idsToSend.length) {
    throw new AppError('No ready reports to send', 400, 'NO_READY_REPORTS');
  }

  const row = customer.rows[0];
  const e164 = formatToE164(row.mobile);
  if (!e164) throw new AppError('Customer mobile number is missing or invalid', 400, 'NO_RECIPIENT');

  const reportsResult = await query(
    `${READY_REPORTS_BASE} AND r.id = ANY($2::uuid[]) ORDER BY r.created_at DESC`,
    [scopeIds, idsToSend]
  );

  if (reportsResult.rows.length !== idsToSend.length) {
    throw new AppError('One or more reports are not ready for customer delivery', 400, 'INVALID_REPORTS');
  }

  const wrongScope = reportsResult.rows.some((r) => !scopeIds.includes(r.customer_id));
  if (wrongScope) {
    throw new AppError('Report does not belong to this customer scope', 403, 'CUSTOMER_SCOPE_MISMATCH');
  }

  const sentRows = await loadSentBatches(scopeIds);
  const sentIds = extractSentReportIds(sentRows);
  const duplicates = findDuplicateReportIds(idsToSend, sentIds);

  if (duplicates.length && !forceResend) {
    const previousBatch = findBatchForReportIds(sentRows, duplicates);
    throw new AppError(
      'These reports were already sent to the customer. Resend?',
      409,
      'ALREADY_SENT',
      {
        duplicateReportIds: duplicates,
        previousSend: previousBatch ? {
          sentAt: previousBatch.sent_at || previousBatch.created_at,
          channel: previousBatch.channel,
          sentByName: previousBatch.sent_by_name || null,
          reportCount: parseMetadata(previousBatch.metadata).report_ids?.length || duplicates.length,
        } : null,
      }
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
  const reportNumbers = reportsResult.rows.map((r) => r.report_number);
  const metadata = {
    type: BATCH_TYPE,
    customer_id: customerId,
    scope_customer_ids: scopeIds,
    report_ids: idsToSend,
    report_numbers: reportNumbers,
    report_count: idsToSend.length,
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
    const providerResponse = result.provider_result || null;
    logger.info('Customer report batch sent', {
      customerId,
      scopeIds,
      batchId,
      reportCount: idsToSend.length,
      channel: selectedChannel,
      dryRun: !env.notifications.sendReal,
      userId,
    });
    return {
      batchId,
      notificationId: result.id,
      reportIds: idsToSend,
      reportNumbers,
      reportCount: idsToSend.length,
      channel: selectedChannel,
      sentAt: result.sent_at || new Date().toISOString(),
      sentBy: userId,
      providerResponse,
      dryRun: !env.notifications.sendReal,
      duplicatesIgnored: forceResend ? duplicates : [],
    };
  } catch (err) {
    await query(`UPDATE notification_queue SET status = 'failed' WHERE id = $1`, [queued.id]);
    throw new AppError(err.message || 'Failed to send notification', 502, 'SEND_FAILED');
  }
};

/** @deprecated use countCustomersWaitingToSend */
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
         WHERE nq.status IN ('sent', 'dry_run')
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
  getCustomerDispatchStatus,
  enrichCustomersDispatchStatus,
  countCustomersWaitingToSend,
  listCustomersReadyToSend,
  READY_REPORTS_SQL,
  dispatchStatusFromCounts,
};
