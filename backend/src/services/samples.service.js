const { query, getClient } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { barcodeLookupSql, barcodeLookupOrderSql } = require('../utils/barcode-lookup');
const { normalizeSampleScanId } = require('../utils/barcode-scan');
const {
  generateNextSampleCode,
  generateBarcodeDigitsId,
  SAMPLE_SEQUENCE_LOCK,
  paginate,
  buildPagination,
} = require('../utils/helpers');
const { generateSampleBarcode } = require('../utils/barcode');
const { PARAS_CATEGORY_CODE } = require('../utils/parasitologyTests');
const { notDeleted } = require('../utils/soft-delete-sql');
const { resolveSampleTestIds } = require('../utils/packageTests');
const autoInvoice = require('./auto-invoice.service');
const workflowEngine = require('./laboratory-workflow.service');
const env = require('../config/env');
const { assertSampleNotReportLocked } = require('./report-lock.service');
const { uuidv4 } = require('../utils/uuid');

const sampleHasBillableInvoice = async (sampleId, customerId, animalId) => {
  const bySample = await query(
    `SELECT id FROM invoices
     WHERE sample_id = $1 AND status NOT IN ('cancelled', 'refunded')
     LIMIT 1`,
    [sampleId]
  );
  if (bySample.rows[0]) return true;

  const byAnimal = await query(
    `SELECT i.id FROM invoices i
     JOIN invoice_items ii ON ii.invoice_id = i.id
     WHERE i.customer_id = $1 AND ii.animal_id = $2
       AND i.status NOT IN ('cancelled', 'refunded')
     LIMIT 1`,
    [customerId, animalId]
  );
  if (byAnimal.rows[0]) return true;

  const credit = await query(
    'SELECT credit_limit FROM customers WHERE id = $1',
    [customerId]
  );
  return parseFloat(credit.rows[0]?.credit_limit || 0) > 0;
};

const assertInvoiceAllowsBarcode = async (sampleRow) => {
  if (!env.features?.requireInvoiceBeforeBarcode) return;
  const ok = await sampleHasBillableInvoice(
    sampleRow.id,
    sampleRow.customer_id,
    sampleRow.animal_id
  );
  if (!ok) {
    throw new AppError(
      'Issue invoice or grant credit before printing barcode',
      403,
      'INVOICE_REQUIRED'
    );
  }
};

const queueStatusWhere = () => {
  if (!env.features?.requireLabHandover) {
    return `s.status IN ('received', 'running')`;
  }
  return `s.lab_handover_at IS NOT NULL AND s.status IN ('pending', 'received', 'running')`;
};

const list = async ({ status, search, awaiting_validation, page, limit }) => {
  const { offset, page: p, limit: l } = paginate(page, limit);
  const params = [];
  let where = `WHERE ${notDeleted('s')}`;

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
    `SELECT s.*, c.full_name as customer_name, c.mobile as customer_mobile,
            a.animal_code, a.animal_type, a.name_tag as animal_name,
            u.full_name as technician_name,
            (SELECT COUNT(DISTINCT st.test_id) FROM sample_tests st WHERE st.sample_id = s.id) as test_count,
            (SELECT COUNT(*) FROM reports rep WHERE rep.sample_id = s.id AND rep.deleted_at IS NULL) as reports_count,
            (SELECT rep.id FROM reports rep
             WHERE rep.sample_id = s.id AND rep.deleted_at IS NULL
             ORDER BY rep.created_at DESC LIMIT 1) as latest_report_id,
            (SELECT rep.treatment_recommendations FROM reports rep
             WHERE rep.sample_id = s.id AND rep.deleted_at IS NULL
             ORDER BY rep.created_at DESC LIMIT 1) as treatment_recommendations,
            (SELECT rep.language FROM reports rep
             WHERE rep.sample_id = s.id AND rep.deleted_at IS NULL
             ORDER BY rep.created_at DESC LIMIT 1) as report_language,
            (SELECT COUNT(*) FROM notification_queue nq
             WHERE nq.metadata::jsonb->>'sample_id' = s.id::text) as notifications_count
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
            (SELECT COUNT(DISTINCT st.test_id) FROM results r
             JOIN sample_tests st ON r.sample_test_id = st.id WHERE st.sample_id = s.id) as results_count,
            (SELECT COUNT(DISTINCT st.test_id) FROM results r
             JOIN sample_tests st ON r.sample_test_id = st.id
             WHERE st.sample_id = s.id AND r.is_validated = true) as validated_results_count,
            (SELECT COUNT(*) FROM reports rep WHERE rep.sample_id = s.id) as reports_count,
            (SELECT COUNT(*) FROM notification_queue nq
             WHERE nq.metadata::jsonb->>'sample_id' = s.id::text) as notifications_count
     FROM samples s
     LEFT JOIN customers c ON s.customer_id = c.id
     LEFT JOIN animals a ON s.animal_id = a.id
     LEFT JOIN invoices inv ON inv.sample_id = s.id
     WHERE s.id = $1 AND ${notDeleted('s')}`,
    [id]
  );
  if (!result.rows[0]) throw new AppError('Sample not found', 404, 'NOT_FOUND');

  const tests = await query(
    `SELECT DISTINCT ON (st.test_id) st.*, t.name as test_name, t.name_ar as test_name_ar, t.code as test_code, t.price,
            t.label_copies, tc.code as category_code,
            EXISTS (SELECT 1 FROM results r WHERE r.sample_test_id = st.id) as has_results,
            EXISTS (SELECT 1 FROM results r WHERE r.sample_test_id = st.id AND r.is_validated = true) as is_validated
     FROM sample_tests st
     JOIN tests t ON st.test_id = t.id
     LEFT JOIN test_categories tc ON t.category_id = tc.id
     WHERE st.sample_id = $1
     ORDER BY st.test_id, st.created_at DESC`,
    [id]
  );

  const row = result.rows[0];
  const activeTests = tests.rows.filter((t) => t.status !== 'cancelled');
  const payload = {
    ...row,
    tests: tests.rows,
    workflow: {
      has_invoice: !!row.invoice_id,
      has_barcode: !!row.barcode,
      delivered: row.status !== 'pending',
      has_results: parseInt(row.results_count, 10) > 0,
      all_validated: activeTests.length > 0 && activeTests.every((t) => t.is_validated),
      has_report: parseInt(row.reports_count, 10) > 0,
      sent_to_customer: parseInt(row.notifications_count, 10) > 0,
    },
  };

  if (workflowEngine.isEnabled()) {
    try {
      payload.workflowSummary = await workflowEngine.getWorkflowSummary(id, { skipTimeline: false });
    } catch (err) {
      payload.workflowSummary = { enabled: true, error: err.message };
    }
  }

  return payload;
};

const getByBarcode = async (barcode) => {
  const raw = String(barcode || '').trim();
  const id = normalizeSampleScanId(raw) || raw;
  if (!id) throw new AppError('Sample not found', 404, 'NOT_FOUND');
  const result = await query(
    `SELECT id FROM samples s WHERE ${barcodeLookupSql('s')} ORDER BY ${barcodeLookupOrderSql('s')} LIMIT 1`,
    [id]
  );
  if (!result.rows[0]) throw new AppError('Sample not found', 404, 'NOT_FOUND');
  return getById(result.rows[0].id);
};

const create = async (data, userId) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [SAMPLE_SEQUENCE_LOCK]);

    const sampleCode = await generateNextSampleCode(client.query.bind(client));

    let barcode = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const candidate = generateBarcodeDigitsId();
      // eslint-disable-next-line no-await-in-loop
      const exists = await client.query(
        'SELECT 1 FROM samples WHERE barcode = $1 LIMIT 1',
        [candidate]
      );
      if (!exists.rows.length) {
        barcode = candidate;
        break;
      }
    }
    if (!barcode) {
      throw new AppError('Could not generate unique barcode', 500, 'BARCODE_COLLISION');
    }

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
        `INSERT INTO sample_tests (id, sample_id, test_id, price, status) VALUES ($1, $2, $3, $4, 'pending')
         ON CONFLICT (sample_id, test_id) DO NOTHING`,
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
  const lifecycle = require('./report-lifecycle.service');
  await lifecycle.markReportsNeedsUpdateBySampleId(id, 'SAMPLE');
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
        (
          EXISTS (SELECT 1 FROM sample_tests st WHERE st.sample_id = s.id)
          AND NOT EXISTS (
            SELECT 1 FROM sample_tests st
            WHERE st.sample_id = s.id AND st.status NOT IN ('completed', 'cancelled')
          )
          AND NOT EXISTS (
            SELECT 1 FROM sample_tests st
            WHERE st.sample_id = s.id
              AND st.status != 'cancelled'
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
  let where = `WHERE ${notDeleted('s')} AND ${queueStatusWhere()}`;

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
     WHERE ${notDeleted('s')} AND ${queueStatusWhere()}
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
  await assertInvoiceAllowsBarcode(sample);
  const barcodeImage = await generateSampleBarcode({
    sample_code: sample.sample_code,
    customer_name: sample.customer_name,
    animal_code: sample.animal_code,
    test_names: sample.tests.map((t) => t.test_name),
    collection_date: sample.collection_date,
  }, format);
  return { barcode: sample.barcode, sample_code: sample.sample_code, image: barcodeImage };
};

const MANAGER_ROLES = ['admin', 'manager'];

const reassignAnimal = async (sampleId, animalId, userId, userRole, auditCtx = {}) => {
  if (!MANAGER_ROLES.includes(userRole)) {
    throw new AppError(
      'Admin or manager required to reassign sample animal',
      403,
      'FORBIDDEN'
    );
  }
  await assertSampleNotReportLocked(sampleId);
  const sample = await getById(sampleId);
  const animalResult = await query(
    `SELECT id, owner_id, animal_code, name_tag FROM animals
     WHERE id = $1 AND is_active = true`,
    [animalId]
  );
  if (!animalResult.rows[0]) {
    throw new AppError('Animal not found', 404, 'NOT_FOUND');
  }
  if (animalResult.rows[0].owner_id !== sample.customer_id) {
    throw new AppError(
      'Animal must belong to the same customer as the sample',
      400,
      'ANIMAL_OWNER_MISMATCH'
    );
  }
  if (animalResult.rows[0].id === sample.animal_id) {
    return sample;
  }

  const previousAnimalId = sample.animal_id;
  await query(
    'UPDATE samples SET animal_id = $1, updated_at = NOW() WHERE id = $2',
    [animalId, sampleId]
  );

  await query(
    `INSERT INTO audit_logs (id, user_id, action, module, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
     VALUES ($1, $2, 'reassign_animal', 'samples', 'sample', $3, $4, $5, $6, $7)`,
    [
      uuidv4(),
      userId,
      sampleId,
      JSON.stringify({
        animal_id: previousAnimalId,
        animal_code: sample.animal_code,
      }),
      JSON.stringify({
        animal_id: animalId,
        animal_code: animalResult.rows[0].animal_code,
        name_tag: animalResult.rows[0].name_tag,
      }),
      auditCtx.ip || null,
      auditCtx.userAgent || null,
    ]
  );

  const reportLifecycle = require('./report-lifecycle.service');
  await reportLifecycle.markReportsNeedsUpdateBySampleId(sampleId, 'ANIMAL');
  if (previousAnimalId) {
    await reportLifecycle.markReportsNeedsUpdateByAnimalId(previousAnimalId, 'ANIMAL');
  }
  await reportLifecycle.markReportsNeedsUpdateByAnimalId(animalId, 'ANIMAL');

  return getById(sampleId);
};

const recordLabHandover = async (sampleId, userId, auditCtx = {}) => {
  const sample = await getById(sampleId);
  if (sample.lab_handover_at) {
    return sample;
  }
  await query(
    `UPDATE samples SET lab_handover_at = NOW(), lab_handover_by = $1, updated_at = NOW() WHERE id = $2`,
    [userId, sampleId]
  );
  await query(
    `INSERT INTO audit_logs (id, user_id, action, module, entity_type, entity_id, new_values, ip_address, user_agent)
     VALUES ($1, $2, 'lab_handover', 'samples', 'sample', $3, $4, $5, $6)`,
    [
      uuidv4(),
      userId,
      sampleId,
      JSON.stringify({ sample_code: sample.sample_code, lab_handover_at: new Date().toISOString() }),
      auditCtx.ip || null,
      auditCtx.userAgent || null,
    ]
  );
  return getById(sampleId);
};

module.exports = {
  list,
  getById,
  getByBarcode,
  create,
  updateStatus,
  reassignAnimal,
  recordLabHandover,
  reconcileSampleStatuses,
  getQueue,
  getParasitologyQueue,
  getBarcode,
  sampleHasBillableInvoice,
  assertInvoiceAllowsBarcode,
  getWorkflowSummary: (id) => workflowEngine.getWorkflowSummary(id),
  advanceWorkflow: (id, action, ctx) => workflowEngine.moveToNextStep(id, action, ctx),
};
