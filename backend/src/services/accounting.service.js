const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');

const OPEN_INVOICE_STATUSES = ['issued', 'partial', 'paid'];

const syncCustomerArBalance = async (customerId, client = null) => {
  const q = client ? client.query.bind(client) : query;
  await q(
    `UPDATE customers SET account_balance = COALESCE((
      SELECT SUM(GREATEST(i.total - COALESCE(p.paid, 0), 0))
      FROM invoices i
      LEFT JOIN (
        SELECT invoice_id, SUM(amount) AS paid FROM payments GROUP BY invoice_id
      ) p ON p.invoice_id = i.id
      WHERE i.customer_id = $1 AND i.status = ANY($2::invoice_status[])
    ), 0), updated_at = NOW()
    WHERE id = $1`,
    [customerId, OPEN_INVOICE_STATUSES]
  );
};

const getCustomerStatement = async (customerId) => {
  const customer = await query(
    'SELECT id, full_name, full_name_ar, mobile, credit_limit, account_balance FROM customers WHERE id = $1',
    [customerId]
  );
  if (!customer.rows[0]) throw new AppError('Customer not found', 404, 'NOT_FOUND');

  const [invoices, payments] = await Promise.all([
    query(
      `SELECT i.id, i.invoice_number, i.total, i.status, i.created_at,
              COALESCE(p.paid, 0) AS total_paid,
              GREATEST(i.total - COALESCE(p.paid, 0), 0) AS balance_due
       FROM invoices i
       LEFT JOIN (SELECT invoice_id, SUM(amount) AS paid FROM payments GROUP BY invoice_id) p ON p.invoice_id = i.id
       WHERE i.customer_id = $1 AND i.status NOT IN ('cancelled', 'refunded')
       ORDER BY i.created_at DESC`,
      [customerId]
    ),
    query(
      `SELECT p.*, i.invoice_number, u.full_name AS received_by_name
       FROM payments p
       LEFT JOIN invoices i ON p.invoice_id = i.id
       LEFT JOIN users u ON p.received_by = u.id
       WHERE p.customer_id = $1
       ORDER BY p.created_at DESC
       LIMIT 50`,
      [customerId]
    ),
  ]);

  const totalInvoiced = invoices.rows.reduce((s, r) => s + parseFloat(r.total), 0);
  const totalPaid = payments.rows.reduce((s, r) => s + parseFloat(r.amount), 0);
  const balanceDue = invoices.rows.reduce((s, r) => s + parseFloat(r.balance_due), 0);

  return {
    customer: customer.rows[0],
    invoices: invoices.rows,
    payments: payments.rows,
    summary: {
      total_invoiced: totalInvoiced,
      total_paid: totalPaid,
      balance_due: balanceDue,
      credit_limit: parseFloat(customer.rows[0].credit_limit || 0),
    },
  };
};

const getDailyCollections = async (date) => {
  const day = date || new Date().toISOString().slice(0, 10);
  const result = await query(
    `SELECT p.*, i.invoice_number, c.full_name AS customer_name, u.full_name AS received_by_name
     FROM payments p
     JOIN invoices i ON p.invoice_id = i.id
     JOIN customers c ON p.customer_id = c.id
     LEFT JOIN users u ON p.received_by = u.id
     WHERE p.created_at::date = $1::date
     ORDER BY p.created_at DESC`,
    [day]
  );

  const byMethod = {};
  let total = 0;
  for (const row of result.rows) {
    const amt = parseFloat(row.amount);
    total += amt;
    byMethod[row.method] = (byMethod[row.method] || 0) + amt;
  }

  return { date: day, payments: result.rows, total, by_method: byMethod };
};

const getArAging = async () => {
  const result = await query(
    `SELECT c.id, c.full_name, c.mobile, c.credit_limit,
            COUNT(i.id) FILTER (WHERE GREATEST(i.total - COALESCE(p.paid, 0), 0) > 0.01) AS open_invoices,
            COALESCE(SUM(GREATEST(i.total - COALESCE(p.paid, 0), 0)), 0) AS balance_due,
            COALESCE(SUM(CASE WHEN i.created_at >= NOW() - INTERVAL '30 days' THEN GREATEST(i.total - COALESCE(p.paid, 0), 0) ELSE 0 END), 0) AS bucket_0_30,
            COALESCE(SUM(CASE WHEN i.created_at < NOW() - INTERVAL '30 days' AND i.created_at >= NOW() - INTERVAL '60 days' THEN GREATEST(i.total - COALESCE(p.paid, 0), 0) ELSE 0 END), 0) AS bucket_31_60,
            COALESCE(SUM(CASE WHEN i.created_at < NOW() - INTERVAL '60 days' THEN GREATEST(i.total - COALESCE(p.paid, 0), 0) ELSE 0 END), 0) AS bucket_61_plus
     FROM customers c
     LEFT JOIN invoices i ON i.customer_id = c.id AND i.status NOT IN ('cancelled', 'refunded')
     LEFT JOIN (SELECT invoice_id, SUM(amount) AS paid FROM payments GROUP BY invoice_id) p ON p.invoice_id = i.id
     WHERE c.is_active = true
     GROUP BY c.id
     HAVING COALESCE(SUM(GREATEST(i.total - COALESCE(p.paid, 0), 0)), 0) > 0.01
     ORDER BY balance_due DESC`
  );

  const totals = result.rows.reduce(
    (acc, r) => ({
      balance_due: acc.balance_due + parseFloat(r.balance_due),
      bucket_0_30: acc.bucket_0_30 + parseFloat(r.bucket_0_30),
      bucket_31_60: acc.bucket_31_60 + parseFloat(r.bucket_31_60),
      bucket_61_plus: acc.bucket_61_plus + parseFloat(r.bucket_61_plus),
    }),
    { balance_due: 0, bucket_0_30: 0, bucket_31_60: 0, bucket_61_plus: 0 }
  );

  return { customers: result.rows, totals };
};

const getRevenueSummary = async (from, to) => {
  const fromDate = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const toDate = to || new Date().toISOString().slice(0, 10);

  const [collections, invoiced, byMethod] = await Promise.all([
    query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM payments
       WHERE created_at::date BETWEEN $1::date AND $2::date`,
      [fromDate, toDate]
    ),
    query(
      `SELECT COALESCE(SUM(total), 0) AS total, COALESCE(SUM(tax_amount), 0) AS tax
       FROM invoices
       WHERE created_at::date BETWEEN $1::date AND $2::date AND status NOT IN ('cancelled', 'refunded')`,
      [fromDate, toDate]
    ),
    query(
      `SELECT method, COALESCE(SUM(amount), 0) AS total
       FROM payments
       WHERE created_at::date BETWEEN $1::date AND $2::date
       GROUP BY method`,
      [fromDate, toDate]
    ),
  ]);

  return {
    from: fromDate,
    to: toDate,
    invoiced_total: parseFloat(invoiced.rows[0].total),
    tax_total: parseFloat(invoiced.rows[0].tax),
    collections_total: parseFloat(collections.rows[0].total),
    by_method: byMethod.rows,
  };
};

const getDailyFullSummary = async (date) => {
  const day = date || new Date().toISOString().slice(0, 10);

  const [invoices, payments, byMethod] = await Promise.all([
    query(
      `SELECT
        COUNT(*) AS invoice_count,
        COALESCE(SUM(total), 0) AS invoiced_total,
        COALESCE(SUM(tax_amount), 0) AS tax_total,
        COALESCE(SUM(discount_amount), 0) AS discount_total,
        COUNT(*) FILTER (WHERE status IN ('issued', 'partial')) AS unpaid_count,
        COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_count,
        COUNT(*) FILTER (WHERE status IN ('refunded', 'partial_refunded')) AS refunded_count
       FROM invoices
       WHERE created_at::date = $1::date`,
      [day]
    ),
    query(
      `SELECT COALESCE(SUM(amount), 0) AS collections_total FROM payments WHERE created_at::date = $1::date`,
      [day]
    ),
    query(
      `SELECT method, COALESCE(SUM(amount), 0) AS total
       FROM payments WHERE created_at::date = $1::date GROUP BY method`,
      [day]
    ),
  ]);

  const inv = invoices.rows[0];
  const by_method = {};
  for (const row of byMethod.rows) by_method[row.method] = parseFloat(row.total);

  const net_collections = parseFloat(payments.rows[0].collections_total);

  return {
    date: day,
    invoiced_total: parseFloat(inv.invoiced_total),
    tax_total: parseFloat(inv.tax_total),
    discount_total: parseFloat(inv.discount_total),
    net_collections,
    collections_total: net_collections,
    invoice_count: parseInt(inv.invoice_count, 10),
    unpaid_count: parseInt(inv.unpaid_count, 10),
    cancelled_count: parseInt(inv.cancelled_count, 10),
    refunded_count: parseInt(inv.refunded_count, 10),
    by_method,
  };
};

const getDashboardSummary = async (date) => {
  const day = date || new Date().toISOString().slice(0, 10);
  const daily = await getDailyFullSummary(day);

  const [unpaid, cancelled] = await Promise.all([
    query(
      `SELECT COUNT(*) AS c FROM invoices i
       LEFT JOIN (SELECT invoice_id, SUM(amount) paid FROM payments GROUP BY invoice_id) p ON p.invoice_id = i.id
       WHERE i.status IN ('issued', 'partial') AND GREATEST(i.total - COALESCE(p.paid, 0), 0) > 0.01`
    ),
    query(`SELECT COUNT(*) AS c FROM invoices WHERE status = 'cancelled' AND created_at::date = $1::date`, [day]),
  ]);

  return {
    ...daily,
    today_collections: daily.net_collections,
    unpaid_invoices: parseInt(unpaid.rows[0].c, 10),
    cancelled_today: parseInt(cancelled.rows[0].c, 10),
  };
};

const getUnpaidInvoicesReport = async () => {
  const result = await query(
    `SELECT i.*, c.full_name AS customer_name,
            COALESCE(p.paid, 0) AS total_paid,
            GREATEST(i.total - COALESCE(p.paid, 0), 0) AS balance_due
     FROM invoices i
     JOIN customers c ON i.customer_id = c.id
     LEFT JOIN (SELECT invoice_id, SUM(amount) AS paid FROM payments GROUP BY invoice_id) p ON p.invoice_id = i.id
     WHERE i.status IN ('issued', 'partial') AND GREATEST(i.total - COALESCE(p.paid, 0), 0) > 0.01
     ORDER BY i.created_at DESC`
  );
  return result.rows;
};

const getVatReport = async (from, to) => {
  const fromDate = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const toDate = to || new Date().toISOString().slice(0, 10);
  const result = await query(
    `SELECT created_at::date AS day, SUM(tax_amount) AS tax, SUM(total) AS gross, COUNT(*) AS invoices
     FROM invoices
     WHERE created_at::date BETWEEN $1::date AND $2::date AND status NOT IN ('cancelled')
     GROUP BY day ORDER BY day`,
    [fromDate, toDate]
  );
  const totals = result.rows.reduce(
    (acc, r) => ({ tax: acc.tax + parseFloat(r.tax), gross: acc.gross + parseFloat(r.gross), invoices: acc.invoices + parseInt(r.invoices, 10) }),
    { tax: 0, gross: 0, invoices: 0 }
  );
  return { from: fromDate, to: toDate, days: result.rows, totals };
};

const getCancelledRefundedReport = async (from, to) => {
  const fromDate = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const toDate = to || new Date().toISOString().slice(0, 10);
  const result = await query(
    `SELECT i.invoice_number, i.status, i.total, i.created_at, c.full_name AS customer_name,
            COALESCE(r.refunded, 0) AS refunded_amount
     FROM invoices i
     JOIN customers c ON i.customer_id = c.id
     LEFT JOIN (SELECT invoice_id, SUM(amount) AS refunded FROM refunds GROUP BY invoice_id) r ON r.invoice_id = i.id
     WHERE i.created_at::date BETWEEN $1::date AND $2::date
       AND i.status IN ('cancelled', 'refunded', 'partial_refunded')
     ORDER BY i.created_at DESC`,
    [fromDate, toDate]
  );
  return { from: fromDate, to: toDate, invoices: result.rows };
};

const getRevenueByService = async (from, to) => {
  const fromDate = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const toDate = to || new Date().toISOString().slice(0, 10);
  const result = await query(
    `SELECT COALESCE(ii.description, t.name, 'General') AS service_name,
            SUM(ii.total_price) AS revenue, COUNT(*) AS line_count
     FROM invoice_items ii
     JOIN invoices i ON ii.invoice_id = i.id
     LEFT JOIN tests t ON ii.test_id = t.id
     WHERE i.created_at::date BETWEEN $1::date AND $2::date AND i.status NOT IN ('cancelled')
     GROUP BY service_name
     ORDER BY revenue DESC`,
    [fromDate, toDate]
  );
  return { from: fromDate, to: toDate, services: result.rows };
};

const getCustomerRevenueReport = async (from, to) => {
  const fromDate = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const toDate = to || new Date().toISOString().slice(0, 10);
  const result = await query(
    `SELECT c.full_name, c.mobile,
            COUNT(i.id) AS invoice_count,
            COALESCE(SUM(i.total), 0) AS invoiced,
            COALESCE(SUM(p.paid), 0) AS collected
     FROM customers c
     JOIN invoices i ON i.customer_id = c.id
     LEFT JOIN (SELECT invoice_id, SUM(amount) AS paid FROM payments GROUP BY invoice_id) p ON p.invoice_id = i.id
     WHERE i.created_at::date BETWEEN $1::date AND $2::date AND i.status NOT IN ('cancelled')
     GROUP BY c.id
     ORDER BY invoiced DESC`,
    [fromDate, toDate]
  );
  return { from: fromDate, to: toDate, customers: result.rows };
};

module.exports = {
  syncCustomerArBalance,
  getCustomerStatement,
  getDailyCollections,
  getArAging,
  getRevenueSummary,
  getDailyFullSummary,
  getDashboardSummary,
  getUnpaidInvoicesReport,
  getVatReport,
  getCancelledRefundedReport,
  getRevenueByService,
  getCustomerRevenueReport,
};
