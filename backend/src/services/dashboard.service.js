const { query } = require('../config/database');
const { reconcileSampleStatuses } = require('./samples.service');
const workflowEngine = require('./laboratory-workflow.service');
const env = require('../config/env');
const portalSync = require('./portal-sync.service');
const reportNotify = require('./customer-report-notifications.service');

/** Lab calendar day (Saudi Arabia) for dashboard “today” metrics. */
const LAB_TZ = 'Asia/Riyadh';
const todayMatch = (column) =>
  `(${column} AT TIME ZONE '${LAB_TZ}')::date = (NOW() AT TIME ZONE '${LAB_TZ}')::date`;
const monthMatch = (column) =>
  `(${column} AT TIME ZONE '${LAB_TZ}')::date >= ((NOW() AT TIME ZONE '${LAB_TZ}')::date - INTERVAL '30 days')`;

const portalVisible = portalSync.portalVisibilitySql('r');

const getOperationsStats = async () => {
  const invoiceRequiredFilter = env.features?.requireInvoiceBeforeBarcode
    ? `AND NOT EXISTS (
         SELECT 1 FROM invoices i
         WHERE i.sample_id = s.id AND i.status NOT IN ('cancelled', 'refunded')
       )
       AND NOT EXISTS (
         SELECT 1 FROM invoices i
         JOIN invoice_items ii ON ii.invoice_id = i.id
         WHERE i.customer_id = s.customer_id AND ii.animal_id = s.animal_id
           AND i.status NOT IN ('cancelled', 'refunded')
       )
       AND COALESCE((SELECT credit_limit FROM customers c WHERE c.id = s.customer_id), 0) <= 0`
    : '';

  const handoverPendingFilter = env.features?.requireLabHandover
    ? ' AND s.lab_handover_at IS NULL'
    : '';

  const [
    awaitingInvoice,
    awaitingBarcodePrint,
    inLab,
    pendingApproval,
    readyToSend,
    failedMessages,
    dataErrors,
  ] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS count FROM samples s
       WHERE s.status = 'pending' ${invoiceRequiredFilter}`
    ),
    query(
      `SELECT COUNT(*)::int AS count FROM samples s
       WHERE s.status = 'pending' ${handoverPendingFilter}`
    ),
    query(
      `SELECT COUNT(*)::int AS count FROM samples s
       WHERE s.status IN ('received', 'running')
         ${env.features?.requireLabHandover ? 'AND s.lab_handover_at IS NOT NULL' : ''}`
    ),
    query(
      `SELECT COUNT(*)::int AS count FROM reports r
       WHERE r.pdf_url IS NOT NULL
         AND r.lab_specialist_approved_by IS NULL
         AND r.vet_approved_by IS NULL
         AND r.is_final IS NOT TRUE`
    ),
    query(
      `SELECT COUNT(DISTINCT c.id)::int AS count
       FROM customers c
       JOIN samples s ON s.customer_id = c.id
       JOIN reports r ON r.sample_id = s.id AND ${portalVisible}
       WHERE c.is_active = true
         AND NOT EXISTS (
           SELECT 1 FROM notification_queue nq
           WHERE nq.status = 'sent'
             AND nq.metadata->>'customer_id' = c.id::text
             AND nq.metadata->'report_ids' ? r.id::text
         )`
    ),
    query(
      `SELECT COUNT(*)::int AS count FROM notification_queue
       WHERE status = 'failed'
         AND created_at >= NOW() - INTERVAL '7 days'`
    ),
    query(
      `SELECT COUNT(*)::int AS count FROM samples s
       JOIN animals a ON a.id = s.animal_id
       WHERE a.owner_id IS DISTINCT FROM s.customer_id`
    ),
  ]);

  return {
    awaiting_invoice: awaitingInvoice.rows[0]?.count || 0,
    awaiting_barcode_print: awaitingBarcodePrint.rows[0]?.count || 0,
    in_lab: inLab.rows[0]?.count || 0,
    pending_approval: pendingApproval.rows[0]?.count || 0,
    ready_to_send: readyToSend.rows[0]?.count || 0,
    failed_messages: failedMessages.rows[0]?.count || 0,
    data_errors: dataErrors.rows[0]?.count || 0,
  };
};

const getStats = async () => {
  await reconcileSampleStatuses();

  const sampleDayCol = 'COALESCE(s.received_date, s.collection_date, s.created_at)';

  const [
    dailySamples,
    monthSamples,
    pendingSamples,
    collections,
    monthCollections,
    invoiced,
    monthInvoiced,
    topTests,
    rejected,
    activeTests,
    technicianPerf,
    statusBreakdown,
  ] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS count FROM samples s
       WHERE ${todayMatch(sampleDayCol)}`
    ),
    query(
      `SELECT COUNT(*)::int AS count FROM samples s
       WHERE ${monthMatch(sampleDayCol)}`
    ),
    query(
      `SELECT COUNT(*)::int AS count FROM samples
       WHERE status IN ('received', 'running')`
    ),
    query(
      `SELECT COALESCE(SUM(p.amount), 0)::numeric AS total FROM payments p
       WHERE ${todayMatch('p.created_at')}`
    ),
    query(
      `SELECT COALESCE(SUM(p.amount), 0)::numeric AS total FROM payments p
       WHERE ${monthMatch('p.created_at')}`
    ),
    query(
      `SELECT COALESCE(SUM(i.total), 0)::numeric AS total FROM invoices i
       WHERE ${todayMatch('i.created_at')}
         AND i.status NOT IN ('cancelled', 'refunded')`
    ),
    query(
      `SELECT COALESCE(SUM(i.total), 0)::numeric AS total FROM invoices i
       WHERE ${monthMatch('i.created_at')}
         AND i.status NOT IN ('cancelled', 'refunded')`
    ),
    query(
      `SELECT t.name, t.name_ar, COUNT(st.id)::int AS count
       FROM sample_tests st
       JOIN tests t ON st.test_id = t.id
       JOIN samples s ON s.id = st.sample_id
       WHERE ${monthMatch('COALESCE(s.received_date, s.collection_date, s.created_at)')}
       GROUP BY t.id ORDER BY count DESC LIMIT 10`
    ),
    query(
      `SELECT COUNT(*)::int AS count FROM samples
       WHERE status = 'rejected'
         AND (created_at AT TIME ZONE '${LAB_TZ}')::date
             >= ((NOW() AT TIME ZONE '${LAB_TZ}')::date - INTERVAL '7 days')`
    ),
    query(
      `SELECT COUNT(st.id)::int AS count
       FROM sample_tests st
       JOIN samples s ON s.id = st.sample_id
       WHERE s.status IN ('received', 'running')
         AND EXISTS (SELECT 1 FROM test_parameters tp WHERE tp.test_id = st.test_id)
         AND NOT EXISTS (
           SELECT 1 FROM results r
           JOIN result_values rv ON rv.result_id = r.id
           WHERE r.sample_test_id = st.id
         )`
    ),
    query(
      `SELECT u.full_name, COUNT(st.id)::int AS completed_tests
       FROM sample_tests st JOIN users u ON st.technician_id = u.id
       WHERE st.status = 'completed'
         AND st.completed_at >= (NOW() AT TIME ZONE '${LAB_TZ}')::date - INTERVAL '7 days'
       GROUP BY u.id ORDER BY completed_tests DESC LIMIT 10`
    ),
    query(`SELECT status, COUNT(*)::int AS count FROM samples GROUP BY status`),
  ]);

  const monthlyRevenue = await query(
    `SELECT DATE_TRUNC('day', p.created_at AT TIME ZONE '${LAB_TZ}')::date AS date,
            SUM(p.amount)::numeric AS revenue
     FROM payments p
     WHERE ${monthMatch('p.created_at')}
     GROUP BY 1 ORDER BY 1`
  );

  return {
    daily_samples: dailySamples.rows[0]?.count || 0,
    month_samples: monthSamples.rows[0]?.count || 0,
    pending_samples: pendingSamples.rows[0]?.count || 0,
    daily_revenue: parseFloat(collections.rows[0]?.total || 0),
    month_revenue: parseFloat(monthCollections.rows[0]?.total || 0),
    daily_invoiced: parseFloat(invoiced.rows[0]?.total || 0),
    month_invoiced: parseFloat(monthInvoiced.rows[0]?.total || 0),
    top_tests: topTests.rows,
    rejected_samples: rejected.rows[0]?.count || 0,
    active_tests: activeTests.rows[0]?.count || 0,
    technician_performance: technicianPerf.rows,
    status_breakdown: statusBreakdown.rows,
    monthly_revenue: monthlyRevenue.rows.map((r) => ({
      date: r.date,
      revenue: parseFloat(r.revenue || 0),
    })),
    operations: await getOperationsStats(),
    customers_ready_to_send: await reportNotify.listCustomersReadyToSend(10),
    ...(workflowEngine.isEnabled()
      ? { workflow: await workflowEngine.getWorkflowDashboardCounts() }
      : {}),
  };
};

const getTechnicianDashboard = async (userId) => {
  const [queue, running, critical] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS count FROM samples
       WHERE status = 'received'
         AND (assigned_technician = $1 OR assigned_technician IS NULL)`,
      [userId]
    ),
    query(
      `SELECT COUNT(*)::int AS count FROM sample_tests WHERE technician_id = $1 AND status = 'running'`,
      [userId]
    ),
    query(
      `SELECT COUNT(*)::int AS count FROM results r
       JOIN sample_tests st ON r.sample_test_id = st.id
       WHERE st.technician_id = $1 AND r.has_critical = true AND r.is_validated = false`,
      [userId]
    ),
  ]);

  return {
    queue_count: queue.rows[0]?.count || 0,
    running_count: running.rows[0]?.count || 0,
    critical_alerts: critical.rows[0]?.count || 0,
  };
};

module.exports = { getStats, getTechnicianDashboard };
