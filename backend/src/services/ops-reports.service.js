const { query } = require('../config/database');
const { notDeleted } = require('../utils/soft-delete-sql');
const { labDateSql } = require('../utils/accounting-time');
const { resolveOperationsRange } = require('../utils/ops-report-range');
const accounting = require('./accounting.service');

const OPEN_STATUSES = `status NOT IN ('cancelled', 'refunded')`;

const getOperationsReport = async (from, to) => {
  const { fromDate, toDate } = resolveOperationsRange(from, to);
  const range = [fromDate, toDate];

  const [
    revenue,
    byService,
    byCustomer,
    invoiceStats,
    testCount,
    topTests,
    billedTests,
    sampleCount,
    samplesByStatus,
    approvedReports,
  ] = await Promise.all([
    accounting.getRevenueSummary(fromDate, toDate),
    accounting.getRevenueByService(fromDate, toDate),
    accounting.getCustomerRevenueReport(fromDate, toDate),
    query(
      `SELECT
         COUNT(*) FILTER (WHERE ${OPEN_STATUSES})::int AS invoice_count,
         COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_count,
         COALESCE(SUM(discount_amount) FILTER (WHERE ${OPEN_STATUSES}), 0) AS discount_total
       FROM invoices
       WHERE ${labDateSql('created_at')} BETWEEN $1::date AND $2::date`,
      range
    ),
    query(
      `SELECT COUNT(*)::int AS count
       FROM sample_tests st
       JOIN samples s ON s.id = st.sample_id
       WHERE ${notDeleted('s')}
         AND st.status IS DISTINCT FROM 'cancelled'
         AND ${labDateSql('s.created_at')} BETWEEN $1::date AND $2::date`,
      range
    ),
    query(
      `SELECT t.id, t.code, t.name, t.name_ar, COUNT(st.id)::int AS count
       FROM sample_tests st
       JOIN tests t ON t.id = st.test_id
       JOIN samples s ON s.id = st.sample_id
       WHERE ${notDeleted('s')}
         AND st.status IS DISTINCT FROM 'cancelled'
         AND ${labDateSql('s.created_at')} BETWEEN $1::date AND $2::date
       GROUP BY t.id
       ORDER BY count DESC
       LIMIT 25`,
      range
    ),
    query(
      `SELECT t.id, t.code, t.name, t.name_ar,
              COALESCE(SUM(ii.quantity), 0) AS quantity,
              COALESCE(SUM(ii.total_price), 0) AS revenue,
              COUNT(*)::int AS line_count
       FROM invoice_items ii
       JOIN invoices i ON i.id = ii.invoice_id
       JOIN tests t ON t.id = ii.test_id
       WHERE ${labDateSql('i.created_at')} BETWEEN $1::date AND $2::date
         AND i.status NOT IN ('cancelled', 'refunded')
         AND ii.test_id IS NOT NULL
       GROUP BY t.id
       ORDER BY revenue DESC
       LIMIT 50`,
      range
    ),
    query(
      `SELECT COUNT(*)::int AS count
       FROM samples s
       WHERE ${notDeleted('s')}
         AND ${labDateSql('s.created_at')} BETWEEN $1::date AND $2::date`,
      range
    ),
    query(
      `SELECT s.status, COUNT(*)::int AS count
       FROM samples s
       WHERE ${notDeleted('s')}
         AND ${labDateSql('s.created_at')} BETWEEN $1::date AND $2::date
       GROUP BY s.status
       ORDER BY count DESC`,
      range
    ),
    query(
      `SELECT COUNT(*)::int AS count
       FROM reports r
       WHERE ${notDeleted('r')}
         AND (
           r.vet_approved_by IS NOT NULL
           OR r.lab_specialist_approved_by IS NOT NULL
           OR r.is_final = true
         )
         AND ${labDateSql('COALESCE(r.vet_approved_at, r.lab_specialist_approved_at, r.created_at)')}
             BETWEEN $1::date AND $2::date`,
      range
    ),
  ]);

  const stats = invoiceStats.rows[0] || {};
  return {
    from: fromDate,
    to: toDate,
    sales: {
      invoice_count: stats.invoice_count || 0,
      cancelled_count: stats.cancelled_count || 0,
      discount_total: parseFloat(stats.discount_total || 0),
      invoiced_invoices: revenue.invoiced_invoices,
      credit_notes_total: revenue.credit_notes_total,
      invoiced_total: revenue.invoiced_total,
      tax_total: revenue.tax_total,
      collections_total: revenue.collections_total,
      by_method: revenue.by_method || [],
      by_service: byService.services || [],
      by_customer: byCustomer.customers || [],
    },
    tests: {
      test_count: testCount.rows[0]?.count || 0,
      top_tests: topTests.rows,
      billed_tests: billedTests.rows.map((row) => ({
        ...row,
        quantity: parseFloat(row.quantity || 0),
        revenue: parseFloat(row.revenue || 0),
      })),
    },
    samples: {
      sample_count: sampleCount.rows[0]?.count || 0,
      by_status: samplesByStatus.rows,
      approved_reports: approvedReports.rows[0]?.count || 0,
    },
  };
};

module.exports = { getOperationsReport };
