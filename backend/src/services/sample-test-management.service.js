const { query, getClient } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../config/logger');
const { uuidv4 } = require('../utils/uuid');

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
  const rep = await query(
    `SELECT id FROM reports
     WHERE sample_id = $1
       AND (is_final = true OR lab_specialist_approved_by IS NOT NULL OR vet_approved_by IS NOT NULL)`,
    [sampleId]
  );
  if (rep.rows.length) {
    throw new AppError(
      'لا يمكن تعديل فحص بعد اعتماد التقرير. يمكن إصدار نسخة محدثة فقط.',
      403, 'REPORT_LOCKED'
    );
  }
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
  getTestHistory,
  checkDuplicateTests,
};
