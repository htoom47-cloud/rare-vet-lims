const { query, getClient } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { generateCode, paginate, buildPagination } = require('../utils/helpers');
const env = require('../config/env');
const { uuidv4 } = require('../utils/uuid');
const path = require('path');
const fs = require('fs');
const { generateQuotePDF } = require('../utils/quote-pdf');
const invoiceSettingsService = require('./invoice-settings.service');
const { resolveDiscount } = require('../utils/discount');

const quotePdfDir = () => path.join(env.storage.path, 'quotes');

const defaultValidUntil = () => {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
};

const listQuotes = async ({ page, limit, search, customer_id } = {}) => {
  const { page: p, limit: l, offset } = paginate(page, limit);
  const conditions = ['1=1'];
  const params = [];
  let idx = 1;

  if (customer_id) {
    conditions.push(`q.customer_id = $${idx++}`);
    params.push(customer_id);
  }
  if (search?.trim()) {
    conditions.push(`(q.quote_number ILIKE $${idx} OR q.customer_name ILIKE $${idx} OR q.customer_mobile ILIKE $${idx})`);
    params.push(`%${search.trim()}%`);
    idx += 1;
  }

  const where = conditions.join(' AND ');
  const countResult = await query(`SELECT COUNT(*)::int AS total FROM price_quotes q WHERE ${where}`, params);
  const total = countResult.rows[0].total;

  params.push(l, offset);
  const result = await query(
    `SELECT q.*, u.full_name AS created_by_name
     FROM price_quotes q
     LEFT JOIN users u ON q.created_by = u.id
     WHERE ${where}
     ORDER BY q.created_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    params
  );

  return { data: result.rows, pagination: buildPagination(total, p, l) };
};

const getQuoteById = async (id) => {
  const quoteResult = await query(
    `SELECT q.*, u.full_name AS created_by_name
     FROM price_quotes q
     LEFT JOIN users u ON q.created_by = u.id
     WHERE q.id = $1`,
    [id]
  );
  if (!quoteResult.rows[0]) throw new AppError('Quote not found', 404, 'NOT_FOUND');

  const itemsResult = await query(
    `SELECT qi.*, t.name AS test_name
     FROM price_quote_items qi
     LEFT JOIN tests t ON qi.test_id = t.id
     WHERE qi.quote_id = $1
     ORDER BY qi.description`,
    [id]
  );

  return { ...quoteResult.rows[0], items: itemsResult.rows };
};

const createQuote = async (data, userId) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    let customerName = data.customer_name?.trim();
    let customerNameAr = data.customer_name_ar?.trim() || null;
    let customerMobile = data.customer_mobile?.trim() || null;
    let customerId = data.customer_id || null;

    if (customerId) {
      const cust = await client.query('SELECT full_name, full_name_ar, mobile FROM customers WHERE id = $1', [customerId]);
      if (cust.rows[0]) {
        if (!customerName) customerName = cust.rows[0].full_name;
        if (!customerNameAr) customerNameAr = cust.rows[0].full_name_ar;
        if (!customerMobile) customerMobile = cust.rows[0].mobile;
      }
    }

    if (!customerName) throw new AppError('Customer name is required', 400, 'VALIDATION_ERROR');

    const subtotal = data.items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
    const discount = resolveDiscount(subtotal, data);
    const discountPercent = parseFloat(data.discount_percent) || 0;
    const taxable = Math.max(0, subtotal - discount);
    const taxRate = 15;
    const taxAmount = taxable * (taxRate / 100);
    const total = taxable + taxAmount;
    const validUntil = data.valid_until || defaultValidUntil();

    const quoteId = uuidv4();
    const quoteNumber = generateCode('QUO');

    const quoteResult = await client.query(
      `INSERT INTO price_quotes (
        id, quote_number, customer_id, customer_name, customer_name_ar, customer_mobile,
        subtotal, discount_amount, discount_percent, tax_rate, tax_amount, total, notes, valid_until, status, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'sent',$15) RETURNING *`,
      [
        quoteId, quoteNumber, customerId, customerName, customerNameAr, customerMobile,
        subtotal, discount, discountPercent, taxRate, taxAmount, total, data.notes || null, validUntil, userId,
      ]
    );

    for (const item of data.items) {
      await client.query(
        `INSERT INTO price_quote_items (id, quote_id, test_id, package_id, description, quantity, unit_price, total_price)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          uuidv4(), quoteId, item.test_id || null, item.package_id || null,
          item.description, item.quantity, item.unit_price, item.unit_price * item.quantity,
        ]
      );
    }

    await client.query('COMMIT');

    const quote = await getQuoteById(quoteId);
    const settings = await invoiceSettingsService.getInvoiceSettings();
    const filename = `quote-${quote.quote_number}-${uuidv4().slice(0, 8)}.pdf`;
    const pdf = await generateQuotePDF(quote, quotePdfDir(), { filename, settings });
    await query('UPDATE price_quotes SET pdf_url = $1, updated_at = NOW() WHERE id = $2', [pdf.url, quoteId]);

    return getQuoteById(quoteId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const ensureQuotePdf = async (id) => {
  const quote = await getQuoteById(id);
  const existingName = quote.pdf_url?.split('/').pop();
  if (existingName) {
    const filePath = path.join(quotePdfDir(), existingName);
    if (fs.existsSync(filePath)) {
      return { quote, filename: existingName, url: quote.pdf_url };
    }
  }

  const filename = `quote-${quote.quote_number}-${uuidv4().slice(0, 8)}.pdf`;
  const settings = await invoiceSettingsService.getInvoiceSettings();
  const pdf = await generateQuotePDF(quote, quotePdfDir(), { filename, settings });
  await query('UPDATE price_quotes SET pdf_url = $1, updated_at = NOW() WHERE id = $2', [pdf.url, id]);
  return { quote: { ...quote, pdf_url: pdf.url }, filename: pdf.filename, url: pdf.url };
};

const serveQuotePdf = async (id, res, { regenerate = false } = {}) => {
  if (regenerate) {
    await query('UPDATE price_quotes SET pdf_url = NULL WHERE id = $1', [id]);
  }
  const { filename, quote } = await ensureQuotePdf(id);
  const filePath = path.join(quotePdfDir(), filename);
  if (!fs.existsSync(filePath)) throw new AppError('Quote PDF not found', 404, 'NOT_FOUND');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('end', resolve);
    stream.pipe(res);
  });
  return quote;
};

module.exports = {
  listQuotes,
  getQuoteById,
  createQuote,
  ensureQuotePdf,
  serveQuotePdf,
};
