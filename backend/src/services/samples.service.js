const { query, getClient } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { generateCode, paginate, buildPagination } = require('../utils/helpers');
const { generateSampleBarcode } = require('../utils/barcode');
const { PARAS_CATEGORY_CODE } = require('../utils/parasitologyTests');
const { resolveSampleTestIds } = require('../utils/packageTests');
const autoInvoice = require('./auto-invoice.service');
const { uuidv4 } = require('../utils/uuid');

const list = async ({ status, search, awaiting_validation, page, limit }) => {
  const { offset, page: p, limit: l } = paginate(page, limit);
  const params = [];
  let where = 'WHERE 1=1';

  if (awaiting_validation === 'true' || awaiting_validation === true || awaiting_validation === '1') {
    where += ` AND EXISTS (
      SELECT 1 FROM sample_tests st
      JOIN results r ON r.sample_test_id = st.id
      JOIN result_values rv ON rv.result_id = r.id
      WHERE st.sample_id = s.id AND r.is_validated = false
    )`;
  }
  if (status) {
    params.push(status);
    where += ` AND s.status = $${params.length}`;
  }
  if (search) {
    params.push(`%${search}%`);
    where += ` AND (s.sample_code ILIKE $${params.length} OR s.barcode ILIKE $${params.length} OR c.full_name ILIKE $${params.length})`;
  }

  const countResult = await query(
    `SELECT COUNT(*) FROM samples s LEFT JOIN customers c ON s.customer_id = c.id ${where}`,
    params
  );
  const total = parseInt(countResult.rows[0].count, 10);

  params.push(l, offset);
  const result = await query(
    `SELECT s.*, c.full_name as customer_name, a.animal_code, a.animal_type, a.name_tag as animal_name,
            u.full_name as technician_name,
            (SELECT COUNT(*) FROM sample_tests st WHERE st.sample_id = s.id) as test_count
     FROM samples s
     LEFT JOIN customers c ON s.customer_id = c.id
     LEFT JOIN animals a ON s.animal_id = a.id
     LEFT JOIN users u ON s.assigned_technician = u.id
     ${where} ORDER BY s.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { data: result.rows, pagination: buildPagination(total, p, l) };
};

const getById = async (id) => {
  const result = await query(
    `SELECT s.*, c.full_name as customer_name, c.mobile as customer_mobile,
            a.animal_code, a.animal_type, a.name_tag as animal_name,
            inv.id as invoice_id, inv.invoice_number, inv.status as invoice_status, inv.total as invoice_total,
            (SELECT COUNT(*) FROM results r
             JOIN sample_tests st ON r.sample_test_id = st.id WHERE st.sample_id = s.id) as results_count,
            (SELECT COUNT(*) FROM results r
             JOIN sample_tests st ON r.sample_test_id = st.id
             WHERE st.sample_id = s.id AND r.is_validated = true) as validated_results_count,
            (SELECT COUNT(*) FROM reports rep WHERE rep.sample_id = s.id) as reports_count,
            (SELECT COUNT(*) FROM notification_queue nq
             WHERE nq.metadata::jsonb->>'sample_id' = s.id::text) as notifications_count
     FROM samples s
     LEFT JOIN customers c ON s.customer_id = c.id
     LEFT JOIN animals a ON s.animal_id = a.id
     LEFT JOIN invoices inv ON inv.sample_id = s.id
     WHERE s.id = $1`,
    [id]
  );
  if (!result.rows[0]) throw new AppError('Sample not found', 404, 'NOT_FOUND');

  const tests = await query(
    `SELECT st.*, t.name as test_name, t.name_ar as test_name_ar, t.code as test_code, t.price,
            t.label_copies, tc.code as category_code,
            EXISTS (SELECT 1 FROM results r WHERE r.sample_test_id = st.id) as has_results,
            EXISTS (SELECT 1 FROM results r WHERE r.sample_test_id = st.id AND r.is_validated = true) as is_validated
     FROM sample_tests st
     JOIN tests t ON st.test_id = t.id
     LEFT JOIN test_categories tc ON t.category_id = tc.id
     WHERE st.sample_id = $1`,
    [id]
  );

  const row = result.rows[0];
  return {
    ...row,
    tests: tests.rows,
    workflow: {
      has_invoice: !!row.invoice_id,
      has_barcode: !!row.barcode,
      delivered: row.status !== 'pending',
      has_results: parseInt(row.results_count, 10) > 0,
      all_validated: tests.rows.length > 0 && tests.rows.every((t) => t.is_validated),
      has_report: parseInt(row.reports_count, 10) > 0,
      sent_to_customer: parseInt(row.notifications_count, 10) > 0,
    },
  };
};

const getByBarcode = async (barcode) => {
  const result = await query('SELECT id FROM samples WHERE barcode = $1 OR sample_code = $1', [barcode]);
  if (!result.rows[0]) throw new AppError('Sample not found', 404, 'NOT_FOUND');
  return getById(result.rows[0].id);
};

const create = async (data, userId) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const sampleCode = generateCode('SMP');
    const barcode = generateCode('BC');

    const sampleResult = await client.query(
      `INSERT INTO samples (id, sample_code, barcode, customer_id, animal_id, department, priority, notes, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9) RETURNING *`,
      [uuidv4(), sampleCode, barcode, data.customer_id, data.animal_id, data.department, data.priority, data.notes, userId]
    );

    const sample = sampleResult.rows[0];

    const resolvedTestIds = await resolveSampleTestIds(client, {
      test_ids: data.test_ids,
      package_ids: data.package_ids,
    });

    for (const testId of resolvedTestIds) {
      const testPrice = await client.query('SELECT price FROM tests WHERE id = $1', [testId]);
      await client.query(
        `INSERT INTO sample_tests (id, sample_id, test_id, price, status) VALUES ($1, $2, $3, $4, 'pending')`,
        [uuidv4(), sample.id, testId, testPrice.rows[0]?.price || 0]
      );
    }

    if (data.invoice_id) {
      await client.query(
        'UPDATE invoices SET sample_id = $1 WHERE id = $2 AND sample_id IS NULL',
        [sample.id, data.invoice_id]
      );
    }

    await client.query('COMMIT');

    const full = await getById(sample.id);
    const barcodeImage = await generateSampleBarcode({
      sample_code: full.sample_code,
      customer_name: full.customer_name,
      animal_code: full.animal_code,
      test_names: full.tests.map((t) => t.test_name),
      collection_date: full.collection_date,
    });

    await autoInvoice.tryAutoInvoice(sample.id, userId, 'sample');

    return { ...full, barcode_image: barcodeImage };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const updateStatus = async (id, status, extra = {}) => {
  await getById(id);
  const updates = { status };
  const fields = ['status = $1'];
  const params = [status];
  let idx = 2;

  if (status === 'received') {
    fields.push(`received_date = NOW()`);
  }
  if (status === 'completed') {
    fields.push(`completed_date = NOW()`);
  }
  if (extra.rejection_reason) {
    fields.push(`rejection_reason = $${idx}`);
    params.push(extra.rejection_reason);
    idx++;
  }
  if (extra.assigned_technician) {
    fields.push(`assigned_technician = $${idx}`);
    params.push(extra.assigned_technician);
    idx++;
  }
  if (extra.department) {
    fields.push(`department = $${idx}`);
    params.push(extra.department);
    idx++;
  }

  params.push(id);
  const result = await query(
    `UPDATE samples SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
    params
  );
  return result.rows[0];
};

/** Close samples still marked in-lab when all tests/results/reports are finished. */
const reconcileSampleStatuses = async () => {
  await query(`
    UPDATE samples s SET
      status = 'completed',
      completed_date = COALESCE(s.completed_date, NOW()),
      updated_at = NOW()
    WHERE s.status IN ('received', 'running')
      AND (
        EXISTS (SELECT 1 FROM reports rep WHERE rep.sample_id = s.id)
        OR (
          EXISTS (SELECT 1 FROM sample_tests st WHERE st.sample_id = s.id)
          AND NOT EXISTS (
            SELECT 1 FROM sample_tests st
            WHERE st.sample_id = s.id AND st.status != 'completed'
          )
        )
        OR (
          EXISTS (SELECT 1 FROM sample_tests st WHERE st.sample_id = s.id)
          AND NOT EXISTS (
            SELECT 1 FROM sample_tests st
            WHERE st.sample_id = s.id
              AND NOT EXISTS (
                SELECT 1 FROM results r
                WHERE r.sample_test_id = st.id AND r.is_validated = true
              )
          )
        )
      )
  `);
};

/** Tests still needing technician result entry (excludes MICRO + already-entered + tests without parameters). */
const WORKBENCH_PENDING = `
  st.sample_id = s.id
  AND NOT EXISTS (
    SELECT 1 FROM test_categories tc
    WHERE tc.id = t.category_id AND tc.code = $1
  )
  AND EXISTS (SELECT 1 FROM test_parameters tp WHERE tp.test_id = t.id)
  AND NOT EXISTS (
    SELECT 1 FROM results r
    JOIN result_values rv ON rv.result_id = r.id
    WHERE r.sample_test_id = st.id
  )
`;

const getQueue = async (technicianId) => {
  const params = [PARAS_CATEGORY_CODE];
  let where = `WHERE s.status IN ('received', 'running')`;

  if (technicianId) {
    params.push(technicianId);
    where += ` AND (s.assigned_technician = $2 OR s.assigned_technician IS NULL)`;
  }

  const result = await query(
    `SELECT s.*, c.full_name as customer_name, a.animal_code,
            (SELECT COUNT(*)::int FROM sample_tests st
             JOIN tests t ON st.test_id = t.id
             WHERE ${WORKBENCH_PENDING}) as pending_tests,
            (SELECT COALESCE(array_agg(t.name ORDER BY t.name), ARRAY[]::text[])
             FROM sample_tests st
             JOIN tests t ON st.test_id = t.id
             WHERE ${WORKBENCH_PENDING}) as pending_test_names
     FROM samples s
     LEFT JOIN customers c ON s.customer_id = c.id
     LEFT JOIN animals a ON s.animal_id = a.id
     ${where}
       AND EXISTS (
         SELECT 1 FROM sample_tests st
         JOIN tests t ON st.test_id = t.id
         WHERE ${WORKBENCH_PENDING}
       )
     ORDER BY CASE s.priority WHEN 'stat' THEN 1 WHEN 'urgent' THEN 2 ELSE 3 END, s.created_at ASC`,
    params
  );
  return result.rows;
};

const PARAS_PENDING = `
  st.sample_id = s.id
  AND EXISTS (
    SELECT 1 FROM test_categories tc
    WHERE tc.id = t.category_id AND tc.code = $1
  )
  AND EXISTS (SELECT 1 FROM test_parameters tp WHERE tp.test_id = t.id)
  AND NOT EXISTS (
    SELECT 1 FROM results r
    JOIN result_values rv ON rv.result_id = r.id
    WHERE r.sample_test_id = st.id
  )
`;

const getParasitologyQueue = async () => {
  const result = await query(
    `SELECT s.*, c.full_name as customer_name, a.animal_code, a.animal_type,
            (SELECT COUNT(*) FROM sample_tests st
             JOIN tests t ON st.test_id = t.id
             WHERE ${PARAS_PENDING}) as pending_tests
     FROM samples s
     LEFT JOIN customers c ON s.customer_id = c.id
     LEFT JOIN animals a ON s.animal_id = a.id
     WHERE s.status IN ('received', 'running')
       AND EXISTS (
         SELECT 1 FROM sample_tests st
         JOIN tests t ON st.test_id = t.id
         WHERE ${PARAS_PENDING}
       )
     ORDER BY CASE s.priority WHEN 'stat' THEN 1 WHEN 'urgent' THEN 2 ELSE 3 END, s.created_at ASC`,
    [PARAS_CATEGORY_CODE]
  );
  return result.rows;
};

const getBarcode = async (id, format = 'code128') => {
  const sample = await getById(id);
  const barcodeImage = await generateSampleBarcode({
    sample_code: sample.sample_code,
    customer_name: sample.customer_name,
    animal_code: sample.animal_code,
    test_names: sample.tests.map((t) => t.test_name),
    collection_date: sample.collection_date,
  }, format);
  return { barcode: sample.barcode, sample_code: sample.sample_code, image: barcodeImage };
};

module.exports = { list, getById, getByBarcode, create, updateStatus, reconcileSampleStatuses, getQueue, getParasitologyQueue, getBarcode };
