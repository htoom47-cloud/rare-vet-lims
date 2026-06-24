const { query, getClient } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { generateCode, paginate, buildPagination } = require('../utils/helpers');
const env = require('../config/env');
const { uuidv4 } = require('../utils/uuid');
const path = require('path');
const fs = require('fs');
const { generateInvoicePDF } = require('../utils/invoice-pdf');
const { syncCustomerArBalance } = require('./accounting.service');
const ledger = require('./ledger.service');

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

const listInvoices = async ({ status, customer_id, page, limit }) => {
  const { offset, page: p, limit: l } = paginate(page, limit);
  const params = [];
  let where = 'WHERE 1=1';

  if (status) { params.push(status); where += ` AND i.status = $${params.length}`; }
  if (customer_id) { params.push(customer_id); where += ` AND i.customer_id = $${params.length}`; }

  const countResult = await query(`SELECT COUNT(*) FROM invoices i ${where}`, params);
  const total = parseInt(countResult.rows[0].count, 10);

  params.push(l, offset);
  const result = await query(
    `SELECT i.*, c.full_name as customer_name FROM invoices i
     LEFT JOIN customers c ON i.customer_id = c.id
     ${where} ORDER BY i.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
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
    const discount = data.discount_amount || 0;
    const taxable = subtotal - discount;
    const taxRate = 15;
    const taxAmount = taxable * (taxRate / 100);
    const total = taxable + taxAmount;

    const invoiceId = uuidv4();
    const invoiceResult = await client.query(
      `INSERT INTO invoices (id, invoice_number, customer_id, sample_id, subtotal, discount_amount, tax_rate, tax_amount, total, status, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'issued',$10,$11) RETURNING *`,
      [invoiceId, invoiceNumber, data.customer_id, data.sample_id, subtotal, discount, taxRate, taxAmount, total, data.notes, userId]
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
    return issued;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const recordPayment = async (data, userId) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const invoiceResult = await client.query('SELECT * FROM invoices WHERE id = $1', [data.invoice_id]);
    const invoice = invoiceResult.rows[0];
    if (!invoice) throw new AppError('Invoice not found', 404, 'NOT_FOUND');

    const paymentResult = await client.query(
      `INSERT INTO payments (id, invoice_id, customer_id, amount, method, reference_number, notes, received_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [uuidv4(), data.invoice_id, invoice.customer_id, data.amount, data.method, data.reference_number, data.notes, userId]
    );

    const paidResult = await client.query(
      `SELECT COALESCE(SUM(amount), 0) as total_paid FROM payments WHERE invoice_id = $1`,
      [data.invoice_id]
    );
    const totalPaid = parseFloat(paidResult.rows[0].total_paid);

    let status = 'partial';
    if (totalPaid >= parseFloat(invoice.total)) status = 'paid';
    await client.query('UPDATE invoices SET status = $1, pdf_url = NULL WHERE id = $2', [status, data.invoice_id]);

    await client.query('COMMIT');
    const payment = paymentResult.rows[0];
    await syncCustomerArBalance(invoice.customer_id);
    if (data.method !== 'credit') {
      try { await ledger.postPayment(payment, invoice, userId); } catch (_) { /* ledger optional */ }
    }
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

const processRefund = async (data, userId) => {
  const result = await query(
    `INSERT INTO refunds (id, payment_id, invoice_id, amount, reason, processed_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [uuidv4(), data.payment_id, data.invoice_id, data.amount, data.reason, userId]
  );
  await query('UPDATE invoices SET status = $1 WHERE id = $2', ['refunded', data.invoice_id]);
  return result.rows[0];
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
  const pdf = await generateInvoicePDF(invoice, invoicePdfDir(), { filename });
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
  listPackages,
  processRefund,
  generateVatQR,
  ensureInvoicePdf,
  serveInvoicePdf,
};
