const { query, getClient } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { generateCode, paginate, buildPagination } = require('../utils/helpers');
const env = require('../config/env');
const { uuidv4 } = require('../utils/uuid');
const path = require('path');
const fs = require('fs');
const { generateInvoicePDF } = require('../utils/invoice-pdf');
const invoiceSettingsService = require('./invoice-settings.service');
const { syncCustomerArBalance } = require('./accounting.service');
const ledger = require('./ledger.service');
const { assertDayOpen } = require('./daily-closing.service');
const { logBillingAudit } = require('../utils/billing-audit');
const { resolveDiscount } = require('../utils/discount');

const generateVatQR = (invoice) => {
  const tlv = [
    Buffer.from([1, env.lab.name.length, ...Buffer.from(env.lab.name)]),
    Buffer.from([2, env.lab.vatNumber.length, ...Buffer.from(env.lab.vatNumber)]),
    Buffer.from([3, new Date(invoice.created_at).toISOString().length, ...Buffer.from(new Date(invoice.created_at).toISOString())]),
    Buffer.from([4, String(invoice.total).length, ...Buffer.from(String(invoice.total))]),
    Buffer.from([5, String(invoice.tax_amount).length, ...Buffer.from(String(invoice.tax_amount))]),
  ];
  return Buffer.concat(tlv).toString('base64');
};

const invoiceDate = (invoice) => new Date(invoice.created_at).toISOString().slice(0, 10);

const listInvoices = async ({
  status, customer_id, page, limit, search, date_from, date_to, payment_method,
}) => {
  const { offset, page: p, limit: l } = paginate(page, limit);
  const params = [];
  let where = 'WHERE 1=1';

  if (status) { params.push(status); where += ` AND i.status = $${params.length}`; }
  if (customer_id) { params.push(customer_id); where += ` AND i.customer_id = $${params.length}`; }
  if (search) {
    params.push(`%${search}%`);
    where += ` AND (i.invoice_number ILIKE $${params.length} OR c.full_name ILIKE $${params.length} OR c.full_name_ar ILIKE $${params.length})`;
  }
  if (date_from) { params.push(date_from); where += ` AND i.created_at::date >= $${params.length}::date`; }
  if (date_to) { params.push(date_to); where += ` AND i.created_at::date <= $${params.length}::date`; }
  if (payment_method) {
    params.push(payment_method);
    where += ` AND EXISTS (SELECT 1 FROM payments px WHERE px.invoice_id = i.id AND px.method = $${params.length})`;
  }

  const countResult = await query(
    `SELECT COUNT(*) FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id ${where}`,
    params
  );
  const total = parseInt(countResult.rows[0].count, 10);

  params.push(l, offset);
  const result = await query(
    `SELECT i.*, c.full_name AS customer_name, c.full_name_ar AS customer_name_ar,
            COALESCE(pay.paid, 0) AS total_paid,
            GREATEST(i.total - COALESCE(pay.paid, 0), 0) AS balance_due,
            pay.methods AS payment_methods
     FROM invoices i
     LEFT JOIN customers c ON i.customer_id = c.id
     LEFT JOIN (
       SELECT invoice_id, SUM(amount) AS paid,
              string_agg(DISTINCT method::text, ',') AS methods
       FROM payments GROUP BY invoice_id
     ) pay ON pay.invoice_id = i.id
     ${where}
     ORDER BY i.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { data: result.rows, pagination: buildPagination(total, p, l) };
};

const getInvoiceById = async (id) => {
  const invoiceResult = await query(
    `SELECT i.*, c.full_name as customer_name, c.full_name_ar as customer_name_ar, c.mobile as customer_mobile
     FROM invoices i
     LEFT JOIN customers c ON i.customer_id = c.id
     WHERE i.id = $1`,
    [id]
  );
  if (!invoiceResult.rows[0]) throw new AppError('Invoice not found', 404, 'NOT_FOUND');

  const itemsResult = await query(
    `SELECT ii.*, a.name_tag, a.animal_code, a.animal_type, t.name as test_name
     FROM invoice_items ii
     LEFT JOIN animals a ON ii.animal_id = a.id
     LEFT JOIN tests t ON ii.test_id = t.id
     WHERE ii.invoice_id = $1
     ORDER BY a.name_tag NULLS LAST, ii.description`,
    [id]
  );

  const paymentsResult = await query(
    `SELECT p.*, u.full_name as received_by_name
     FROM payments p
     LEFT JOIN users u ON p.received_by = u.id
     WHERE p.invoice_id = $1 ORDER BY p.created_at DESC`,
    [id]
  );

  const totalPaid = paymentsResult.rows.reduce((s, p) => s + parseFloat(p.amount), 0);
  const total = parseFloat(invoiceResult.rows[0].total);
  const balanceDue = Math.max(0, total - totalPaid);

  return {
    ...invoiceResult.rows[0],
    items: itemsResult.rows,
    payments: paymentsResult.rows,
    total_paid: totalPaid,
    balance_due: balanceDue,
  };
};

const createInvoice = async (data, userId) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const invoiceNumber = generateCode('INV');
    const subtotal = data.items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
    const discount = resolveDiscount(subtotal, data);
    const discountPercent = parseFloat(data.discount_percent) || 0;
    const taxable = subtotal - discount;
    const taxRate = 15;
    const taxAmount = taxable * (taxRate / 100);
    const total = taxable + taxAmount;

    const invoiceId = uuidv4();
    const invoiceResult = await client.query(
      `INSERT INTO invoices (id, invoice_number, customer_id, sample_id, subtotal, discount_amount, discount_percent, tax_rate, tax_amount, total, status, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'issued',$11,$12) RETURNING *`,
      [invoiceId, invoiceNumber, data.customer_id, data.sample_id, subtotal, discount, discountPercent, taxRate, taxAmount, total, data.notes, userId]
    );

    const invoice = invoiceResult.rows[0];

    for (const item of data.items) {
      await client.query(
        `INSERT INTO invoice_items (id, invoice_id, test_id, package_id, animal_id, description, quantity, unit_price, total_price)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [uuidv4(), invoice.id, item.test_id, item.package_id, item.animal_id || null, item.description, item.quantity, item.unit_price, item.unit_price * item.quantity]
      );
    }

    const vatQR = generateVatQR(invoice);
    await client.query('UPDATE invoices SET vat_qr_data = $1 WHERE id = $2', [vatQR, invoice.id]);

    await client.query('COMMIT');
    const issued = { ...invoice, vat_qr_data: vatQR };
    await syncCustomerArBalance(data.customer_id);
    try { await ledger.postInvoice(issued, userId); } catch (_) { /* ledger optional */ }
    await logBillingAudit({
      userId,
      action: 'create_invoice',
      entityType: 'invoice',
      entityId: invoice.id,
      newValues: { invoice_number: invoiceNumber, total, customer_id: data.customer_id },
    });
    return issued;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const recordPayment = async (data, userId, req = null) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const invoiceResult = await client.query('SELECT * FROM invoices WHERE id = $1', [data.invoice_id]);
    const invoice = invoiceResult.rows[0];
    if (!invoice) throw new AppError('Invoice not found', 404, 'NOT_FOUND');
    if (['cancelled', 'refunded'].includes(invoice.status)) {
      throw new AppError('Cannot pay cancelled or refunded invoice', 400, 'INVALID_STATUS');
    }

    await assertDayOpen(invoiceDate(invoice));

    const paidResult = await client.query(
      `SELECT COALESCE(SUM(amount), 0) as total_paid FROM payments WHERE invoice_id = $1`,
      [data.invoice_id]
    );
    const alreadyPaid = parseFloat(paidResult.rows[0].total_paid);
    const balance = Math.max(0, parseFloat(invoice.total) - alreadyPaid);
    const amount = parseFloat(data.amount);
    if (amount <= 0) throw new AppError('Invalid payment amount', 400, 'INVALID_AMOUNT');
    if (amount > balance + 0.01) throw new AppError('Payment exceeds balance due', 400, 'OVERPAYMENT');

    const paymentResult = await client.query(
      `INSERT INTO payments (id, invoice_id, customer_id, amount, method, reference_number, notes, received_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [uuidv4(), data.invoice_id, invoice.customer_id, amount, data.method, data.reference_number, data.notes, userId]
    );

    const totalPaid = alreadyPaid + amount;
    let status = 'partial';
    if (totalPaid >= parseFloat(invoice.total)) status = 'paid';
    await client.query('UPDATE invoices SET status = $1, pdf_url = NULL WHERE id = $2', [status, data.invoice_id]);

    await client.query('COMMIT');
    const payment = paymentResult.rows[0];
    await syncCustomerArBalance(invoice.customer_id);
    if (data.method !== 'credit') {
      try { await ledger.postPayment(payment, invoice, userId); } catch (_) { /* ledger optional */ }
    }
    await logBillingAudit({
      userId,
      action: 'record_payment',
      entityType: 'payment',
      entityId: payment.id,
      newValues: {
        invoice_number: invoice.invoice_number,
        amount,
        method: data.method,
        status,
      },
      req,
    });
    return payment;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const listPackages = async () => {
  const result = await query(
    `SELECT p.*, array_agg(t.name) as test_names FROM packages p
     LEFT JOIN package_tests pt ON p.id = pt.package_id
     LEFT JOIN tests t ON pt.test_id = t.id
     WHERE p.is_active = true GROUP BY p.id`
  );
  return result.rows;
};

const cancelInvoice = async (id, reason, userId, req) => {
  const invoice = await getInvoiceById(id);
  if (invoice.status === 'cancelled') throw new AppError('Invoice already cancelled', 400, 'ALREADY_CANCELLED');
  if (invoice.status === 'refunded') throw new AppError('Cannot cancel refunded invoice', 400, 'INVALID_STATUS');
  await assertDayOpen(invoiceDate(invoice));

  const oldStatus = invoice.status;
  await query(
    `UPDATE invoices SET status = 'cancelled', pdf_url = NULL, notes = COALESCE(notes, '') || $2, updated_at = NOW() WHERE id = $1`,
    [id, reason ? `\n[CANCEL] ${reason}` : '']
  );
  await syncCustomerArBalance(invoice.customer_id);
  await logBillingAudit({
    userId,
    action: 'cancel_invoice',
    entityType: 'invoice',
    entityId: id,
    oldValues: { status: oldStatus, total: invoice.total },
    newValues: { status: 'cancelled', reason },
    req,
  });
  return getInvoiceById(id);
};

const processRefund = async (data, userId, req) => {
  const invoice = await getInvoiceById(data.invoice_id);
  if (invoice.status === 'cancelled') throw new AppError('Cannot refund cancelled invoice', 400, 'INVALID_STATUS');
  await assertDayOpen(invoiceDate(invoice));

  const amount = parseFloat(data.amount);
  if (amount <= 0 || amount > invoice.total_paid + 0.01) {
    throw new AppError('Invalid refund amount', 400, 'INVALID_AMOUNT');
  }

  const result = await query(
    `INSERT INTO refunds (id, payment_id, invoice_id, amount, reason, processed_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [uuidv4(), data.payment_id || null, data.invoice_id, amount, data.reason, userId]
  );

  const refunded = await query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM refunds WHERE invoice_id = $1`,
    [data.invoice_id]
  );
  const refundedTotal = parseFloat(refunded.rows[0].total);
  let status = invoice.status;
  if (refundedTotal >= parseFloat(invoice.total_paid) - 0.01 && invoice.total_paid > 0) {
    status = 'refunded';
  } else if (refundedTotal > 0) {
    status = 'partial_refunded';
  }
  await query('UPDATE invoices SET status = $1, pdf_url = NULL WHERE id = $2', [status, data.invoice_id]);
  await syncCustomerArBalance(invoice.customer_id);

  await logBillingAudit({
    userId,
    action: 'refund',
    entityType: 'invoice',
    entityId: data.invoice_id,
    oldValues: { status: invoice.status, total_paid: invoice.total_paid },
    newValues: { refund_amount: amount, status, reason: data.reason },
    req,
  });

  return result.rows[0];
};

const exportInvoicesCsv = async (filters) => {
  const { data } = await listInvoices({ ...filters, page: 1, limit: 10000 });
  const header = ['Invoice No', 'Customer', 'Date', 'Subtotal', 'VAT', 'Total', 'Paid', 'Balance', 'Status', 'Methods'];
  const rows = data.map((r) => [
    r.invoice_number,
    r.customer_name,
    new Date(r.created_at).toISOString().slice(0, 10),
    parseFloat(r.subtotal).toFixed(2),
    parseFloat(r.tax_amount).toFixed(2),
    parseFloat(r.total).toFixed(2),
    parseFloat(r.total_paid || 0).toFixed(2),
    parseFloat(r.balance_due || 0).toFixed(2),
    r.status,
    r.payment_methods || '',
  ]);
  return [header, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
};

const invoicePdfDir = () => path.join(env.storage.path, 'invoices');

const ensureInvoicePdf = async (id) => {
  const invoice = await getInvoiceById(id);
  const existingName = invoice.pdf_url?.split('/').pop();
  if (existingName) {
    const filePath = path.join(invoicePdfDir(), existingName);
    if (fs.existsSync(filePath)) {
      return { invoice, filename: existingName, url: invoice.pdf_url };
    }
  }

  const filename = `invoice-${invoice.invoice_number}-${uuidv4().slice(0, 8)}.pdf`;
  const settings = await invoiceSettingsService.getInvoiceSettings();
  const pdf = await generateInvoicePDF(invoice, invoicePdfDir(), { filename, settings });
  await query('UPDATE invoices SET pdf_url = $1, updated_at = NOW() WHERE id = $2', [pdf.url, id]);
  return { invoice: { ...invoice, pdf_url: pdf.url }, filename: pdf.filename, url: pdf.url };
};

const serveInvoicePdf = async (id, res, { regenerate = false } = {}) => {
  if (regenerate) {
    await query('UPDATE invoices SET pdf_url = NULL WHERE id = $1', [id]);
  }
  const { filename } = await ensureInvoicePdf(id);
  const filePath = path.join(invoicePdfDir(), filename);
  if (!fs.existsSync(filePath)) throw new AppError('Invoice PDF not found', 404, 'NOT_FOUND');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('end', resolve);
    stream.pipe(res);
  });
};

module.exports = {
  listInvoices,
  getInvoiceById,
  createInvoice,
  recordPayment,
  cancelInvoice,
  listPackages,
  processRefund,
  exportInvoicesCsv,
  generateVatQR,
  ensureInvoicePdf,
  serveInvoicePdf,
};
