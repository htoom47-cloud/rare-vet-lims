const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { uuidv4 } = require('../utils/uuid');
const { logBillingAudit } = require('../utils/billing-audit');
const { getDailyFullSummary } = require('./accounting.service');
const { generateClosingPDF } = require('../utils/closing-pdf');
const env = require('../config/env');
const path = require('path');

const isDayClosed = async (date) => {
  const day = date || new Date().toISOString().slice(0, 10);
  const result = await query(
    `SELECT id, status FROM daily_closings WHERE closing_date = $1::date AND status = 'closed'`,
    [day]
  );
  return !!result.rows[0];
};

const assertDayOpen = async (date) => {
  if (await isDayClosed(date)) {
    throw new AppError('This day is closed. Contact a manager to reopen.', 403, 'DAY_CLOSED');
  }
};

const getClosing = async (date) => {
  const day = date || new Date().toISOString().slice(0, 10);
  const result = await query(
    `SELECT dc.*, u.full_name AS closed_by_name, ru.full_name AS reopened_by_name
     FROM daily_closings dc
     LEFT JOIN users u ON dc.closed_by = u.id
     LEFT JOIN users ru ON dc.reopened_by = ru.id
     WHERE dc.closing_date = $1::date
     ORDER BY dc.created_at DESC LIMIT 1`,
    [day]
  );
  const summary = await getDailyFullSummary(day);
  return { closing: result.rows[0] || null, summary, is_closed: await isDayClosed(day) };
};

const listClosings = async (limit = 30) => {
  const result = await query(
    `SELECT dc.*, u.full_name AS closed_by_name
     FROM daily_closings dc
     LEFT JOIN users u ON dc.closed_by = u.id
     ORDER BY dc.closing_date DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
};

const closeDay = async (date, userId, req) => {
  const day = date || new Date().toISOString().slice(0, 10);
  if (await isDayClosed(day)) {
    throw new AppError('Day already closed', 409, 'ALREADY_CLOSED');
  }

  const summary = await getDailyFullSummary(day);
  const closingNumber = `CLOSING-${day.replace(/-/g, '')}-${String(
    (await query('SELECT COUNT(*) FROM daily_closings WHERE closing_date = $1::date', [day])).rows[0].count * 1 + 1
  ).padStart(3, '0')}`;
  const id = uuidv4();

  const pdfDir = path.join(env.storage.path, 'closings');
  const { url: pdfUrl } = await generateClosingPDF(summary, closingNumber, pdfDir);

  const result = await query(
    `INSERT INTO daily_closings (id, closing_number, closing_date, totals, status, closed_by, closed_at, pdf_url)
     VALUES ($1, $2, $3::date, $4, 'closed', $5, NOW(), $6) RETURNING *`,
    [id, closingNumber, day, JSON.stringify(summary), userId, pdfUrl]
  );

  await logBillingAudit({
    userId,
    action: 'close_day',
    entityType: 'daily_closing',
    entityId: id,
    newValues: { closing_number: closingNumber, date: day, totals: summary },
    req,
  });

  return result.rows[0];
};

const reopenDay = async (date, userId, req) => {
  const day = date || new Date().toISOString().slice(0, 10);
  const existing = await query(
    `SELECT * FROM daily_closings WHERE closing_date = $1::date AND status = 'closed' ORDER BY created_at DESC LIMIT 1`,
    [day]
  );
  if (!existing.rows[0]) throw new AppError('No closed day found for this date', 404, 'NOT_FOUND');

  const result = await query(
    `UPDATE daily_closings SET status = 'reopened', reopened_by = $1, reopened_at = NOW()
     WHERE id = $2 RETURNING *`,
    [userId, existing.rows[0].id]
  );

  await logBillingAudit({
    userId,
    action: 'reopen_day',
    entityType: 'daily_closing',
    entityId: existing.rows[0].id,
    oldValues: { status: 'closed', closing_number: existing.rows[0].closing_number },
    newValues: { status: 'reopened', date: day },
    req,
  });

  return result.rows[0];
};

const serveClosingPdf = async (id, res) => {
  const result = await query('SELECT pdf_url, closing_number FROM daily_closings WHERE id = $1', [id]);
  if (!result.rows[0]?.pdf_url) throw new AppError('Closing PDF not found', 404, 'NOT_FOUND');
  const filename = result.rows[0].pdf_url.split('/').pop();
  const filePath = path.join(env.storage.path, 'closings', filename);
  const fs = require('fs');
  if (!fs.existsSync(filePath)) throw new AppError('Closing PDF file missing', 404, 'NOT_FOUND');
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
  isDayClosed,
  assertDayOpen,
  getClosing,
  listClosings,
  closeDay,
  reopenDay,
  serveClosingPdf,
};
