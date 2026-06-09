const { query, getClient } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { paginate, buildPagination } = require('../utils/helpers');

const listCategories = async () => {
  const result = await query('SELECT * FROM test_categories WHERE is_active = true ORDER BY sort_order');
  return result.rows;
};

const list = async ({ category_id, search, page, limit }) => {
  const { offset, page: p, limit: l } = paginate(page, limit);
  const params = [];
  let where = 'WHERE t.is_active = true';

  if (category_id) {
    params.push(category_id);
    where += ` AND t.category_id = $${params.length}`;
  }
  if (search) {
    params.push(`%${search}%`);
    where += ` AND (t.name ILIKE $${params.length} OR t.code ILIKE $${params.length})`;
  }

  const countResult = await query(`SELECT COUNT(*) FROM tests t ${where}`, params);
  const total = parseInt(countResult.rows[0].count, 10);

  params.push(l, offset);
  const result = await query(
    `SELECT t.*, tc.name as category_name, tc.code as category_code
     FROM tests t LEFT JOIN test_categories tc ON t.category_id = tc.id
     ${where} ORDER BY tc.sort_order, t.name LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { data: result.rows, pagination: buildPagination(total, p, l) };
};

const getById = async (id) => {
  const result = await query(
    `SELECT t.*, tc.name as category_name FROM tests t
     LEFT JOIN test_categories tc ON t.category_id = tc.id WHERE t.id = $1`,
    [id]
  );
  if (!result.rows[0]) throw new AppError('Test not found', 404, 'NOT_FOUND');

  const [parameters, ranges] = await Promise.all([
    query('SELECT * FROM test_parameters WHERE test_id = $1 ORDER BY sort_order', [id]),
    query(
      `SELECT tr.*, tp.name as parameter_name, tp.code as parameter_code
       FROM test_reference_ranges tr JOIN test_parameters tp ON tr.parameter_id = tp.id
       WHERE tp.test_id = $1`,
      [id]
    ),
  ]);

  return { ...result.rows[0], parameters: parameters.rows, reference_ranges: ranges.rows };
};

const create = async (data) => {
  const result = await query(
    `INSERT INTO tests (code, name, name_ar, category_id, description, price, turnaround_hours, unit, method)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [data.code, data.name, data.name_ar, data.category_id, data.description, data.price, data.turnaround_hours, data.unit, data.method]
  );
  return result.rows[0];
};

const update = async (id, data) => {
  await getById(id);
  const result = await query(
    `UPDATE tests SET code=$1, name=$2, name_ar=$3, category_id=$4, description=$5, price=$6,
     turnaround_hours=$7, unit=$8, method=$9, updated_at=NOW() WHERE id=$10 RETURNING *`,
    [data.code, data.name, data.name_ar, data.category_id, data.description, data.price, data.turnaround_hours, data.unit, data.method, id]
  );
  return result.rows[0];
};

const addParameter = async (testId, param) => {
  await getById(testId);
  const result = await query(
    `INSERT INTO test_parameters (test_id, code, name, name_ar, unit, sort_order, is_calculated, formula, decimal_places)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [testId, param.code, param.name, param.name_ar, param.unit, param.sort_order || 0, param.is_calculated || false, param.formula, param.decimal_places || 2]
  );
  return result.rows[0];
};

const addReferenceRange = async (parameterId, range) => {
  const result = await query(
    `INSERT INTO test_reference_ranges (parameter_id, animal_type, min_value, max_value, critical_low, critical_high, unit, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [parameterId, range.animal_type, range.min_value, range.max_value, range.critical_low, range.critical_high, range.unit, range.notes]
  );
  return result.rows[0];
};

module.exports = { listCategories, list, getById, create, update, addParameter, addReferenceRange };
