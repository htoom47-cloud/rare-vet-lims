const { query, getClient } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { paginate, buildPagination } = require('../utils/helpers');
const { buildCbcDisplayParameters, DEFAULT_CBC_TEST_CODE } = require('../utils/norma-cbc-map');
const { upsertReferenceRange } = require('./reference-ranges.service');

const listCategories = async ({ includeInactive } = {}) => {
  const where = includeInactive ? '' : 'WHERE is_active = true';
  const result = await query(`SELECT * FROM test_categories ${where} ORDER BY sort_order, name`);
  return result.rows;
};

const getCategoryById = async (id) => {
  const result = await query('SELECT * FROM test_categories WHERE id = $1', [id]);
  if (!result.rows[0]) throw new AppError('Category not found', 404, 'NOT_FOUND');
  return result.rows[0];
};

const createCategory = async (data) => {
  const result = await query(
    `INSERT INTO test_categories (code, name, name_ar, department, sort_order)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [data.code, data.name, data.name_ar, data.department, data.sort_order ?? 0]
  );
  return result.rows[0];
};

const updateCategory = async (id, data) => {
  await getCategoryById(id);
  const result = await query(
    `UPDATE test_categories SET code = $1, name = $2, name_ar = $3, department = $4, sort_order = $5
     WHERE id = $6 RETURNING *`,
    [data.code, data.name, data.name_ar, data.department, data.sort_order ?? 0, id]
  );
  return result.rows[0];
};

const deleteCategory = async (id) => {
  await getCategoryById(id);
  const tests = await query('SELECT COUNT(*) FROM tests WHERE category_id = $1 AND is_active = true', [id]);
  if (parseInt(tests.rows[0].count, 10) > 0) {
    throw new AppError('Cannot delete category with active tests', 400, 'CATEGORY_HAS_TESTS');
  }
  await query('UPDATE test_categories SET is_active = false WHERE id = $1', [id]);
  return { deleted: true };
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
    `SELECT t.*, tc.name as category_name, tc.name_ar as category_name_ar,
            tc.code as category_code, tc.department as category_department
     FROM tests t LEFT JOIN test_categories tc ON t.category_id = tc.id
     ${where} ORDER BY tc.sort_order, t.name LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { data: result.rows, pagination: buildPagination(total, p, l) };
};

const getById = async (id) => {
  const result = await query(
    `SELECT t.*, tc.name as category_name, tc.code as category_code, tc.department as category_department
     FROM tests t
     LEFT JOIN test_categories tc ON t.category_id = tc.id WHERE t.id = $1`,
    [id]
  );
  if (!result.rows[0]) throw new AppError('Test not found', 404, 'NOT_FOUND');

  const [parameters, ranges] = await Promise.all([
    query('SELECT * FROM test_parameters WHERE test_id = $1 AND is_active = true ORDER BY sort_order', [id]),
    query(
      `SELECT tr.*, tp.name as parameter_name, tp.code as parameter_code
       FROM test_reference_ranges tr JOIN test_parameters tp ON tr.parameter_id = tp.id
       WHERE tp.test_id = $1`,
      [id]
    ),
  ]);

  const test = result.rows[0];
  let params = parameters.rows;
  if (test.code === DEFAULT_CBC_TEST_CODE) {
    params = buildCbcDisplayParameters(params);
  }

  return { ...test, parameters: params, reference_ranges: ranges.rows };
};

const create = async (data) => {
  const existing = await query('SELECT id, is_active FROM tests WHERE code = $1', [data.code]);
  const row = existing.rows[0];

  if (row?.is_active) {
    throw new AppError('Test code already exists', 400, 'DUPLICATE_CODE');
  }

  const values = [
    data.code, data.name, data.name_ar || null, data.category_id, data.description || null,
    data.price, data.turnaround_hours, data.unit || null, data.method || null, data.label_copies ?? 1,
  ];

  if (row && !row.is_active) {
    const result = await query(
      `UPDATE tests SET code=$1, name=$2, name_ar=$3, category_id=$4, description=$5, price=$6,
       turnaround_hours=$7, unit=$8, method=$9, label_copies=$10, is_active=true, updated_at=NOW()
       WHERE id=$11 RETURNING *`,
      [...values, row.id]
    );
    return result.rows[0];
  }

  const result = await query(
    `INSERT INTO tests (code, name, name_ar, category_id, description, price, turnaround_hours, unit, method, label_copies)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    values
  );
  return result.rows[0];
};

const update = async (id, data) => {
  await getById(id);
  const dup = await query('SELECT id FROM tests WHERE code = $1 AND id != $2 AND is_active = true', [data.code, id]);
  if (dup.rows[0]) {
    throw new AppError('Test code already exists', 400, 'DUPLICATE_CODE');
  }
  const result = await query(
    `UPDATE tests SET code=$1, name=$2, name_ar=$3, category_id=$4, description=$5, price=$6,
     turnaround_hours=$7, unit=$8, method=$9, label_copies=$10, updated_at=NOW() WHERE id=$11 RETURNING *`,
    [data.code, data.name, data.name_ar || null, data.category_id, data.description || null, data.price, data.turnaround_hours, data.unit || null, data.method || null, data.label_copies ?? 1, id]
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

const getParameterById = async (parameterId) => {
  const result = await query('SELECT * FROM test_parameters WHERE id = $1', [parameterId]);
  if (!result.rows[0]) throw new AppError('Parameter not found', 404, 'NOT_FOUND');
  return result.rows[0];
};

const updateParameter = async (parameterId, param) => {
  const existing = await getParameterById(parameterId);
  const result = await query(
    `UPDATE test_parameters
     SET code = $1, name = $2, name_ar = $3, unit = $4, sort_order = $5,
         is_calculated = $6, formula = $7, decimal_places = $8
     WHERE id = $9 RETURNING *`,
    [
      param.code ?? existing.code,
      param.name ?? existing.name,
      param.name_ar ?? existing.name_ar,
      param.unit ?? existing.unit,
      param.sort_order ?? existing.sort_order,
      param.is_calculated ?? existing.is_calculated,
      param.formula ?? existing.formula,
      param.decimal_places ?? existing.decimal_places,
      parameterId,
    ]
  );
  return result.rows[0];
};

const deleteParameter = async (parameterId) => {
  const existing = await getParameterById(parameterId);
  if (existing.code === 'NOTES') {
    throw new AppError('Cannot delete the notes field', 400, 'PROTECTED_PARAMETER');
  }
  await query('UPDATE test_parameters SET is_active = false WHERE id = $1', [parameterId]);
  return { deleted: true };
};

const addReferenceRange = async (parameterId, range) => upsertReferenceRange({
  parameterId,
  animalType: range.animal_type,
  min: range.min_value,
  max: range.max_value,
  criticalLow: range.critical_low,
  criticalHigh: range.critical_high,
  unit: range.unit,
  notes: range.notes ?? null,
  source: 'manual',
  onlyIfMissing: false,
});

const deleteTest = async (id) => {
  await getById(id);
  await query('UPDATE tests SET is_active = false, updated_at = NOW() WHERE id = $1', [id]);
  return { deleted: true };
};

const packageSelectSql = `
  SELECT p.*,
    COALESCE(array_agg(t.id) FILTER (WHERE t.id IS NOT NULL), '{}') AS test_ids,
    COALESCE(array_agg(t.name) FILTER (WHERE t.id IS NOT NULL), '{}') AS test_names,
    COALESCE(array_agg(t.name_ar) FILTER (WHERE t.id IS NOT NULL), '{}') AS test_names_ar
  FROM packages p
  LEFT JOIN package_tests pt ON p.id = pt.package_id
  LEFT JOIN tests t ON pt.test_id = t.id
`;

const listPackages = async ({ includeInactive } = {}) => {
  const where = includeInactive ? '' : 'WHERE p.is_active = true';
  const result = await query(
    `${packageSelectSql} ${where} GROUP BY p.id ORDER BY p.name`,
    []
  );
  return result.rows;
};

const getPackageById = async (id) => {
  const result = await query(`${packageSelectSql} WHERE p.id = $1 GROUP BY p.id`, [id]);
  if (!result.rows[0]) throw new AppError('Package not found', 404, 'NOT_FOUND');
  return result.rows[0];
};

const createPackage = async (data) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const pkg = await client.query(
      `INSERT INTO packages (name, name_ar, description, price, discount_percent)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [data.name, data.name_ar, data.description, data.price, data.discount_percent ?? 0]
    );
    const packageId = pkg.rows[0].id;
    for (const testId of data.test_ids) {
      await client.query('INSERT INTO package_tests (package_id, test_id) VALUES ($1, $2)', [packageId, testId]);
    }
    await client.query('COMMIT');
    return getPackageById(packageId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const updatePackage = async (id, data) => {
  await getPackageById(id);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE packages SET name = $1, name_ar = $2, description = $3, price = $4, discount_percent = $5
       WHERE id = $6`,
      [data.name, data.name_ar, data.description, data.price, data.discount_percent ?? 0, id]
    );
    await client.query('DELETE FROM package_tests WHERE package_id = $1', [id]);
    for (const testId of data.test_ids) {
      await client.query('INSERT INTO package_tests (package_id, test_id) VALUES ($1, $2)', [id, testId]);
    }
    await client.query('COMMIT');
    return getPackageById(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const deletePackage = async (id) => {
  await getPackageById(id);
  await query('UPDATE packages SET is_active = false WHERE id = $1', [id]);
  return { deleted: true };
};

module.exports = {
  listCategories, getCategoryById, createCategory, updateCategory, deleteCategory,
  list, getById, create, update, deleteTest,
  addParameter, updateParameter, deleteParameter, addReferenceRange,
  listPackages, getPackageById, createPackage, updatePackage, deletePackage,
};
