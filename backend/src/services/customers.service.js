const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { paginate, buildPagination, normalizeMobileDigits } = require('../utils/helpers');
const { uuidv4 } = require('../utils/uuid');

const list = async ({ search, mobile, page, limit }) => {
  const { offset, page: p, limit: l } = paginate(page, limit);
  const params = [];
  let where = 'WHERE c.is_active = true';

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

  return { data: result.rows, pagination: buildPagination(total, p, l) };
};

const getById = async (id) => {
  const result = await query('SELECT * FROM customers WHERE id = $1', [id]);
  if (!result.rows[0]) throw new AppError('Customer not found', 404, 'NOT_FOUND');
  return result.rows[0];
};

const getProfile = async (id) => {
  const customer = await getById(id);

  const [animals, samples, payments] = await Promise.all([
    query('SELECT * FROM animals WHERE owner_id = $1 ORDER BY created_at DESC', [id]),
    query(`SELECT s.*, a.animal_code FROM samples s LEFT JOIN animals a ON s.animal_id = a.id
           WHERE s.customer_id = $1 ORDER BY s.created_at DESC LIMIT 50`, [id]),
    query(`SELECT p.*, i.invoice_number FROM payments p
           LEFT JOIN invoices i ON p.invoice_id = i.id
           WHERE p.customer_id = $1 ORDER BY p.created_at DESC LIMIT 50`, [id]),
  ]);

  return {
    ...customer,
    animals: animals.rows,
    samples: samples.rows,
    payments: payments.rows,
    financial_statement: {
      balance: customer.account_balance,
      credit_limit: customer.credit_limit,
      total_payments: payments.rows.reduce((sum, p) => sum + parseFloat(p.amount), 0),
    },
  };
};

const create = async (data, userId) => {
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
  return result.rows[0];
};

const remove = async (id) => {
  await getById(id);
  await query('UPDATE customers SET is_active = false WHERE id = $1', [id]);
  return { message: 'Customer deactivated' };
};

module.exports = { list, getById, getProfile, create, update, remove };
