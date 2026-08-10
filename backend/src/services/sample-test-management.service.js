const { query, getClient } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../config/logger');
const { uuidv4 } = require('../utils/uuid');

const env = require('../config/env');
const { assertSampleNotReportLocked } = require('./report-lock.service');
const billing = require('./billing.service');

const LOCKED_INVOICE_STATUSES = ['paid', 'cancelled', 'refunded'];

const logAudit = async (client, { userId, action, sampleId, sampleTestId, reason, oldValues, newValues }) => {
  const q = client || { query: (...a) => query(...a) };
  await q.query(
    `INSERT INTO audit_logs (id, user_id, action, module, entity_type, entity_id, old_values, new_values, ip_address)
     VALUES ($1,$2,$3,'sample_tests','sample_test',$4,$5,$6,'system')`,
    [uuidv4(), userId, action, sampleTestId,
     JSON.stringify({ sample_id: sampleId, reason, ...oldValues }),
     JSON.stringify({ sample_id: sampleId, ...newValues })]
  );
};

const assertNoBlockingReport = async (sampleId) => {
  await assertSampleNotReportLocked(sampleId);
};

const fetchSampleTest = async (sampleId, sampleTestId) => {
  const st = await query(
    `SELECT st.*, t.name AS test_name, t.name_ar AS test_name_ar, t.code AS test_code,
            EXISTS (SELECT 1 FROM results r WHERE r.sample_test_id = st.id) AS has_results,
            EXISTS (SELECT 1 FROM results r WHERE r.sample_test_id = st.id AND r.is_validated = true) AS has_validated
     FROM sample_tests st
     JOIN tests t ON st.test_id = t.id
     WHERE st.id = $1 AND st.sample_id = $2`,
    [sampleTestId, sampleId]
  );
  if (!st.rows[0]) throw new AppError('Sample test not found', 404, 'NOT_FOUND');
  return st.rows[0];
};

const markReportStale = async (sampleId, reason = 'SAMPLE') => {
  try {
    const lifecycle = require('./report-lifecycle.service');
    await lifecycle.markReportsNeedsUpdateBySampleId(sampleId, reason);
  } catch (e) {
    logger.warn('markReportStale failed', { sampleId, error: e.message });
  }
};

const removeInvoiceItem = async (client, sampleId, testId) => {
  const inv = await client.query(
    `SELECT i.id, i.status FROM invoices i WHERE i.sample_id = $1 LIMIT 1`,
    [sampleId]
  );
  if (!inv.rows[0]) return;
  const invoice = inv.rows[0];
  if (LOCKED_INVOICE_STATUSES.includes(invoice.status)) return;

  await client.query(
    `DELETE FROM invoice_items WHERE invoice_id = $1 AND test_id = $2`,
    [invoice.id, testId]
  );

  await client.query(
    `UPDATE invoices SET
       subtotal = sub.subtotal,
       tax_amount = (sub.subtotal - COALESCE(discount_amount, 0)) * (tax_rate / 100.0),
       total = (sub.subtotal - COALESCE(discount_amount, 0)) * (1 + tax_rate / 100.0),
       pdf_url = NULL,
       updated_at = NOW()
     FROM (
       SELECT COALESCE(SUM(total_price), 0) AS subtotal
       FROM invoice_items WHERE invoice_id = $1
     ) sub
     WHERE invoices.id = $1`,
    [invoice.id]
  );
};

/**
 * Remove a test from a sample (before execution).
 * Only allowed when: status=pending, no results, no validated results, report not locked.
 */
const removeTest = async (sampleId, sampleTestId, userId, { role } = {}) => {
  const st = await fetchSampleTest(sampleId, sampleTestId);

  if (st.has_results) {
    throw new AppError(
      'لا يمكن إزالة فحص يحتوي نتائج. استخدم "إلغاء" بدلاً من ذلك.',
      400, 'HAS_RESULTS'
    );
  }
  if (st.status !== 'pending') {
    throw new AppError(
      'لا يمكن إزالة فحص بعد بدء التنفيذ. استخدم "إلغاء" بدلاً من ذلك.',
      400, 'NOT_PENDING'
    );
  }

  await assertNoBlockingReport(sampleId);

  const client = await getClient();
  try {
    await client.query('BEGIN');

    await client.query(
      `DELETE FROM results WHERE sample_test_id = $1`,
      [sampleTestId]
    );
    await client.query(
      `DELETE FROM sample_tests WHERE id = $1`,
      [sampleTestId]
    );

    await removeInvoiceItem(client, sampleId, st.test_id);

    await logAudit(client, {
      userId, action: 'remove_sample_test', sampleId, sampleTestId,
      reason: 'Removed before execution',
      oldValues: { test_code: st.test_code, test_name: st.test_name, status: st.status },
      newValues: { removed: true },
    });

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await markReportStale(sampleId);
  return { removed: true, test_code: st.test_code };
};

/**
 * Cancel a test (after execution / has results).
 * Sets status = 'cancelled'. Does NOT delete results.
 */
const cancelTest = async (sampleId, sampleTestId, userId, { reason } = {}) => {
  const st = await fetchSampleTest(sampleId, sampleTestId);

  if (st.status === 'cancelled') {
    throw new AppError('الفحص ملغى بالفعل', 400, 'ALREADY_CANCELLED');
  }

  await assertNoBlockingReport(sampleId);

  const oldStatus = st.status;
  await query(
    `UPDATE sample_tests SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
    [sampleTestId]
  );

  await logAudit(null, {
    userId, action: 'cancel_sample_test', sampleId, sampleTestId,
    reason: reason || 'Cancelled by user',
    oldValues: { test_code: st.test_code, status: oldStatus, has_results: st.has_results },
    newValues: { status: 'cancelled' },
  });

  await markReportStale(sampleId);
  return { cancelled: true, test_code: st.test_code };
};

/**
 * Reactivate a cancelled test — admin/manager only.
 */
const reactivateTest = async (sampleId, sampleTestId, userId) => {
  const st = await fetchSampleTest(sampleId, sampleTestId);

  if (st.status !== 'cancelled') {
    throw new AppError('فقط الفحوصات الملغاة يمكن إعادة تفعيلها', 400, 'NOT_CANCELLED');
  }

  await query(
    `UPDATE sample_tests SET status = 'pending', updated_at = NOW() WHERE id = $1`,
    [sampleTestId]
  );

  await logAudit(null, {
    userId, action: 'reactivate_sample_test', sampleId, sampleTestId,
    reason: 'Reactivated by admin/manager',
    oldValues: { test_code: st.test_code, status: 'cancelled', has_results: st.has_results },
    newValues: { status: 'pending' },
  });

  await markReportStale(sampleId);
  return { reactivated: true, test_code: st.test_code, has_existing_results: st.has_results };
};

/**
 * Get audit history for a sample test.
 */
const getTestHistory = async (sampleTestId) => {
  const result = await query(
    `SELECT al.*, u.full_name AS user_name
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE al.entity_type = 'sample_test' AND al.entity_id = $1
     ORDER BY al.created_at DESC
     LIMIT 50`,
    [sampleTestId]
  );
  return result.rows;
};

/**
 * Add one or more tests to an existing sample.
 * Creates a supplemental invoice for the new tests only.
 * Blocked while any report for the sample is approved (must reopen first).
 */
const addTests = async (sampleId, testIds, userId) => {
  if (!env.features?.addTestToSample) {
    throw new AppError('Add test to sample is disabled', 403, 'FEATURE_DISABLED');
  }

  const ids = [...new Set((testIds || []).map(String).filter(Boolean))];
  if (!ids.length) {
    throw new AppError('اختر فحصاً واحداً على الأقل', 400, 'NO_TESTS');
  }

  const sampleResult = await query(
    `SELECT id, sample_code, customer_id, animal_id, status
     FROM samples WHERE id = $1`,
    [sampleId]
  );
  const sample = sampleResult.rows[0];
  if (!sample) throw new AppError('Sample not found', 404, 'NOT_FOUND');
  if (!sample.customer_id || !sample.animal_id) {
    throw new AppError('العينة بلا عميل أو حيوان', 400, 'SAMPLE_INCOMPLETE');
  }

  // Always block when approved — even if lockApprovedReports is off.
  const approved = await query(
    `SELECT id, report_number FROM reports
     WHERE sample_id = $1
       AND (
         lab_specialist_approved_by IS NOT NULL
         OR vet_approved_by IS NOT NULL
         OR is_final = true
       )
     ORDER BY created_at DESC LIMIT 1`,
    [sampleId]
  );
  if (approved.rows[0]) {
    throw new AppError(
      'التقرير معتمد — ألغِ الاعتماد أولاً ثم أضف الفحص',
      403,
      'REPORT_APPROVED'
    );
  }
  await assertSampleNotReportLocked(sampleId);

  const testsResult = await query(
    `SELECT id, code, name, name_ar, price, is_active
     FROM tests WHERE id = ANY($1::uuid[])`,
    [ids]
  );
  if (testsResult.rows.length !== ids.length) {
    throw new AppError('فحص غير موجود', 404, 'TEST_NOT_FOUND');
  }
  const inactive = testsResult.rows.filter((t) => t.is_active === false);
  if (inactive.length) {
    throw new AppError('لا يمكن إضافة فحص غير نشط', 400, 'TEST_INACTIVE');
  }

  const existing = await query(
    `SELECT st.test_id, st.status, t.code AS test_code
     FROM sample_tests st
     JOIN tests t ON t.id = st.test_id
     WHERE st.sample_id = $1 AND st.test_id = ANY($2::uuid[])`,
    [sampleId, ids]
  );
  const blocking = existing.rows.filter((r) => r.status !== 'cancelled');
  if (blocking.length) {
    throw new AppError(
      `الفحص موجود مسبقاً على العينة: ${blocking.map((b) => b.test_code).join(', ')}`,
      409,
      'TEST_ALREADY_ON_SAMPLE'
    );
  }

  const cancelledIds = new Set(existing.rows.filter((r) => r.status === 'cancelled').map((r) => r.test_id));
  const toInsert = testsResult.rows.filter((t) => !cancelledIds.has(t.id));
  const toReactivate = testsResult.rows.filter((t) => cancelledIds.has(t.id));

  const client = await getClient();
  const addedSampleTests = [];
  try {
    await client.query('BEGIN');

    for (const t of toReactivate) {
      const upd = await client.query(
        `UPDATE sample_tests SET status = 'pending', price = $1, updated_at = NOW()
         WHERE sample_id = $2 AND test_id = $3 AND status = 'cancelled'
         RETURNING id, test_id, price, status`,
        [t.price || 0, sampleId, t.id]
      );
      if (upd.rows[0]) {
        addedSampleTests.push({ ...upd.rows[0], test_code: t.code, reactivated: true });
        await logAudit(client, {
          userId,
          action: 'add_sample_test_reactivate',
          sampleId,
          sampleTestId: upd.rows[0].id,
          reason: 'Reactivated cancelled test via add',
          oldValues: { test_code: t.code, status: 'cancelled' },
          newValues: { status: 'pending', price: t.price || 0 },
        });
      }
    }

    for (const t of toInsert) {
      const ins = await client.query(
        `INSERT INTO sample_tests (id, sample_id, test_id, price, status)
         VALUES ($1, $2, $3, $4, 'pending')
         RETURNING id, test_id, price, status`,
        [uuidv4(), sampleId, t.id, t.price || 0]
      );
      addedSampleTests.push({ ...ins.rows[0], test_code: t.code, reactivated: false });
      await logAudit(client, {
        userId,
        action: 'add_sample_test',
        sampleId,
        sampleTestId: ins.rows[0].id,
        reason: 'Added test to existing sample',
        oldValues: {},
        newValues: { test_code: t.code, price: t.price || 0, status: 'pending' },
      });
    }

    await client.query(
      `UPDATE samples SET
         status = CASE WHEN status IN ('completed', 'reported') THEN 'running' ELSE status END,
         updated_at = NOW()
       WHERE id = $1`,
      [sampleId]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const invoiceItems = testsResult.rows.map((t) => ({
    test_id: t.id,
    description: t.name_ar || t.name || t.code,
    quantity: 1,
    unit_price: parseFloat(t.price) || 0,
    animal_id: sample.animal_id,
  }));

  let supplementalInvoice = null;
  try {
    supplementalInvoice = await billing.createInvoice(
      {
        customer_id: sample.customer_id,
        sample_id: sampleId,
        items: invoiceItems,
        notes: `فاتورة تكميلية — إضافة فحص على العينة ${sample.sample_code || sampleId}`,
      },
      userId
    );
  } catch (err) {
    logger.error('Supplemental invoice failed after addTests', {
      sampleId,
      error: err.message,
      added: addedSampleTests.map((a) => a.test_code),
    });
    throw new AppError(
      err.message || 'تمت إضافة الفحص لكن فشل إنشاء الفاتورة التكميلية',
      err.statusCode || 502,
      err.code || 'SUPPLEMENTAL_INVOICE_FAILED'
    );
  }

  await markReportStale(sampleId, 'SAMPLE');

  return {
    added: addedSampleTests,
    supplemental_invoice: {
      id: supplementalInvoice.id,
      invoice_number: supplementalInvoice.invoice_number,
      total: supplementalInvoice.total,
      status: supplementalInvoice.status,
    },
  };
};

/**
 * Check for duplicate tests within a sample.
 */
const checkDuplicateTests = async (sampleId) => {
  const result = await query(
    `SELECT st.test_id, t.name AS test_name, t.name_ar AS test_name_ar, t.code AS test_code,
            COUNT(*) AS count,
            array_agg(json_build_object(
              'id', st.id, 'status', st.status,
              'has_results', EXISTS (SELECT 1 FROM results r WHERE r.sample_test_id = st.id),
              'has_validated', EXISTS (SELECT 1 FROM results r WHERE r.sample_test_id = st.id AND r.is_validated = true),
              'created_at', st.created_at
            ) ORDER BY st.created_at) AS entries
     FROM sample_tests st
     JOIN tests t ON st.test_id = t.id
     WHERE st.sample_id = $1
     GROUP BY st.test_id, t.name, t.name_ar, t.code
     HAVING COUNT(*) > 1`,
    [sampleId]
  );
  return result.rows;
};

module.exports = {
  removeTest,
  cancelTest,
  reactivateTest,
  addTests,
  getTestHistory,
  checkDuplicateTests,
};
