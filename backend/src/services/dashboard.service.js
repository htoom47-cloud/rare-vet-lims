const { query } = require('../config/database');
const { reconcileSampleStatuses } = require('./samples.service');
const workflowEngine = require('./laboratory-workflow.service');

/** Lab calendar day (Saudi Arabia) for dashboard “today” metrics. */
const LAB_TZ = 'Asia/Riyadh';
const todayMatch = (column) =>
  `(${column} AT TIME ZONE '${LAB_TZ}')::date = (NOW() AT TIME ZONE '${LAB_TZ}')::date`;
const monthMatch = (column) =>
  `(${column} AT TIME ZONE '${LAB_TZ}')::date >= ((NOW() AT TIME ZONE '${LAB_TZ}')::date - INTERVAL '30 days')`;

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
