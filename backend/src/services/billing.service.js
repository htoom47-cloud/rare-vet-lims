const { query, getClient } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { generateCode, paginate, buildPagination } = require('../utils/helpers');
const env = require('../config/env');
const { uuidv4 } = require('../utils/uuid');
const path = require('path');
const fs = require('fs');
const { generateInvoicePDF } = require('../utils/invoice-pdf');
const { generateThermalInvoicePDF } = require('../utils/invoice-thermal-pdf');
const invoiceSettingsService = require('./invoice-settings.service');
const { syncCustomerArBalance } = require('./accounting.service');
const ledger = require('./ledger.service');
const { assertDayOpen } = require('./daily-closing.service');
const { logBillingAudit } = require('../utils/billing-audit');
const { calcDocumentTotals } = require('../utils/discount');
const { prepareCatalogItems } = require('../utils/vat');
const { notDeleted } = require('../utils/soft-delete-sql');
const { fromHalalas, toHalalas } = require('../utils/money');
const { labDay, labDateSql } = require('../utils/accounting-time');
const {
  evaluatePayment,
  invoiceStatusAfterSettlement,
  computeRefundableAmount,
  computePaymentRefundableHalalas,
  attachPaymentRefundTotals,
  computeSettlement,
} = require('../utils/invoice-settlement');

const withBillingClient = async (externalClient, work) => {
  const client = externalClient || await getClient();
  const ownTxn = !externalClient;
  let committed = false;
  try {
    if (ownTxn) await client.query('BEGIN');
    const result = await work(client);
    if (ownTxn) {
      await client.query('COMMIT');
      committed = true;
    }
    return result;
  } catch (err) {
    if (ownTxn && !committed) {
      try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    }
    throw err;
  } finally {
    if (ownTxn) client.release();
  }
};
const { creditNotesTableExists } = require('../utils/credit-notes-schema');
const creditNotes = require('./credit-note.service');

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

const invoiceDate = (invoice) => labDay(invoice.created_at);

const listInvoices = async ({
  status, customer_id, page, limit, search, date_from, date_to, payment_method,
}) => {
  const { offset, page: p, limit: l } = paginate(page, limit);
  const params = [];
  let where = `WHERE ${notDeleted('i')}`;

  if (status) { params.push(status); where += ` AND i.status = $${params.length}`; }
  if (customer_id) { params.push(customer_id); where += ` AND i.customer_id = $${params.length}`; }
  if (search) {
    params.push(`%${search}%`);
    where += ` AND (i.invoice_number ILIKE $${params.length} OR c.full_name ILIKE $${params.length} OR c.full_name_ar ILIKE $${params.length})`;
  }
  if (date_from) { params.push(date_from); where += ` AND ${labDateSql('i.created_at')} >= $${params.length}::date`; }
  if (date_to) { params.push(date_to); where += ` AND ${labDateSql('i.created_at')} <= $${params.length}::date`; }
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
  const withCredits = await creditNotesTableExists();
  const result = await query(
    `SELECT i.*, c.full_name AS customer_name, c.full_name_ar AS customer_name_ar,
            COALESCE(pay.paid, 0) AS total_paid,
            GREATEST(i.total - COALESCE(pay.paid, 0)${withCredits ? ' - COALESCE(cn.credited, 0)' : ''}, 0) AS balance_due,
            pay.methods AS payment_methods
     FROM invoices i
     LEFT JOIN customers c ON i.customer_id = c.id
     LEFT JOIN (
       SELECT invoice_id, SUM(amount) AS paid,
              string_agg(DISTINCT method::text, ',') AS methods
       FROM payments GROUP BY invoice_id
     ) pay ON pay.invoice_id = i.id
     ${withCredits ? `LEFT JOIN (
       SELECT invoice_id, SUM(total) AS credited
       FROM credit_notes WHERE status = 'issued'
       GROUP BY invoice_id
     ) cn ON cn.invoice_id = i.id` : ''}
     ${where}
     ORDER BY i.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { data: result.rows, pagination: buildPagination(total, p, l) };
};

const getInvoiceById = async (id, options = {}) => {
  const q = options.client ? options.client.query.bind(options.client) : query;
  const invoiceResult = await q(
    `SELECT i.*, c.full_name as customer_name, c.full_name_ar as customer_name_ar, c.mobile as customer_mobile
     FROM invoices i
     LEFT JOIN customers c ON i.customer_id = c.id
     WHERE i.id = $1 AND ${notDeleted('i')}`,
    [id]
  );
  if (!invoiceResult.rows[0]) throw new AppError('Invoice not found', 404, 'NOT_FOUND');

  const itemsResult = await q(
    `SELECT ii.*, a.name_tag, a.animal_code, a.animal_type, t.name as test_name
     FROM invoice_items ii
     LEFT JOIN animals a ON ii.animal_id = a.id
     LEFT JOIN tests t ON ii.test_id = t.id
     WHERE ii.invoice_id = $1
     ORDER BY a.name_tag NULLS LAST, ii.description`,
    [id]
  );

  const paymentsResult = await q(
    `SELECT p.*, u.full_name as received_by_name,
            COALESCE(r.refunded, 0) AS refunded_amount,
            GREATEST(
              ROUND(p.amount * 100) - ROUND(COALESCE(r.refunded, 0) * 100),
              0
            ) / 100.0 AS refundable_amount
     FROM payments p
     LEFT JOIN users u ON p.received_by = u.id
     LEFT JOIN (
       SELECT payment_id, SUM(amount) AS refunded
       FROM refunds
       WHERE invoice_id = $1 AND payment_id IS NOT NULL
       GROUP BY payment_id
     ) r ON r.payment_id = p.id
     WHERE p.invoice_id = $1
     ORDER BY p.created_at DESC`,
    [id]
  );

  const payments = attachPaymentRefundTotals(paymentsResult.rows);
  const totalPaid = payments.reduce((s, p) => s + parseFloat(p.amount), 0);
  const total = parseFloat(invoiceResult.rows[0].total);
  const notes = await creditNotes.listCreditNotesForInvoice(options.client || null, id);
  const creditNotesTotal = notes
    .filter((n) => n.status === 'issued')
    .reduce((s, n) => s + parseFloat(n.total), 0);
  const refundedResult = await q(
    `SELECT COALESCE(SUM(amount), 0) AS n FROM refunds WHERE invoice_id = $1`,
    [id]
  );
  const alreadyRefunded = refundedResult.rows[0].n;
  const settlement = computeSettlement({
    storedTotal: total,
    alreadyPaid: totalPaid,
    creditNotesTotal,
    alreadyRefunded,
  });

  return {
    ...invoiceResult.rows[0],
    items: itemsResult.rows,
    payments,
    credit_notes: notes,
    credit_notes_total: settlement.credit_notes_total,
    total_paid: totalPaid,
    already_refunded: settlement.already_refunded,
    balance_due: settlement.balance_due,
    refund_due: settlement.refund_due,
    credit_available: settlement.credit_available,
    net_total: settlement.net_total,
    settlement,
  };
};

const createInvoice = async (data, userId, options = {}) => {
  return withBillingClient(options.client, async (client) => {
    const invoiceNumber = generateCode('INV');
    const catalogItems = prepareCatalogItems(data.items);
    const totals = calcDocumentTotals(catalogItems, data);

    const invoiceId = uuidv4();
    const invoiceResult = await client.query(
      `INSERT INTO invoices (id, invoice_number, customer_id, sample_id, subtotal, discount_amount, discount_percent, field_visit_discount_amount, field_visit_discount_percent, tax_rate, tax_amount, total, status, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'issued',$13,$14) RETURNING *`,
      [
        invoiceId, invoiceNumber, data.customer_id, data.sample_id,
        totals.subtotal, totals.discount_amount, totals.discount_percent,
        totals.field_visit_discount_amount, totals.field_visit_discount_percent,
        totals.taxRate, totals.taxAmount, totals.total, data.notes, userId,
      ]
    );

    const invoice = invoiceResult.rows[0];

    for (const item of catalogItems) {
      await client.query(
        `INSERT INTO invoice_items (id, invoice_id, test_id, package_id, animal_id, description, quantity, unit_price, total_price)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [uuidv4(), invoice.id, item.test_id, item.package_id, item.animal_id || null, item.description, item.quantity, item.unit_price, item.total_price]
      );
    }

    const vatQR = generateVatQR(invoice);
    await client.query('UPDATE invoices SET vat_qr_data = $1 WHERE id = $2', [vatQR, invoice.id]);

    const issued = { ...invoice, vat_qr_data: vatQR };
    await ledger.postInvoice(issued, userId, client);
    await syncCustomerArBalance(data.customer_id, client);
    await logBillingAudit({
      userId,
      action: 'create_invoice',
      entityType: 'invoice',
      entityId: invoice.id,
      newValues: { invoice_number: invoiceNumber, total: totals.total, customer_id: data.customer_id },
      client,
      required: true,
    });
    return issued;
  });
};

const recordPayment = async (data, userId, req = null, options = {}) => {
  return withBillingClient(options.client, async (client) => {
    const invoiceResult = await client.query(
      `SELECT * FROM invoices WHERE id = $1 AND ${notDeleted()} FOR UPDATE`,
      [data.invoice_id]
    );
    const invoice = invoiceResult.rows[0];
    if (!invoice) throw new AppError('Invoice not found', 404, 'NOT_FOUND');
    if (['cancelled', 'refunded'].includes(invoice.status)) {
      throw new AppError('Cannot pay cancelled or refunded invoice', 400, 'INVALID_STATUS');
    }

    await assertDayOpen(labDay(), client);

    const paidResult = await client.query(
      `SELECT COALESCE(SUM(amount), 0) as total_paid FROM payments WHERE invoice_id = $1`,
      [data.invoice_id]
    );
    const alreadyPaid = paidResult.rows[0].total_paid;
    const creditNotesTotal = await creditNotes.sumIssuedCreditNotes(client, data.invoice_id);
    const storedTotal = invoice.total;

    const decision = evaluatePayment({
      storedTotal,
      alreadyPaid,
      creditNotesTotal,
      amount: data.amount,
      paymentData: data,
    });
    if (!decision.ok) {
      throw new AppError(decision.message, 400, decision.code);
    }

    const amount = fromHalalas(decision.amountHalalas);
    const paymentResult = await client.query(
      `INSERT INTO payments (id, invoice_id, customer_id, amount, method, reference_number, notes, received_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [uuidv4(), data.invoice_id, invoice.customer_id, amount, data.method, data.reference_number, data.notes, userId]
    );

    const payment = paymentResult.rows[0];
    const status = invoiceStatusAfterSettlement(
      storedTotal,
      decision.newPaidHalalas,
      creditNotesTotal
    );
    await client.query('UPDATE invoices SET status = $1, pdf_url = NULL WHERE id = $2', [status, data.invoice_id]);

    if (data.method !== 'credit') {
      await ledger.postPayment(payment, invoice, userId, client);
    }

    await syncCustomerArBalance(invoice.customer_id, client);
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
        total: storedTotal,
      },
      req,
      client,
      required: true,
    });
    return payment;
  });
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
  const client = await getClient();
  let committed = false;
  let customerId = null;
  let oldStatus = null;
  let invoiceTotal = null;
  try {
    await client.query('BEGIN');
    const invoiceResult = await client.query(
      `SELECT * FROM invoices WHERE id = $1 AND ${notDeleted()} FOR UPDATE`,
      [id]
    );
    const invoice = invoiceResult.rows[0];
    if (!invoice) throw new AppError('Invoice not found', 404, 'NOT_FOUND');
    if (invoice.status === 'cancelled') throw new AppError('Invoice already cancelled', 400, 'ALREADY_CANCELLED');
    if (invoice.status === 'refunded') throw new AppError('Cannot cancel refunded invoice', 400, 'INVALID_STATUS');
    await assertDayOpen(invoiceDate(invoice));

    oldStatus = invoice.status;
    customerId = invoice.customer_id;
    invoiceTotal = invoice.total;
    await client.query(
      `UPDATE invoices SET status = 'cancelled', pdf_url = NULL, notes = COALESCE(notes, '') || $2, updated_at = NOW() WHERE id = $1`,
      [id, reason ? `\n[CANCEL] ${reason}` : '']
    );
    await syncCustomerArBalance(customerId, client);
    await logBillingAudit({
      userId,
      action: 'cancel_invoice',
      entityType: 'invoice',
      entityId: id,
      oldValues: { status: oldStatus, total: invoiceTotal },
      newValues: { status: 'cancelled', reason },
      req,
      client,
      required: true,
    });
    await client.query('COMMIT');
    committed = true;
  } catch (err) {
    if (!committed) {
      try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    }
    throw err;
  } finally {
    client.release();
  }

  return getInvoiceById(id);
};

const processRefund = async (data, userId, req, options = {}) => {
  return withBillingClient(options.client, async (client) => {
    if (!data.payment_id) {
      throw new AppError(
        'Each refund must target a specific payment. Multi-payment refunds are not enabled; submit one refund per payment.',
        400,
        'PAYMENT_REQUIRED'
      );
    }

    const invoiceResult = await client.query(
      `SELECT * FROM invoices WHERE id = $1 AND ${notDeleted()} FOR UPDATE`,
      [data.invoice_id]
    );
    const invoice = invoiceResult.rows[0];
    if (!invoice) throw new AppError('Invoice not found', 404, 'NOT_FOUND');
    if (invoice.status === 'cancelled') throw new AppError('Cannot refund cancelled invoice', 400, 'INVALID_STATUS');
    const refundDay = labDay();
    await assertDayOpen(refundDay, client);

    const paymentResult = await client.query(
      `SELECT * FROM payments WHERE id = $1 FOR UPDATE`,
      [data.payment_id]
    );
    const payment = paymentResult.rows[0];
    if (!payment) throw new AppError('Payment not found', 404, 'PAYMENT_NOT_FOUND');
    if (payment.invoice_id !== data.invoice_id) {
      throw new AppError('Payment does not belong to this invoice', 400, 'PAYMENT_INVOICE_MISMATCH');
    }
    if (payment.method === 'credit') {
      throw new AppError('Cannot refund a credit-term payment. Use a credit note.', 400, 'CANNOT_REFUND_CREDIT_PAYMENT');
    }
    if (!payment.method) {
      throw new AppError('Payment method is missing; cannot post a refund journal', 400, 'PAYMENT_METHOD_REQUIRED');
    }

    const paidResult = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_paid FROM payments WHERE invoice_id = $1`,
      [data.invoice_id]
    );
    const refundedResult = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM refunds WHERE invoice_id = $1`,
      [data.invoice_id]
    );
    const refundedOnPaymentResult = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM refunds WHERE payment_id = $1`,
      [data.payment_id]
    );
    const totalPaid = parseFloat(paidResult.rows[0].total_paid);
    const alreadyRefunded = parseFloat(refundedResult.rows[0].total);
    const refundedOnPayment = parseFloat(refundedOnPaymentResult.rows[0].total);
    const invoiceRefundableH = toHalalas(computeRefundableAmount(totalPaid, alreadyRefunded));
    const paymentRefundableH = computePaymentRefundableHalalas({
      paymentAmount: payment.amount,
      refundedAgainstPayment: refundedOnPayment,
    });
    const refundableH = Math.min(invoiceRefundableH, paymentRefundableH);

    const amount = parseFloat(data.amount);
    if (toHalalas(amount) <= 0 || toHalalas(amount) > refundableH) {
      throw new AppError('Invalid refund amount for this payment', 400, 'INVALID_AMOUNT');
    }

    const result = await client.query(
      `INSERT INTO refunds (id, payment_id, invoice_id, amount, reason, processed_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6, NOW()) RETURNING *`,
      [uuidv4(), data.payment_id, data.invoice_id, amount, data.reason, userId]
    );
    const refundRow = result.rows[0];

    const refundedTotal = alreadyRefunded + amount;
    const oldStatus = invoice.status;
    let status = invoice.status;
    if (toHalalas(refundedTotal) >= toHalalas(totalPaid) && toHalalas(totalPaid) > 0) {
      status = 'refunded';
    } else if (toHalalas(refundedTotal) > 0) {
      status = 'partial_refunded';
    }
    await client.query('UPDATE invoices SET status = $1, pdf_url = NULL WHERE id = $2', [status, data.invoice_id]);

    await ledger.postRefund(refundRow, invoice, userId, client, payment.method);
    await syncCustomerArBalance(invoice.customer_id, client);
    await logBillingAudit({
      userId,
      action: 'refund',
      entityType: 'invoice',
      entityId: data.invoice_id,
      oldValues: { status: oldStatus, total_paid: totalPaid },
      newValues: {
        refund_amount: amount,
        status,
        reason: data.reason,
        payment_id: payment.id,
        method: payment.method,
      },
      req,
      client,
      required: true,
    });
    return refundRow;
  });
};

const exportInvoicesCsv = async (filters) => {
  // Cap export size — previous hard-coded 10000 ignored paginate's max(100) but still risky if cap changes.
  const { data } = await listInvoices({ ...filters, page: 1, limit: 500 });
  const header = ['Invoice No', 'Customer', 'Date', 'Subtotal', 'VAT', 'Total', 'Paid', 'Balance', 'Status', 'Methods'];
  const rows = data.map((r) => [
    r.invoice_number,
    r.customer_name,
    labDay(r.created_at),
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
  const freshQr = generateVatQR(invoice);
  if (invoice.vat_qr_data !== freshQr) {
    await query('UPDATE invoices SET vat_qr_data = $1, pdf_url = NULL WHERE id = $2', [freshQr, id]);
    invoice.vat_qr_data = freshQr;
    invoice.pdf_url = null;
  }

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

const isThermalFormat = (format) => ['thermal', '80mm', 'receipt'].includes(String(format || '').toLowerCase());

const serveThermalInvoicePdf = async (id, res) => {
  const invoice = await getInvoiceById(id);
  const freshQr = generateVatQR(invoice);
  if (invoice.vat_qr_data !== freshQr) {
    await query('UPDATE invoices SET vat_qr_data = $1 WHERE id = $2', [freshQr, id]);
    invoice.vat_qr_data = freshQr;
  }

  const settings = await invoiceSettingsService.getInvoiceSettings();
  const filename = `invoice-${invoice.invoice_number}-80mm-${uuidv4().slice(0, 8)}.pdf`;
  const pdf = await generateThermalInvoicePDF(invoice, invoicePdfDir(), { filename, settings });
  const filePath = path.join(invoicePdfDir(), pdf.filename);
  if (!fs.existsSync(filePath)) throw new AppError('Invoice PDF not found', 404, 'NOT_FOUND');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${pdf.filename}"`);
  try {
    await new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath);
      stream.on('error', reject);
      stream.on('end', resolve);
      stream.pipe(res);
    });
  } finally {
    fs.rmSync(filePath, { force: true });
  }
};

const serveInvoicePdf = async (id, res, { regenerate = false, format } = {}) => {
  if (isThermalFormat(format)) {
    return serveThermalInvoicePdf(id, res);
  }

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
  computeRefundableAmount,
};
