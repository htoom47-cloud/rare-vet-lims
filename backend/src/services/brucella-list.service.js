/**
 * Brucella herd list: read samples and save qualitative RESULT values
 * through the existing result engine. Does not generate per-sample reports.
 */
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { saveFile, deleteFile } = require('../config/storage');
const { notDeleted } = require('../utils/soft-delete-sql');
const { labDateSql } = require('../utils/accounting-time');
const { buildBrucellaListPdf } = require('../utils/brucella-list-pdf');
const { enterResults, validateResults } = require('./results.service');

const NEGATIVE = 'لا توجد مالطيه';
const POSITIVE = 'إيجابي';
const ALLOWED = new Set([NEGATIVE, POSITIVE]);
const MAX_ROWS = 400;

const brucellaSql = `
  t.code NOT ILIKE '%ELISA%'
  AND (
    t.code IN ('BRUCELLA', 'BRU-ROSE-BENGAL')
    OR t.code ILIKE 'BRU%'
  )
`;

const listSql = `
  SELECT s.id AS sample_id, s.sample_code, s.created_at,
         a.animal_code, a.name_tag AS animal_name,
         st.id AS sample_test_id, t.code AS test_code,
         p.id AS result_parameter_id,
         rv.value AS result_value,
         COALESCE(r.is_validated, false) AS is_validated
  FROM sample_tests st
  JOIN samples s ON s.id = st.sample_id
  JOIN animals a ON a.id = s.animal_id
  JOIN tests t ON t.id = st.test_id
  LEFT JOIN test_parameters p ON p.test_id = t.id AND p.code = 'RESULT' AND p.unit = 'qual'
  LEFT JOIN results r ON r.sample_test_id = st.id
  LEFT JOIN result_values rv ON rv.result_id = r.id AND rv.parameter_id = p.id
  WHERE s.customer_id = $1
    AND ${notDeleted('s')}
    AND st.status IS DISTINCT FROM 'cancelled'
    AND ${brucellaSql}
`;

const hasResultValue = (row) => String(row?.result_value || '').trim() !== '';

/** One row per sample. A joined parameter/value must not list the same sample twice. */
const collapseBySample = (rows) => {
  const bySample = new Map();
  for (const row of rows) {
    const key = String(row.sample_id);
    const prev = bySample.get(key);
    if (!prev || (!hasResultValue(prev) && hasResultValue(row))) bySample.set(key, row);
  }
  return [...bySample.values()];
};

const normalizeRow = (row) => ({
  ...row,
  is_validated: row.is_validated === true || row.is_validated === 't',
});

const listForCustomer = async (customerId, { from, to } = {}) => {
  if (!customerId) throw new AppError('Customer is required', 400, 'VALIDATION_ERROR');
  const params = [customerId];
  let sql = listSql;
  if (from) {
    params.push(from);
    sql += ` AND ${labDateSql('s.created_at')} >= $${params.length}::date`;
  }
  if (to) {
    params.push(to);
    sql += ` AND ${labDateSql('s.created_at')} <= $${params.length}::date`;
  }
  sql += ' ORDER BY s.created_at ASC, a.animal_code ASC, (rv.value IS NULL) ASC LIMIT 1000';
  const result = await query(sql, params);
  return collapseBySample(result.rows.map(normalizeRow)).slice(0, 500);
};

const loadOwnedRow = async (customerId, sampleTestId) => {
  const result = await query(
    `${listSql} AND st.id = $2 ORDER BY (rv.value IS NULL) ASC`,
    [customerId, sampleTestId]
  );
  const row = result.rows.find(hasResultValue) || result.rows[0];
  return row ? normalizeRow(row) : null;
};

const saveRows = async (customerId, rows, userId, { approve = false } = {}) => {
  if (!Array.isArray(rows) || !rows.length) {
    throw new AppError('No rows to save', 400, 'VALIDATION_ERROR');
  }
  if (rows.length > MAX_ROWS) {
    throw new AppError(`A batch can save at most ${MAX_ROWS} rows`, 400, 'VALIDATION_ERROR');
  }

  const saved = [];
  const skipped = [];
  const failed = [];

  for (const row of rows) {
    const sampleTestId = row?.sample_test_id;
    const value = String(row?.value || '').trim();
    if (!ALLOWED.has(value)) {
      failed.push({ sample_test_id: sampleTestId, reason: 'invalid_value' });
      continue;
    }
    const current = await loadOwnedRow(customerId, sampleTestId);
    if (!current) {
      failed.push({ sample_test_id: sampleTestId, reason: 'not_in_list' });
      continue;
    }
    if (!current.result_parameter_id) {
      failed.push({ sample_test_id: sampleTestId, reason: 'missing_result_parameter' });
      continue;
    }
    const same = String(current.result_value || '').trim() === value;
    const validated = current.is_validated === true || current.is_validated === 't';
    if (validated && !same) {
      failed.push({ sample_test_id: sampleTestId, reason: 'validated_locked' });
      continue;
    }
    if (same && (validated || !approve)) {
      skipped.push(sampleTestId);
      continue;
    }
    try {
      if (!same) {
        await enterResults({
          sample_test_id: sampleTestId,
          values: [{ parameter_id: current.result_parameter_id, value }],
        }, userId);
      }
      if (approve && !validated) {
        await validateResults(sampleTestId, userId, '');
      }
      saved.push(sampleTestId);
    } catch (err) {
      failed.push({
        sample_test_id: sampleTestId,
        reason: err.code || 'save_failed',
        message: err.message,
      });
    }
  }

  return {
    saved: saved.length,
    skipped: skipped.length,
    failed,
  };
};

const publishForCustomer = async (customerId, userId, { from, to } = {}) => {
  const rows = (await listForCustomer(customerId, { from, to })).filter((row) => hasResultValue(row));
  if (!rows.length) {
    throw new AppError('Save results before sending the list to the portal', 400, 'NOTHING_TO_PUBLISH');
  }
  const customer = await query(
    'SELECT full_name_ar, full_name FROM customers WHERE id = $1',
    [customerId]
  );
  if (!customer.rows[0]) throw new AppError('Customer not found', 404, 'NOT_FOUND');
  const customerName = customer.rows[0].full_name_ar || customer.rows[0].full_name || '';
  const printedAt = new Date().toLocaleDateString('en-GB', {
    timeZone: 'Asia/Riyadh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const pdf = await buildBrucellaListPdf({ customerName, rows, printedAt });
  const positiveCount = rows.filter((row) => /^(positive|إيجابي|\+|pos)$/i.test(String(row.result_value || '').trim())).length;
  const saved = await saveFile(pdf, 'brucella-lists', 'brucella-list.pdf');
  const previous = await query(
    'SELECT pdf_url FROM customer_brucella_lists WHERE customer_id = $1',
    [customerId]
  );
  await query(
    `INSERT INTO customer_brucella_lists
       (id, customer_id, pdf_url, row_count, positive_count, published_by, published_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (customer_id) DO UPDATE SET
       pdf_url = EXCLUDED.pdf_url,
       row_count = EXCLUDED.row_count,
       positive_count = EXCLUDED.positive_count,
       published_by = EXCLUDED.published_by,
       published_at = NOW()`,
    [uuidv4(), customerId, saved.url, rows.length, positiveCount, userId]
  );
  const oldUrl = previous.rows[0]?.pdf_url;
  if (oldUrl && oldUrl !== saved.url) await deleteFile(oldUrl).catch(() => {});
  return {
    row_count: rows.length,
    positive_count: positiveCount,
    published_at: new Date().toISOString(),
  };
};

module.exports = {
  NEGATIVE,
  POSITIVE,
  listForCustomer,
  saveRows,
  publishForCustomer,
};
