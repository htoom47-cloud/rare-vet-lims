const { query } = require('../config/database');

const getStats = async () => {
  const [
    dailySamples,
    revenue,
    topTests,
    rejected,
    technicianPerf,
    statusBreakdown,
  ] = await Promise.all([
    query(`SELECT COUNT(*) as count FROM samples WHERE created_at >= CURRENT_DATE`),
    query(`SELECT COALESCE(SUM(total), 0) as total FROM invoices WHERE created_at >= CURRENT_DATE AND status IN ('paid', 'partial')`),
    query(
      `SELECT t.name, t.name_ar, COUNT(st.id) as count
       FROM sample_tests st JOIN tests t ON st.test_id = t.id
       WHERE st.created_at >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY t.id ORDER BY count DESC LIMIT 10`
    ),
    query(`SELECT COUNT(*) as count FROM samples WHERE status = 'rejected' AND created_at >= CURRENT_DATE - INTERVAL '7 days'`),
    query(
      `SELECT u.full_name, COUNT(st.id) as completed_tests
       FROM sample_tests st JOIN users u ON st.technician_id = u.id
       WHERE st.status = 'completed' AND st.completed_at >= CURRENT_DATE - INTERVAL '7 days'
       GROUP BY u.id ORDER BY completed_tests DESC LIMIT 10`
    ),
    query(`SELECT status, COUNT(*) as count FROM samples GROUP BY status`),
  ]);

  const monthlyRevenue = await query(
    `SELECT DATE_TRUNC('day', created_at) as date, SUM(total) as revenue
     FROM invoices WHERE created_at >= CURRENT_DATE - INTERVAL '30 days' AND status IN ('paid', 'partial')
     GROUP BY date ORDER BY date`
  );

  return {
    daily_samples: parseInt(dailySamples.rows[0].count, 10),
    daily_revenue: parseFloat(revenue.rows[0].total),
    top_tests: topTests.rows,
    rejected_samples: parseInt(rejected.rows[0].count, 10),
    technician_performance: technicianPerf.rows,
    status_breakdown: statusBreakdown.rows,
    monthly_revenue: monthlyRevenue.rows,
  };
};

const getTechnicianDashboard = async (userId) => {
  const [queue, running, critical] = await Promise.all([
    query(
      `SELECT COUNT(*) as count FROM samples WHERE status IN ('received', 'pending') AND (assigned_technician = $1 OR assigned_technician IS NULL)`,
      [userId]
    ),
    query(
      `SELECT COUNT(*) as count FROM sample_tests WHERE technician_id = $1 AND status = 'running'`,
      [userId]
    ),
    query(
      `SELECT COUNT(*) as count FROM results r JOIN sample_tests st ON r.sample_test_id = st.id
       WHERE st.technician_id = $1 AND r.has_critical = true AND r.is_validated = false`,
      [userId]
    ),
  ]);

  return {
    queue_count: parseInt(queue.rows[0].count, 10),
    running_count: parseInt(running.rows[0].count, 10),
    critical_alerts: parseInt(critical.rows[0].count, 10),
  };
};

module.exports = { getStats, getTechnicianDashboard };
