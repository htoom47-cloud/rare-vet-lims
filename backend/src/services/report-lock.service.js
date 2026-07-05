const env = require('../config/env');
const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { uuidv4 } = require('../utils/uuid');

const isReportApproved = (reportRow) => Boolean(
  reportRow?.lab_specialist_approved_by
  || reportRow?.vet_approved_by
  || reportRow?.is_final === true
);

const fetchApprovedReportForSample = async (sampleId) => {
  const result = await query(
    `SELECT id, report_number, lab_specialist_approved_by, vet_approved_by, is_final
     FROM reports
     WHERE sample_id = $1
       AND (
         lab_specialist_approved_by IS NOT NULL
         OR vet_approved_by IS NOT NULL
         OR is_final = true
       )
     ORDER BY created_at DESC
     LIMIT 1`,
    [sampleId]
  );
  return result.rows[0] || null;
};

const assertSampleNotReportLocked = async (sampleId) => {
  if (!env.features?.lockApprovedReports) return null;
  const report = await fetchApprovedReportForSample(sampleId);
  if (report) {
    throw new AppError(
      'Report is approved and locked — reopen the report first (admin/manager)',
      403,
      'REPORT_LOCKED'
    );
  }
  return null;
};

const MANAGER_ROLES = ['admin', 'manager'];

const assertManagerRole = (userRole) => {
  if (!MANAGER_ROLES.includes(userRole)) {
    throw new AppError('Admin or manager access required', 403, 'FORBIDDEN');
  }
};

const reopenReport = async (reportId, userId, userRole, auditCtx = {}) => {
  if (!env.features?.lockApprovedReports) {
    throw new AppError('Report lock feature is disabled', 400, 'FEATURE_DISABLED');
  }
  assertManagerRole(userRole);

  const existing = await query(
    `SELECT id, report_number, sample_id, lab_specialist_approved_by, vet_approved_by, is_final
     FROM reports WHERE id = $1`,
    [reportId]
  );
  const report = existing.rows[0];
  if (!report) throw new AppError('Report not found', 404, 'NOT_FOUND');
  if (!isReportApproved(report)) {
    throw new AppError('Report is not approved — nothing to reopen', 400, 'NOT_LOCKED');
  }

  await query(
    `UPDATE reports SET
       lab_specialist_approved_by = NULL,
       lab_specialist_approved_at = NULL,
       vet_approved_by = NULL,
       vet_approved_at = NULL,
       is_final = false,
       needs_update = true,
       update_reason = COALESCE(update_reason, 'REOPENED')
     WHERE id = $1`,
    [reportId]
  );

  await query(
    `INSERT INTO audit_logs (id, user_id, action, module, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
     VALUES ($1, $2, 'reopen_report', 'reports', 'report', $3, $4, $5, $6, $7)`,
    [
      uuidv4(),
      userId,
      reportId,
      JSON.stringify({
        lab_specialist_approved_by: report.lab_specialist_approved_by,
        vet_approved_by: report.vet_approved_by,
        is_final: report.is_final,
      }),
      JSON.stringify({ reopened: true, needs_update: true }),
      auditCtx.ip || null,
      auditCtx.userAgent || null,
    ]
  );

  return query('SELECT * FROM reports WHERE id = $1', [reportId]).then((r) => r.rows[0]);
};

module.exports = {
  isReportApproved,
  fetchApprovedReportForSample,
  assertSampleNotReportLocked,
  reopenReport,
  assertManagerRole,
};
