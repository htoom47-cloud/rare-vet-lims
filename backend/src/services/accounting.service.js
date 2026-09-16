const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { notDeleted } = require('../utils/soft-delete-sql');
const { creditNotesTableExists, ISSUED_CREDITS_JOIN } = require('../utils/credit-notes-schema');
const { toHalalas, fromHalalas, asIntegerHalalas, expectedCashHalalas } = require('../utils/money');
const { labDay, labDateSql, defaultLabRange } = require('../utils/accounting-time');

const OPEN_INVOICE_STATUSES = ['issued', 'partial', 'paid'];

const remainingSql = (withCredits, paidAlias = 'p') => (
  withCredits
    ? `GREATEST(i.total - COALESCE(${paidAlias}.paid, 0) - COALESCE(cn.credited, 0), 0)`
    : `GREATEST(i.total - COALESCE(${paidAlias}.paid, 0), 0)`
);

const paymentsJoin = (alias = 'p') => `
  LEFT JOIN (
    SELECT invoice_id, SUM(amount) AS paid FROM payments GROUP BY invoice_id
  ) ${alias} ON ${alias}.invoice_id = i.id
`;

const syncCustomerArBalance = async (customerId, client = null) => {
  const q = client ? client.query.bind(client) : query;
  const withCredits = await creditNotesTableExists(client);
  await q(
    `UPDATE customers SET account_balance = COALESCE((
      SELECT SUM(${remainingSql(withCredits)})
      FROM invoices i
      ${paymentsJoin('p')}
      ${withCredits ? ISSUED_CREDITS_JOIN : ''}
      WHERE i.customer_id = $1
        AND ${notDeleted('i')}
        AND i.status = ANY($2::invoice_status[])
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

  const withCredits = await creditNotesTableExists();
  const [invoices, payments, creditNoteRows] = await Promise.all([
    query(
      `SELECT i.id, i.invoice_number, i.total, i.status, i.created_at,
              COALESCE(p.paid, 0) AS total_paid,
              ${withCredits ? 'COALESCE(cn.credited, 0)' : '0'} AS credit_notes_total,
              ${remainingSql(withCredits)} AS balance_due
       FROM invoices i
       ${paymentsJoin('p')}
       ${withCredits ? ISSUED_CREDITS_JOIN : ''}
       WHERE i.customer_id = $1
         AND ${notDeleted('i')}
         AND i.status NOT IN ('cancelled', 'refunded')
       ORDER BY i.created_at DESC`,
      [customerId]
    ),
    query(
      `SELECT p.*, i.invoice_number, u.full_name AS received_by_name
       FROM payments p
       LEFT JOIN invoices i ON p.invoice_id = i.id
       LEFT JOIN users u ON p.received_by = u.id
       WHERE p.customer_id = $1
         AND (p.invoice_id IS NULL OR ${notDeleted('i')})
       ORDER BY p.created_at DESC
       LIMIT 50`,
      [customerId]
    ),
    withCredits
      ? query(
        `SELECT cn.id, cn.credit_note_number, cn.invoice_id, cn.total, cn.tax_amount,
                cn.subtotal, cn.reason, cn.status, cn.created_at, i.invoice_number
         FROM credit_notes cn
         JOIN invoices i ON i.id = cn.invoice_id
         WHERE cn.customer_id = $1 AND cn.status = 'issued'
         ORDER BY cn.created_at DESC`,
        [customerId]
      )
      : Promise.resolve({ rows: [] }),
  ]);

  const totalInvoiced = invoices.rows.reduce((s, r) => s + parseFloat(r.total), 0);
  const totalPaid = payments.rows.reduce((s, r) => s + parseFloat(r.amount), 0);
  const totalCredited = creditNoteRows.rows.reduce((s, r) => s + parseFloat(r.total), 0);
  const balanceDue = invoices.rows.reduce((s, r) => s + parseFloat(r.balance_due), 0);

  return {
    customer: customer.rows[0],
    invoices: invoices.rows,
    payments: payments.rows,
    credit_notes: creditNoteRows.rows,
    summary: {
      total_invoiced: totalInvoiced,
      total_paid: totalPaid,
      total_credited: totalCredited,
      balance_due: balanceDue,
      credit_limit: parseFloat(customer.rows[0].credit_limit || 0),
    },
  };
};

const getDailyCollections = async (date) => {
  const day = date || labDay();
  const result = await query(
    `SELECT p.*, i.invoice_number, c.full_name AS customer_name, u.full_name AS received_by_name
     FROM payments p
     JOIN invoices i ON p.invoice_id = i.id
     JOIN customers c ON p.customer_id = c.id
     LEFT JOIN users u ON p.received_by = u.id
     WHERE ${labDateSql('p.created_at')} = $1::date
     ORDER BY p.created_at DESC`,
    [day]
  );

  const refundsResult = await query(
    `SELECT r.*, i.invoice_number, c.full_name AS customer_name
     FROM refunds r
     JOIN invoices i ON r.invoice_id = i.id
     LEFT JOIN customers c ON i.customer_id = c.id
     WHERE ${labDateSql('r.created_at')} = $1::date
     ORDER BY r.created_at DESC`,
    [day]
  );

  const byMethod = {};
  let paymentsH = 0;
  for (const row of result.rows) {
    const amtH = toHalalas(row.amount);
    paymentsH += amtH;
    byMethod[row.method] = (byMethod[row.method] || 0) + fromHalalas(amtH);
  }
  const refundsH = refundsResult.rows.reduce((sum, row) => sum + toHalalas(row.amount), 0);

  return {
    date: day,
    payments: result.rows,
    refunds: refundsResult.rows,
    total: fromHalalas(paymentsH),
    refunds_total: fromHalalas(refundsH),
    net_total: fromHalalas(paymentsH - refundsH),
    by_method: byMethod,
  };
};

const getArAging = async () => {
  const withCredits = await creditNotesTableExists();
  const due = remainingSql(withCredits);
  const result = await query(
    `SELECT c.id, c.full_name, c.mobile, c.credit_limit,
            COUNT(i.id) FILTER (WHERE ${due} > 0.01) AS open_invoices,
            COALESCE(SUM(${due}), 0) AS balance_due,
            COALESCE(SUM(CASE WHEN i.created_at >= NOW() - INTERVAL '30 days' THEN ${due} ELSE 0 END), 0) AS bucket_0_30,
            COALESCE(SUM(CASE WHEN i.created_at < NOW() - INTERVAL '30 days' AND i.created_at >= NOW() - INTERVAL '60 days' THEN ${due} ELSE 0 END), 0) AS bucket_31_60,
            COALESCE(SUM(CASE WHEN i.created_at < NOW() - INTERVAL '60 days' THEN ${due} ELSE 0 END), 0) AS bucket_61_plus
     FROM customers c
     LEFT JOIN invoices i ON i.customer_id = c.id AND ${notDeleted('i')} AND i.status NOT IN ('cancelled', 'refunded')
     ${paymentsJoin('p')}
     ${withCredits ? ISSUED_CREDITS_JOIN : ''}
     WHERE c.is_active = true
     GROUP BY c.id
     HAVING COALESCE(SUM(${due}), 0) > 0.01
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
  const { fromDate, toDate } = defaultLabRange(from, to);
  const withCredits = await creditNotesTableExists();

  const [collections, invoiced, byMethod, credits] = await Promise.all([
    query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM payments
       WHERE ${labDateSql('created_at')} BETWEEN $1::date AND $2::date`,
      [fromDate, toDate]
    ),
    query(
      `SELECT COALESCE(SUM(total), 0) AS total, COALESCE(SUM(tax_amount), 0) AS tax
       FROM invoices
       WHERE ${labDateSql('created_at')} BETWEEN $1::date AND $2::date AND status NOT IN ('cancelled', 'refunded')`,
      [fromDate, toDate]
    ),
    query(
      `SELECT method, COALESCE(SUM(amount), 0) AS total
       FROM payments
       WHERE ${labDateSql('created_at')} BETWEEN $1::date AND $2::date
       GROUP BY method`,
      [fromDate, toDate]
    ),
    withCredits
      ? query(
        `SELECT COALESCE(SUM(total), 0) AS total, COALESCE(SUM(tax_amount), 0) AS tax
         FROM credit_notes
         WHERE status = 'issued' AND ${labDateSql('created_at')} BETWEEN $1::date AND $2::date`,
        [fromDate, toDate]
      )
      : Promise.resolve({ rows: [{ total: 0, tax: 0 }] }),
  ]);

  const invoicedTotal = parseFloat(invoiced.rows[0].total);
  const invoicedTax = parseFloat(invoiced.rows[0].tax);
  const creditTotal = parseFloat(credits.rows[0].total);
  const creditTax = parseFloat(credits.rows[0].tax);

  return {
    from: fromDate,
    to: toDate,
    invoiced_invoices: invoicedTotal,
    credit_notes_total: creditTotal,
    invoiced_total: invoicedTotal - creditTotal,
    tax_invoices: invoicedTax,
    tax_credit_notes: creditTax,
    tax_total: invoicedTax - creditTax,
    collections_total: parseFloat(collections.rows[0].total),
    by_method: byMethod.rows,
  };
};

const TABLE_MISSING = '42P01';
const COLUMN_MISSING = '42703';

const sumCashPurchaseOutflowsHalalas = async (day, client = null) => {
  const q = client ? client.query.bind(client) : query;
  try {
    const { rows } = await q(
      `SELECT COALESCE(SUM(total_halalas), 0)::bigint AS h
       FROM purchase_invoices
       WHERE deleted_at IS NULL
         AND status = 'posted'
         AND payment_method = 'cash'
         AND posting_date = $1::date`,
      [day]
    );
    return asIntegerHalalas(rows[0].h || 0);
  } catch (err) {
    if (err.code === TABLE_MISSING || err.code === COLUMN_MISSING) return 0;
    throw err;
  }
};

const getDailyFullSummary = async (date, client = null) => {
  const day = date || labDay();
  const q = client ? client.query.bind(client) : query;
  const withCredits = await creditNotesTableExists(client);

  const due = remainingSql(withCredits);
  const [invoices, payments, byMethod, credits, refunds] = await Promise.all([
    q(
      `SELECT
        COUNT(*) AS invoice_count,
        COALESCE(SUM(i.total), 0) AS invoiced_total,
        COALESCE(SUM(i.tax_amount), 0) AS tax_total,
        COALESCE(SUM(i.discount_amount), 0) AS discount_total,
        COUNT(*) FILTER (
          WHERE i.status NOT IN ('cancelled', 'refunded', 'partial_refunded')
            AND ${due} > 0.01
        ) AS unpaid_count,
        COUNT(*) FILTER (WHERE i.status = 'cancelled') AS cancelled_count,
        COUNT(*) FILTER (WHERE i.status IN ('refunded', 'partial_refunded')) AS refunded_count
       FROM invoices i
       ${paymentsJoin('p')}
       ${withCredits ? ISSUED_CREDITS_JOIN : ''}
       WHERE ${labDateSql('i.created_at')} = $1::date`,
      [day]
    ),
    q(
      `SELECT COALESCE(SUM(amount), 0) AS collections_total FROM payments WHERE ${labDateSql('created_at')} = $1::date`,
      [day]
    ),
    q(
      `SELECT method, COALESCE(SUM(amount), 0) AS total
       FROM payments WHERE ${labDateSql('created_at')} = $1::date GROUP BY method`,
      [day]
    ),
    withCredits
      ? q(
        `SELECT COALESCE(SUM(total), 0) AS total, COALESCE(SUM(tax_amount), 0) AS tax, COUNT(*) AS n
         FROM credit_notes
         WHERE status = 'issued' AND ${labDateSql('created_at')} = $1::date`,
        [day]
      )
      : Promise.resolve({ rows: [{ total: 0, tax: 0, n: 0 }] }),
    q(
      `SELECT COALESCE(SUM(amount), 0) AS refunds_total, COUNT(*) AS refund_count
       FROM refunds WHERE ${labDateSql('created_at')} = $1::date`,
      [day]
    ),
  ]);

  const inv = invoices.rows[0];
  const by_method = {};
  for (const row of byMethod.rows) by_method[row.method] = parseFloat(row.total);

  const collectionsH = toHalalas(payments.rows[0].collections_total);
  const refundsH = toHalalas(refunds.rows[0].refunds_total);
  const cashPurchaseOutflowsH = await sumCashPurchaseOutflowsHalalas(day, client);
  const net_collections = fromHalalas(collectionsH - refundsH);
  const cash_purchase_outflows = fromHalalas(cashPurchaseOutflowsH);
  const expected_cash = fromHalalas(expectedCashHalalas(collectionsH, refundsH, cashPurchaseOutflowsH));
  const creditTotal = parseFloat(credits.rows[0].total);
  const creditTax = parseFloat(credits.rows[0].tax);

  return {
    date: day,
    invoiced_invoices: parseFloat(inv.invoiced_total),
    credit_notes_total: creditTotal,
    invoiced_total: parseFloat(inv.invoiced_total) - creditTotal,
    tax_invoices: parseFloat(inv.tax_total),
    tax_credit_notes: creditTax,
    tax_total: parseFloat(inv.tax_total) - creditTax,
    discount_total: parseFloat(inv.discount_total),
    net_collections,
    collections_total: fromHalalas(collectionsH),
    refunds_total: fromHalalas(refundsH),
    cash_purchase_outflows,
    expected_cash,
    refund_count: parseInt(refunds.rows[0].refund_count, 10),
    invoice_count: parseInt(inv.invoice_count, 10),
    credit_note_count: parseInt(credits.rows[0].n, 10),
    unpaid_count: parseInt(inv.unpaid_count, 10),
    cancelled_count: parseInt(inv.cancelled_count, 10),
    refunded_count: parseInt(inv.refunded_count, 10),
    by_method,
  };
};

const getDashboardSummary = async (date) => {
  const day = date || labDay();
  const daily = await getDailyFullSummary(day);
  const withCredits = await creditNotesTableExists();
  const due = remainingSql(withCredits);

  const [unpaid, cancelled] = await Promise.all([
    query(
      `SELECT COUNT(*) AS c FROM invoices i
       ${paymentsJoin('p')}
       ${withCredits ? ISSUED_CREDITS_JOIN : ''}
       WHERE i.status IN ('issued', 'partial') AND ${due} > 0.01`
    ),
    query(`SELECT COUNT(*) AS c FROM invoices WHERE status = 'cancelled' AND ${labDateSql('created_at')} = $1::date`, [day]),
  ]);

  return {
    ...daily,
    today_collections: daily.net_collections,
    unpaid_invoices: parseInt(unpaid.rows[0].c, 10),
    cancelled_today: parseInt(cancelled.rows[0].c, 10),
  };
};

const getUnpaidInvoicesReport = async () => {
  const withCredits = await creditNotesTableExists();
  const due = remainingSql(withCredits);
  const result = await query(
    `SELECT i.*, c.full_name AS customer_name,
            COALESCE(p.paid, 0) AS total_paid,
            ${due} AS balance_due
     FROM invoices i
     JOIN customers c ON i.customer_id = c.id
     ${paymentsJoin('p')}
     ${withCredits ? ISSUED_CREDITS_JOIN : ''}
     WHERE i.status NOT IN ('cancelled', 'refunded', 'partial_refunded')
       AND ${due} > 0.01
     ORDER BY i.created_at DESC`
  );
  return result.rows;
};

const getVatReport = async (from, to) => {
  const { fromDate, toDate } = defaultLabRange(from, to);
  const withCredits = await creditNotesTableExists();

  const invoiceDocs = await query(
    `SELECT ${labDateSql('created_at')} AS day, invoice_number AS number, tax_amount AS tax, total AS gross
     FROM invoices
     WHERE ${labDateSql('created_at')} BETWEEN $1::date AND $2::date AND status NOT IN ('cancelled')
     ORDER BY created_at`,
    [fromDate, toDate]
  );
  const creditDocs = withCredits
    ? await query(
      `SELECT ${labDateSql('created_at')} AS day, credit_note_number AS number, tax_amount AS tax, total AS gross
       FROM credit_notes
       WHERE status = 'issued' AND ${labDateSql('created_at')} BETWEEN $1::date AND $2::date
       ORDER BY created_at`,
      [fromDate, toDate]
    )
    : { rows: [] };

  const documents = [
    ...invoiceDocs.rows.map((row) => ({
      type: 'invoice',
      date: row.day,
      number: row.number,
      tax: parseFloat(row.tax),
      gross: parseFloat(row.gross),
    })),
    ...creditDocs.rows.map((row) => ({
      type: 'credit_note',
      date: row.day,
      number: row.number,
      tax: -parseFloat(row.tax),
      gross: -parseFloat(row.gross),
    })),
  ];

  const dayMap = new Map();
  for (const doc of documents) {
    const key = String(doc.date).slice(0, 10);
    if (!dayMap.has(key)) {
      dayMap.set(key, { day: key, tax: 0, gross: 0, invoices: 0, credit_notes: 0 });
    }
    const bucket = dayMap.get(key);
    bucket.tax += doc.tax;
    bucket.gross += doc.gross;
    if (doc.type === 'invoice') bucket.invoices += 1;
    else bucket.credit_notes += 1;
  }
  const days = [...dayMap.values()].sort((a, b) => String(a.day).localeCompare(String(b.day)));

  const invoiceTax = invoiceDocs.rows.reduce((s, r) => s + parseFloat(r.tax), 0);
  const invoiceGross = invoiceDocs.rows.reduce((s, r) => s + parseFloat(r.gross), 0);
  const creditTax = creditDocs.rows.reduce((s, r) => s + parseFloat(r.tax), 0);
  const creditGross = creditDocs.rows.reduce((s, r) => s + parseFloat(r.gross), 0);

  return {
    from: fromDate,
    to: toDate,
    documents,
    invoices: invoiceDocs.rows,
    credit_notes: creditDocs.rows,
    days,
    totals: {
      tax: invoiceTax - creditTax,
      gross: invoiceGross - creditGross,
      invoices: invoiceDocs.rows.length,
      credit_notes: creditDocs.rows.length,
      invoice_tax: invoiceTax,
      invoice_gross: invoiceGross,
      credit_note_tax: creditTax,
      credit_note_gross: creditGross,
    },
  };
};

const getCancelledRefundedReport = async (from, to) => {
  const { fromDate, toDate } = defaultLabRange(from, to);
  const result = await query(
    `SELECT i.invoice_number, i.status, i.total, i.created_at, c.full_name AS customer_name,
            COALESCE(r.refunded, 0) AS refunded_amount
     FROM invoices i
     JOIN customers c ON i.customer_id = c.id
     LEFT JOIN (SELECT invoice_id, SUM(amount) AS refunded FROM refunds GROUP BY invoice_id) r ON r.invoice_id = i.id
     WHERE ${labDateSql('i.created_at')} BETWEEN $1::date AND $2::date
       AND i.status IN ('cancelled', 'refunded', 'partial_refunded')
     ORDER BY i.created_at DESC`,
    [fromDate, toDate]
  );
  return { from: fromDate, to: toDate, invoices: result.rows };
};

const getRevenueByService = async (from, to) => {
  const { fromDate, toDate } = defaultLabRange(from, to);
  const withCredits = await creditNotesTableExists();

  const invoiceLines = await query(
    `SELECT COALESCE(ii.description, t.name, 'General') AS service_name,
            SUM(ii.total_price) AS revenue, COUNT(*) AS line_count
     FROM invoice_items ii
     JOIN invoices i ON ii.invoice_id = i.id
     LEFT JOIN tests t ON ii.test_id = t.id
     WHERE ${labDateSql('i.created_at')} BETWEEN $1::date AND $2::date AND i.status NOT IN ('cancelled')
     GROUP BY service_name`,
    [fromDate, toDate]
  );

  let creditLines = { rows: [] };
  if (withCredits) {
    creditLines = await query(
      `SELECT COALESCE(ii.description, t.name, 'General') AS service_name,
              SUM(
                -cn.subtotal * (
                  ii.total_price / NULLIF(item_tot.item_sum, 0)
                )
              ) AS revenue,
              0 AS line_count
       FROM credit_notes cn
       JOIN invoices i ON i.id = cn.invoice_id
       JOIN invoice_items ii ON ii.invoice_id = i.id
       LEFT JOIN tests t ON ii.test_id = t.id
       JOIN (
         SELECT invoice_id, SUM(total_price) AS item_sum
         FROM invoice_items
         GROUP BY invoice_id
       ) item_tot ON item_tot.invoice_id = i.id
       WHERE cn.status = 'issued'
         AND ${labDateSql('cn.created_at')} BETWEEN $1::date AND $2::date
         AND i.status NOT IN ('cancelled')
       GROUP BY service_name`,
      [fromDate, toDate]
    );
  }

  const map = new Map();
  for (const row of [...invoiceLines.rows, ...creditLines.rows]) {
    const name = row.service_name;
    if (!map.has(name)) map.set(name, { service_name: name, revenue: 0, line_count: 0 });
    const cur = map.get(name);
    cur.revenue += parseFloat(row.revenue);
    cur.line_count += parseInt(row.line_count, 10) || 0;
  }

  const services = [...map.values()].sort((a, b) => b.revenue - a.revenue);
  return { from: fromDate, to: toDate, services };
};

const getCustomerRevenueReport = async (from, to) => {
  const { fromDate, toDate } = defaultLabRange(from, to);
  const withCredits = await creditNotesTableExists();

  if (!withCredits) {
    const fallback = await query(
      `SELECT c.full_name, c.mobile,
              COUNT(i.id) AS invoice_count,
              COALESCE(SUM(i.total), 0) AS invoiced,
              COALESCE(SUM(p.paid), 0) AS collected
       FROM customers c
       JOIN invoices i ON i.customer_id = c.id
       LEFT JOIN (SELECT invoice_id, SUM(amount) AS paid FROM payments GROUP BY invoice_id) p ON p.invoice_id = i.id
       WHERE ${labDateSql('i.created_at')} BETWEEN $1::date AND $2::date AND i.status NOT IN ('cancelled')
       GROUP BY c.id
       ORDER BY invoiced DESC`,
      [fromDate, toDate]
    );
    return { from: fromDate, to: toDate, customers: fallback.rows };
  }

  const result = await query(
    `SELECT c.full_name, c.mobile,
            COALESCE(inv.invoice_count, 0) AS invoice_count,
            COALESCE(inv.invoiced, 0) - COALESCE(cn.credited, 0) AS invoiced,
            COALESCE(inv.collected, 0) AS collected
     FROM customers c
     LEFT JOIN (
       SELECT i.customer_id,
              COUNT(i.id) AS invoice_count,
              COALESCE(SUM(i.total), 0) AS invoiced,
              COALESCE(SUM(p.paid), 0) AS collected
       FROM invoices i
       LEFT JOIN (SELECT invoice_id, SUM(amount) AS paid FROM payments GROUP BY invoice_id) p ON p.invoice_id = i.id
       WHERE ${labDateSql('i.created_at')} BETWEEN $1::date AND $2::date AND i.status NOT IN ('cancelled')
       GROUP BY i.customer_id
     ) inv ON inv.customer_id = c.id
     LEFT JOIN (
       SELECT customer_id, SUM(total) AS credited
       FROM credit_notes
       WHERE status = 'issued' AND ${labDateSql('created_at')} BETWEEN $1::date AND $2::date
       GROUP BY customer_id
     ) cn ON cn.customer_id = c.id
     WHERE COALESCE(inv.invoice_count, 0) > 0 OR COALESCE(cn.credited, 0) > 0
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
  sumCashPurchaseOutflowsHalalas,
  expectedCashHalalas,
  getDashboardSummary,
  getUnpaidInvoicesReport,
  getVatReport,
  getCancelledRefundedReport,
  getRevenueByService,
  getCustomerRevenueReport,
};
