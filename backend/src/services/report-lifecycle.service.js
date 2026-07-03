/**
 * Smart Report Lifecycle — tracks whether the official PDF matches current source data.
 * Gated by SMART_REPORT_LIFECYCLE_ENABLED (default off).
 */
const env = require('../config/env');
const logger = require('../config/logger');
const {
  UPDATE_REASONS,
  reasonText,
  detectStaleSources,
  isFeatureEnabled,
} = require('./report-lifecycle.utils');

const query = (...args) => require('../config/database').query(...args);

const isEnabled = () => isFeatureEnabled(env.features?.smartReportLifecycle);

const fetchSourceTimestamps = async (reportId) => {
  const result = await query(
    `SELECT
       r.id,
       r.sample_id,
       r.created_at,
       r.last_generated_at,
       r.version,
       r.needs_update,
       r.update_reason,
       r.lab_specialist_approved_at,
       r.vet_approved_at,
       s.updated_at AS sample_updated_at,
       s.created_at AS sample_created_at,
       a.updated_at AS animal_updated_at,
       a.created_at AS animal_created_at,
       c.updated_at AS customer_updated_at,
       c.created_at AS customer_created_at,
       (SELECT MAX(res.updated_at)
        FROM results res
        JOIN sample_tests st ON st.id = res.sample_test_id
        WHERE st.sample_id = r.sample_id) AS results_updated_at,
       (SELECT MAX(res.validated_at)
        FROM results res
        JOIN sample_tests st ON st.id = res.sample_test_id
        WHERE st.sample_id = r.sample_id) AS validation_at,
       (SELECT MAX(ra.created_at)
        FROM result_attachments ra
        JOIN results res ON res.id = ra.result_id
        JOIN sample_tests st ON st.id = res.sample_test_id
        WHERE st.sample_id = r.sample_id) AS attachments_at,
       (SELECT MAX(trr.updated_at)
        FROM test_reference_ranges trr
        JOIN test_parameters tp ON tp.id = trr.parameter_id
        JOIN result_values rv ON rv.parameter_id = tp.id
        JOIN results res ON res.id = rv.result_id
        JOIN sample_tests st ON st.id = res.sample_test_id
        WHERE st.sample_id = r.sample_id) AS reference_at
     FROM reports r
     JOIN samples s ON s.id = r.sample_id
     JOIN animals a ON a.id = s.animal_id
     JOIN customers c ON c.id = s.customer_id
     WHERE r.id = $1`,
    [reportId]
  );

  const row = result.rows[0];
  if (!row) return null;

  const approvalAt = [row.lab_specialist_approved_at, row.vet_approved_at]
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;

  return {
    report: row,
    sources: {
      resultsUpdatedAt: row.results_updated_at,
      validationAt: row.validation_at,
      sampleUpdatedAt: row.sample_updated_at || row.sample_created_at,
      animalUpdatedAt: row.animal_updated_at || row.animal_created_at,
      customerUpdatedAt: row.customer_updated_at || row.customer_created_at,
      attachmentsAt: row.attachments_at,
      approvalAt,
      referenceAt: row.reference_at,
    },
  };
};

const computeMaxSourceTimestamp = async (reportId) => {
  const data = await fetchSourceTimestamps(reportId);
  if (!data) return null;

  const { toMillis } = require('./report-lifecycle.utils');
  const values = Object.values(data.sources).filter(Boolean);
  if (!values.length) return data.report.last_generated_at || data.report.created_at;

  return values.sort((a, b) => toMillis(b) - toMillis(a))[0];
};

const computeReportNeedsUpdate = async (reportId) => {
  if (!isEnabled()) {
    return { needsUpdate: false, reason: null, reasonAr: null, reasons: [] };
  }

  const data = await fetchSourceTimestamps(reportId);
  if (!data) {
    return { needsUpdate: false, reason: null, reasonAr: null, reasons: [] };
  }

  const lastGeneratedAt = data.report.last_generated_at || data.report.created_at;
  const stale = detectStaleSources(data.sources, lastGeneratedAt);

  if (!stale.length) {
    return { needsUpdate: false, reason: null, reasonAr: null, reasons: [] };
  }

  const primary = stale[0];
  return {
    needsUpdate: true,
    reason: primary.reason.en,
    reasonAr: primary.reason.ar,
    reasons: stale.map((s) => s.reason.en),
    staleKeys: stale.map((s) => s.key),
  };
};

const markReportNeedsUpdate = async (reportId, reasonKey = 'RESULTS') => {
  if (!isEnabled() || !reportId) return;
  const reason = reasonText(reasonKey, 'ar') || reasonKey;
  try {
    await query(
      `UPDATE reports
       SET needs_update = true,
           update_reason = COALESCE($2, update_reason)
       WHERE id = $1`,
      [reportId, reason]
    );
  } catch (err) {
    logger.warn('markReportNeedsUpdate failed', { reportId, error: err.message });
  }
};

const markReportsNeedsUpdateBySampleId = async (sampleId, reasonKey = 'RESULTS') => {
  if (!isEnabled() || !sampleId) return;
  const reason = reasonText(reasonKey, 'ar') || reasonKey;
  try {
    await query(
      `UPDATE reports
       SET needs_update = true,
           update_reason = COALESCE($2, update_reason)
       WHERE sample_id = $1`,
      [sampleId, reason]
    );
  } catch (err) {
    logger.warn('markReportsNeedsUpdateBySampleId failed', { sampleId, error: err.message });
  }
};

const markReportsNeedsUpdateByParameterId = async (parameterId, reasonKey = 'REFERENCE') => {
  if (!isEnabled() || !parameterId) return;
  const reason = reasonText(reasonKey, 'ar') || reasonKey;
  try {
    await query(
      `UPDATE reports r
       SET needs_update = true,
           update_reason = COALESCE($2, update_reason)
       WHERE EXISTS (
         SELECT 1
         FROM sample_tests st
         JOIN results res ON res.sample_test_id = st.id
         JOIN result_values rv ON rv.result_id = res.id
         WHERE st.sample_id = r.sample_id AND rv.parameter_id = $1
       )`,
      [parameterId, reason]
    );
  } catch (err) {
    logger.warn('markReportsNeedsUpdateByParameterId failed', { parameterId, error: err.message });
  }
};

const markReportsNeedsUpdateByCustomerId = async (customerId, reasonKey = 'CUSTOMER') => {
  if (!isEnabled() || !customerId) return;
  const reason = reasonText(reasonKey, 'ar') || reasonKey;
  try {
    await query(
      `UPDATE reports r
       SET needs_update = true,
           update_reason = COALESCE($2, update_reason)
       FROM samples s
       WHERE r.sample_id = s.id AND s.customer_id = $1`,
      [customerId, reason]
    );
  } catch (err) {
    logger.warn('markReportsNeedsUpdateByCustomerId failed', { customerId, error: err.message });
  }
};

const markReportsNeedsUpdateByAnimalId = async (animalId, reasonKey = 'ANIMAL') => {
  if (!isEnabled() || !animalId) return;
  const reason = reasonText(reasonKey, 'ar') || reasonKey;
  try {
    await query(
      `UPDATE reports r
       SET needs_update = true,
           update_reason = COALESCE($2, update_reason)
       FROM samples s
       WHERE r.sample_id = s.id AND s.animal_id = $1`,
      [animalId, reason]
    );
  } catch (err) {
    logger.warn('markReportsNeedsUpdateByAnimalId failed', { animalId, error: err.message });
  }
};

const syncNeedsUpdateFlag = async (reportId) => {
  if (!isEnabled()) return;
  const computed = await computeReportNeedsUpdate(reportId);
  await query(
    `UPDATE reports
     SET needs_update = $2,
         update_reason = CASE WHEN $2 THEN COALESCE($3, update_reason) ELSE NULL END
     WHERE id = $1`,
    [reportId, computed.needsUpdate, computed.reasonAr || computed.reason]
  );
};

const getReportLifecycleStatus = async (reportRow, language = 'ar') => {
  if (!isEnabled()) {
    return { enabled: false };
  }

  const reportId = reportRow?.id || reportRow;
  let report;
  if (typeof reportRow === 'object' && reportRow.sample_id && reportRow.version != null) {
    report = reportRow;
  } else {
    const fetched = await fetchSourceTimestamps(reportId);
    if (!fetched) return { enabled: true, isUpToDate: true, needsUpdate: false };
    report = fetched.report;
  }

  const computed = await computeReportNeedsUpdate(report.id);
  const needsUpdate = computed.needsUpdate || report.needs_update === true;

  if (computed.needsUpdate !== report.needs_update) {
    await syncNeedsUpdateFlag(report.id).catch(() => {});
  }

  const reason = needsUpdate
    ? (language === 'en' ? computed.reason : (computed.reasonAr || computed.reason || report.update_reason))
    : null;

  return {
    enabled: true,
    isUpToDate: !needsUpdate,
    needsUpdate,
    reason,
    reasonEn: computed.reason,
    reasonAr: computed.reasonAr || report.update_reason,
    version: report.version || 1,
    lastGeneratedAt: report.last_generated_at || report.created_at,
    lastSourceUpdatedAt: report.last_source_updated_at,
  };
};

const recordOfficialGeneration = async (reportId, { incrementVersion = true } = {}) => {
  if (!isEnabled()) return;
  const sourceTs = await computeMaxSourceTimestamp(reportId);
  const versionSql = incrementVersion
    ? 'version = COALESCE(version, 1) + 1'
    : 'version = COALESCE(version, 1)';

  await query(
    `UPDATE reports
     SET ${versionSql},
         last_generated_at = NOW(),
         last_source_updated_at = $2,
         needs_update = false,
         update_reason = NULL
     WHERE id = $1`,
    [reportId, sourceTs]
  );
};

const recordInitialGeneration = async (reportId) => {
  if (!isEnabled()) return;
  await query(
    `UPDATE reports
     SET version = COALESCE(version, 1),
         last_generated_at = COALESCE(last_generated_at, NOW()),
         last_source_updated_at = COALESCE(last_source_updated_at, NOW()),
         needs_update = false,
         update_reason = NULL
     WHERE id = $1`,
    [reportId]
  );
};

module.exports = {
  UPDATE_REASONS,
  isEnabled,
  reasonText,
  detectStaleSources,
  computeReportNeedsUpdate,
  computeMaxSourceTimestamp,
  getReportLifecycleStatus,
  markReportNeedsUpdate,
  markReportsNeedsUpdateBySampleId,
  markReportsNeedsUpdateByParameterId,
  markReportsNeedsUpdateByCustomerId,
  markReportsNeedsUpdateByAnimalId,
  recordOfficialGeneration,
  recordInitialGeneration,
};
