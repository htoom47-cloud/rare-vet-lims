/**
 * Brucella herd list: Rose Bengal (RESULT) or ELISA Malta (SP-RATIO + RESULT).
 * Saves through the existing result engine. Does not generate per-sample reports.
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
const PANELS = new Set(['rose', 'elisa']);

const normalizePanel = (panel) => {
  const value = String(panel || 'rose').trim().toLowerCase();
  return PANELS.has(value) ? value : 'rose';
};

const roseSql = `
  t.code NOT ILIKE '%ELISA%'
  AND (
    t.code IN ('BRUCELLA', 'BRU-ROSE-BENGAL')
    OR t.code ILIKE 'BRU%'
  )
`;

const elisaSql = `
  (
    t.code = 'BRU-ELISA'
    OR (
      COALESCE(tc.code, '') = 'ELISA'
      AND (
        t.code ILIKE '%BRU%'
        OR t.name ILIKE '%bruc%'
        OR COALESCE(t.name_ar, '') ILIKE '%مالط%'
      )
    )
  )
`;

const buildListSql = (panel) => {
  if (panel === 'elisa') {
    return `
  SELECT s.id AS sample_id, s.sample_code, s.created_at,
         a.animal_code, a.name_tag AS animal_name,
         st.id AS sample_test_id, t.code AS test_code,
         p_result.id AS result_parameter_id,
         rv_result.value AS result_value,
         p_sp.id AS sp_parameter_id,
         rv_sp.value AS sp_value,
         COALESCE(r.is_validated, false) AS is_validated
  FROM sample_tests st
  JOIN samples s ON s.id = st.sample_id
  JOIN animals a ON a.id = s.animal_id
  JOIN tests t ON t.id = st.test_id
  LEFT JOIN test_categories tc ON tc.id = t.category_id
  LEFT JOIN test_parameters p_result ON p_result.test_id = t.id AND p_result.code = 'RESULT' AND p_result.unit = 'qual'
  LEFT JOIN test_parameters p_sp ON p_sp.test_id = t.id AND p_sp.code = 'SP-RATIO'
  LEFT JOIN results r ON r.sample_test_id = st.id
  LEFT JOIN result_values rv_result ON rv_result.result_id = r.id AND rv_result.parameter_id = p_result.id
  LEFT JOIN result_values rv_sp ON rv_sp.result_id = r.id AND rv_sp.parameter_id = p_sp.id
  WHERE s.customer_id = $1
    AND ${notDeleted('s')}
    AND st.status IS DISTINCT FROM 'cancelled'
    AND ${elisaSql}
`;
  }

  return `
  SELECT s.id AS sample_id, s.sample_code, s.created_at,
         a.animal_code, a.name_tag AS animal_name,
         st.id AS sample_test_id, t.code AS test_code,
         p.id AS result_parameter_id,
         rv.value AS result_value,
         NULL::uuid AS sp_parameter_id,
         NULL::text AS sp_value,
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
    AND ${roseSql}
`;
};

const hasResultValue = (row) => String(row?.result_value || '').trim() !== '';
const hasSpValue = (row) => String(row?.sp_value || '').trim() !== '';
const hasAnyValue = (row) => hasResultValue(row) || hasSpValue(row);

/** One row per sample. Prefer a row that already has values. */
const collapseBySample = (rows) => {
  const bySample = new Map();
  for (const row of rows) {
    const key = String(row.sample_id);
    const prev = bySample.get(key);
    if (!prev || (!hasAnyValue(prev) && hasAnyValue(row))) bySample.set(key, row);
  }
  return [...bySample.values()];
};

const normalizeRow = (row) => ({
  ...row,
  is_validated: row.is_validated === true || row.is_validated === 't',
  sp_value: row.sp_value == null ? null : String(row.sp_value),
});

const parseSpValue = (raw) => {
  const text = String(raw ?? '').trim();
  if (!text) return { ok: false, reason: 'missing_sp' };
  const num = Number(text);
  if (!Number.isFinite(num)) return { ok: false, reason: 'invalid_sp' };
  return { ok: true, value: String(num) };
};

const listForCustomer = async (customerId, { from, to, panel } = {}) => {
  if (!customerId) throw new AppError('Customer is required', 400, 'VALIDATION_ERROR');
  const mode = normalizePanel(panel);
  const params = [customerId];
  let sql = buildListSql(mode);
  if (from) {
    params.push(from);
    sql += ` AND ${labDateSql('s.created_at')} >= $${params.length}::date`;
  }
  if (to) {
    params.push(to);
    sql += ` AND ${labDateSql('s.created_at')} <= $${params.length}::date`;
  }
  const nullCheck = mode === 'elisa' ? 'rv_result.value' : 'rv.value';
  sql += ` ORDER BY s.created_at ASC, a.animal_code ASC, (${nullCheck} IS NULL) ASC LIMIT 1000`;
  const result = await query(sql, params);
  return collapseBySample(result.rows.map(normalizeRow)).slice(0, 500);
};

const loadOwnedRow = async (customerId, sampleTestId, panel) => {
  const mode = normalizePanel(panel);
  const listSql = buildListSql(mode);
  const result = await query(
    `${listSql} AND st.id = $2 ORDER BY (${mode === 'elisa' ? 'rv_result' : 'rv'}.value IS NULL) ASC`,
    [customerId, sampleTestId]
  );
  const row = result.rows.find(hasAnyValue) || result.rows[0];
  return row ? normalizeRow(row) : null;
};

const saveRows = async (customerId, rows, userId, { approve = false, panel } = {}) => {
  if (!Array.isArray(rows) || !rows.length) {
    throw new AppError('No rows to save', 400, 'VALIDATION_ERROR');
  }
  if (rows.length > MAX_ROWS) {
    throw new AppError(`A batch can save at most ${MAX_ROWS} rows`, 400, 'VALIDATION_ERROR');
  }
  const mode = normalizePanel(panel);

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

    let spParsed = null;
    if (mode === 'elisa') {
      spParsed = parseSpValue(row?.sp_value);
      if (!spParsed.ok) {
        failed.push({ sample_test_id: sampleTestId, reason: spParsed.reason });
        continue;
      }
    }

    const current = await loadOwnedRow(customerId, sampleTestId, mode);
    if (!current) {
      failed.push({ sample_test_id: sampleTestId, reason: 'not_in_list' });
      continue;
    }
    if (!current.result_parameter_id) {
      failed.push({ sample_test_id: sampleTestId, reason: 'missing_result_parameter' });
      continue;
    }
    if (mode === 'elisa' && !current.sp_parameter_id) {
      failed.push({ sample_test_id: sampleTestId, reason: 'missing_sp_parameter' });
      continue;
    }

    const sameResult = String(current.result_value || '').trim() === value;
    const sameSp = mode !== 'elisa'
      || String(current.sp_value || '').trim() === spParsed.value;
    const same = sameResult && sameSp;
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
        const values = [{ parameter_id: current.result_parameter_id, value }];
        if (mode === 'elisa') {
          values.unshift({ parameter_id: current.sp_parameter_id, value: spParsed.value });
        }
        await enterResults({ sample_test_id: sampleTestId, values }, userId);
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
    panel: mode,
  };
};

const publishForCustomer = async (customerId, userId, { from, to, panel } = {}) => {
  const mode = normalizePanel(panel);
  const rows = (await listForCustomer(customerId, { from, to, panel: mode })).filter((row) => {
    if (mode === 'elisa') return hasResultValue(row) && hasSpValue(row);
    return hasResultValue(row);
  });
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
  const examName = mode === 'elisa' ? 'إليزا المالطية' : 'المالطية روز بنغال';
  const pdf = await buildBrucellaListPdf({
    customerName,
    rows,
    printedAt,
    panel: mode,
    examName,
  });
  const positiveCount = rows.filter((row) => /^(positive|إيجابي|\+|pos)$/i.test(String(row.result_value || '').trim())).length;
  const saved = await saveFile(pdf, 'brucella-lists', `brucella-list-${mode}.pdf`);
  const previous = await query(
    'SELECT pdf_url FROM customer_brucella_lists WHERE customer_id = $1 AND panel = $2',
    [customerId, mode]
  );
  await query(
    `INSERT INTO customer_brucella_lists
       (id, customer_id, panel, pdf_url, row_count, positive_count, published_by, published_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (customer_id, panel) DO UPDATE SET
       pdf_url = EXCLUDED.pdf_url,
       row_count = EXCLUDED.row_count,
       positive_count = EXCLUDED.positive_count,
       published_by = EXCLUDED.published_by,
       published_at = NOW()`,
    [uuidv4(), customerId, mode, saved.url, rows.length, positiveCount, userId]
  );
  const oldUrl = previous.rows[0]?.pdf_url;
  if (oldUrl && oldUrl !== saved.url) await deleteFile(oldUrl).catch(() => {});
  return {
    row_count: rows.length,
    positive_count: positiveCount,
    published_at: new Date().toISOString(),
    panel: mode,
  };
};

module.exports = {
  NEGATIVE,
  POSITIVE,
  normalizePanel,
  listForCustomer,
  saveRows,
  publishForCustomer,
};
