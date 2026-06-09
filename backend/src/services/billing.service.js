const { query, getClient } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { generateCode, paginate, buildPagination } = require('../utils/helpers');
const env = require('../config/env');

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

    const invoiceResult = await client.query(
      `INSERT INTO invoices (invoice_number, customer_id, sample_id, subtotal, discount_amount, tax_rate, tax_amount, total, status, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'issued',$9,$10) RETURNING *`,
      [invoiceNumber, data.customer_id, data.sample_id, subtotal, discount, taxRate, taxAmount, total, data.notes, userId]
    );

    const invoice = invoiceResult.rows[0];

    for (const item of data.items) {
      await client.query(
        `INSERT INTO invoice_items (invoice_id, test_id, package_id, description, quantity, unit_price, total_price)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [invoice.id, item.test_id, item.package_id, item.description, item.quantity, item.unit_price, item.unit_price * item.quantity]
      );
    }

    const vatQR = generateVatQR(invoice);
    await client.query('UPDATE invoices SET vat_qr_data = $1 WHERE id = $2', [vatQR, invoice.id]);

    await client.query('COMMIT');
    return { ...invoice, vat_qr_data: vatQR };
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
      `INSERT INTO payments (invoice_id, customer_id, amount, method, reference_number, notes, received_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [data.invoice_id, invoice.customer_id, data.amount, data.method, data.reference_number, data.notes, userId]
    );

    const paidResult = await client.query(
      `SELECT COALESCE(SUM(amount), 0) as total_paid FROM payments WHERE invoice_id = $1`,
      [data.invoice_id]
    );
    const totalPaid = parseFloat(paidResult.rows[0].total_paid);

    let status = 'partial';
    if (totalPaid >= parseFloat(invoice.total)) status = 'paid';
    await client.query('UPDATE invoices SET status = $1 WHERE id = $2', [status, data.invoice_id]);

    if (data.method === 'credit') {
      await client.query(
        'UPDATE customers SET account_balance = account_balance + $1 WHERE id = $2',
        [data.amount, invoice.customer_id]
      );
    }

    await client.query('COMMIT');
    return paymentResult.rows[0];
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
    `INSERT INTO refunds (payment_id, invoice_id, amount, reason, processed_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [data.payment_id, data.invoice_id, data.amount, data.reason, userId]
  );
  await query('UPDATE invoices SET status = $1 WHERE id = $2', ['refunded', data.invoice_id]);
  return result.rows[0];
};

module.exports = { listInvoices, createInvoice, recordPayment, listPackages, processRefund, generateVatQR };
