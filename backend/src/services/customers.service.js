const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { paginate, buildPagination, normalizeMobileDigits } = require('../utils/helpers');
const reportNotify = require('./customer-report-notifications.service');
const { BATCH_TYPE, HANDLED_BATCH_STATUS_SQL } = require('./customer-report-notifications.utils');
const portalSync = require('./portal-sync.service');
const { notDeleted } = require('../utils/soft-delete-sql');
const { uuidv4 } = require('../utils/uuid');
const { getCustomerStatement } = require('./accounting.service');

const visibilitySql = portalSync.portalVisibilitySql('r').replace(/\s+/g, ' ').trim();

const isReadyToSendFilter = (value) => value === true || value === 'true' || value === '1';

const list = async ({ search, mobile, page, limit, readyToSend }) => {
  const { offset, page: p, limit: l } = paginate(page, limit);
  const params = [];
  let where = `WHERE c.is_active = true AND ${notDeleted('c')}`;

  if (mobile) {
    const digits = normalizeMobileDigits(mobile);
    params.push(`%${digits}%`);
    where += ` AND regexp_replace(c.mobile, '[^0-9]', '', 'g') LIKE $${params.length}`;
  } else if (search) {
    const digits = normalizeMobileDigits(search);
    params.push(`%${search}%`);
    if (digits.length >= 3) {
      params.push(`%${digits}%`);
      where += ` AND (c.full_name ILIKE $${params.length - 1} OR c.mobile ILIKE $${params.length - 1} OR c.farm_company ILIKE $${params.length - 1} OR regexp_replace(c.mobile, '[^0-9]', '', 'g') LIKE $${params.length})`;
    } else {
      where += ` AND (c.full_name ILIKE $${params.length} OR c.mobile ILIKE $${params.length} OR c.farm_company ILIKE $${params.length})`;
    }
  }

  // Same readiness rule as countCustomersWaitingToSend / listCustomersReadyToSend
  if (isReadyToSendFilter(readyToSend)) {
    params.push(BATCH_TYPE);
    where += ` AND EXISTS (
      SELECT 1
      FROM reports r
      JOIN samples s ON r.sample_id = s.id
      JOIN customers c2 ON s.customer_id = c2.id
      WHERE ${visibilitySql}
        AND (
          c2.id = c.id
          OR RIGHT(regexp_replace(c2.mobile, '[^0-9]', '', 'g'), 9)
            = RIGHT(regexp_replace(c.mobile, '[^0-9]', '', 'g'), 9)
        )
        AND NOT EXISTS (
          SELECT 1 FROM notification_queue nq
          WHERE nq.status IN (${HANDLED_BATCH_STATUS_SQL})
            AND nq.metadata->>'type' = $${params.length}
            AND nq.metadata->'report_ids' ? r.id::text
        )
    )`;
  }

  const countResult = await query(`SELECT COUNT(*) FROM customers c ${where}`, params);
  const total = parseInt(countResult.rows[0].count, 10);

  params.push(l, offset);
  const result = await query(
    `SELECT c.*, (SELECT COUNT(*) FROM animals a WHERE a.owner_id = c.id) as animal_count,
            (SELECT COUNT(*) FROM samples s WHERE s.customer_id = c.id) as sample_count
     FROM customers c ${where}
     ORDER BY c.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const data = await reportNotify.enrichCustomersDispatchStatus(result.rows);
  return { data, pagination: buildPagination(total, p, l) };
};

const getById = async (id) => {
  const result = await query(`SELECT * FROM customers WHERE id = $1 AND ${notDeleted()}`, [id]);
  if (!result.rows[0]) throw new AppError('Customer not found', 404, 'NOT_FOUND');
  return result.rows[0];
};

const getProfile = async (id) => {
  const customer = await getById(id);

  const [animals, samples, statement] = await Promise.all([
    query('SELECT * FROM animals WHERE owner_id = $1 ORDER BY created_at DESC', [id]),
    query(`SELECT s.*, a.animal_code FROM samples s LEFT JOIN animals a ON s.animal_id = a.id
           WHERE s.customer_id = $1 ORDER BY s.created_at DESC LIMIT 50`, [id]),
    getCustomerStatement(id),
  ]);

  return {
    ...customer,
    animals: animals.rows,
    samples: samples.rows,
    payments: statement.payments,
    invoices: statement.invoices,
    financial_statement: statement.summary,
  };
};

const checkDuplicateMobile = async (mobile) => {
  if (!mobile || !mobile.trim()) return null;
  const digits = normalizeMobileDigits(mobile);
  if (digits.length < 9) return null;

  const result = await query(
    `SELECT id, full_name, mobile
     FROM customers
     WHERE is_active = true
       AND ${notDeleted()}
       AND regexp_replace(mobile, '[^0-9]', '', 'g') LIKE $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [`%${digits.slice(-9)}`]
  );
  return result.rows[0] || null;
};

const create = async (data, userId, { role } = {}) => {
  const existing = await checkDuplicateMobile(data.mobile);
  if (existing) {
    const isOverride = role === 'admin' || role === 'manager';
    if (!isOverride) {
      throw new AppError(
        `Customer with this mobile already exists: ${existing.full_name}`,
        409,
        'DUPLICATE_MOBILE',
        { existingCustomerId: existing.id, existingName: existing.full_name }
      );
    }
  }

  const result = await query(
    `INSERT INTO customers (id, full_name, full_name_ar, mobile, city, farm_company, notes, credit_limit, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [uuidv4(), data.full_name, data.full_name_ar, data.mobile, data.city, data.farm_company, data.notes, data.credit_limit || 0, userId]
  );
  return result.rows[0];
};

const update = async (id, data) => {
  await getById(id);
  const result = await query(
    `UPDATE customers SET full_name=$1, full_name_ar=$2, mobile=$3, city=$4, farm_company=$5,
     notes=$6, credit_limit=$7, updated_at=NOW() WHERE id=$8 RETURNING *`,
    [data.full_name, data.full_name_ar, data.mobile, data.city, data.farm_company, data.notes, data.credit_limit, id]
  );
  const lifecycle = require('./report-lifecycle.service');
  await lifecycle.markReportsNeedsUpdateByCustomerId(id, 'CUSTOMER');
  return result.rows[0];
};

const remove = async (id) => {
  await getById(id);
  await query('UPDATE customers SET is_active = false WHERE id = $1', [id]);
  return { message: 'Customer deactivated' };
};

module.exports = { list, getById, getProfile, create, update, remove };
