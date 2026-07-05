/**
 * Portal Sync — unified report view for staff preview, portal, and official PDF metadata.
 * All report content comes from reports.service getPreview → report-builder sections.
 */
const env = require('../config/env');
const { AppError } = require('../middleware/errorHandler');
const {
  flattenSectionResults,
  extractSectionSignature,
  buildReportSections,
  filterReportableAttachments,
} = require('./report-builder.service');
const { summarizeResults, flagSeverity } = require('../utils/portal-analytics');

const LIFECYCLE = {
  DRAFT: 'draft',
  RESULTS_ENTERED: 'results_entered',
  REVIEWED: 'reviewed',
  APPROVED: 'approved',
  PUBLISHED: 'published',
};

const resolveReportLifecycle = (reportRow, context = {}) => {
  const hasValidated = context.hasValidatedResults !== false;

  if (!reportRow) {
    return hasValidated ? LIFECYCLE.RESULTS_ENTERED : LIFECYCLE.DRAFT;
  }

  const published = reportRow.is_final !== false && Boolean(reportRow.pdf_url);
  if (published) return LIFECYCLE.PUBLISHED;

  const approved = Boolean(
    reportRow.lab_specialist_approved_by || reportRow.vet_approved_by
  );
  if (approved) return LIFECYCLE.APPROVED;

  if (hasValidated) return LIFECYCLE.REVIEWED;
  return LIFECYCLE.DRAFT;
};

const isPortalVisible = (lifecycle, reportRow = {}, options = {}) => {
  if (!reportRow?.pdf_url) return false;
  if (lifecycle === LIFECYCLE.DRAFT || lifecycle === LIFECYCLE.RESULTS_ENTERED) return false;

  const approved = Boolean(
    reportRow.lab_specialist_approved_by || reportRow.vet_approved_by
  );
  const published = reportRow.is_final === true;

  if (approved || published) return true;

  const showReviewed = options.showReviewed ?? env.portal?.showReviewed ?? false;
  if (lifecycle === LIFECYCLE.REVIEWED && showReviewed) return true;
  return false;
};

/** SQL fragment — portal-visible reports: PDF + explicit approval or is_final=true. */
const portalVisibilitySql = (reportAlias = 'r') => {
  const r = reportAlias;
  const approved = `(
    ${r}.pdf_url IS NOT NULL
    AND (
      ${r}.lab_specialist_approved_by IS NOT NULL
      OR ${r}.vet_approved_by IS NOT NULL
      OR ${r}.is_final = true
    )
  )`;

  if (!env.portal?.showReviewed) return approved;

  return `(
    ${approved}
    OR (
      ${r}.pdf_url IS NOT NULL
      AND ${r}.lab_specialist_approved_by IS NULL
      AND ${r}.vet_approved_by IS NULL
      AND ${r}.is_final IS NOT TRUE
      AND EXISTS (
        SELECT 1 FROM results res
        JOIN sample_tests st ON st.id = res.sample_test_id
        WHERE st.sample_id = ${r}.sample_id AND res.is_validated = true
      )
    )
  )`;
};

const buildReportFlags = (results = []) => {
  const abnormal = [];
  const critical = [];
  const positive = [];

  for (const row of results) {
    const sev = flagSeverity(row.flag);
    const entry = {
      code: row.code,
      nameEn: row.nameEn,
      nameAr: row.nameAr,
      flag: row.flag,
      value: row.value,
      isCritical: row.isCritical,
    };
    if (sev >= 3) critical.push(entry);
    else if (sev >= 2) abnormal.push(entry);
    else if (row.flag === 'POS') positive.push(entry);
  }

  return { abnormal, critical, positive };
};

const buildReportSummary = (preview = {}) => {
  const flat = preview.sections?.length
    ? flattenSectionResults(preview.sections)
    : (preview.results || []);
  return summarizeResults(flat);
};

/**
 * Attach lifecycle, summary, flags, and snake_case aliases — single shape for staff + portal.
 */
const buildUnifiedReportView = (preview = {}, reportRow = null, context = {}) => {
  const lifecycle = resolveReportLifecycle(reportRow, context);
  const flatResults = preview.sections?.length
    ? flattenSectionResults(preview.sections)
    : (preview.results || []);
  const summary = buildReportSummary(preview);
  const flags = buildReportFlags(flatResults);
  const pdfUrl = preview.pdfUrl || reportRow?.pdf_url || null;
  const reportNumber = preview.reportNumber || reportRow?.report_number || null;

  return {
    ...preview,
    reportNumber,
    pdfUrl,
    report_number: reportNumber,
    pdf_url: pdfUrl,
    lifecycle,
    reportStatus: lifecycle,
    portalVisible: isPortalVisible(lifecycle, reportRow, context),
    summary,
    flags,
    sections: preview.sections || [],
    attachments: preview.attachments || [],
    approvals: preview.approvals || preview.approvalSection || {},
    results: preview.results || flatResults,
    sectionSignature: extractSectionSignature(preview.sections || []),
  };
};

/** Strip internal fields for customer portal responses. */
const sanitizeForPortal = (unified = {}) => {
  const {
    sampleId,
    generatedBy,
    smartLifecycle,
    customer,
    ...rest
  } = unified;
  return {
    ...rest,
    customer: customer ? { name: customer.name } : customer,
  };
};

const assertPortalReportVisible = (unified) => {
  if (!unified?.portalVisible) {
    throw new AppError('Report not available', 404, 'NOT_FOUND');
  }
  return unified;
};

/** Test helper — build sections from fixture without DB. */
const buildSectionsFromFixture = (fixture) => buildReportSections({
  orderedTests: fixture.orderedTests || [],
  results: fixture.results || [],
  attachments: fixture.attachments || [],
  language: fixture.language || 'ar',
});

module.exports = {
  LIFECYCLE,
  resolveReportLifecycle,
  isPortalVisible,
  portalVisibilitySql,
  buildReportFlags,
  buildReportSummary,
  buildUnifiedReportView,
  sanitizeForPortal,
  assertPortalReportVisible,
  buildSectionsFromFixture,
  filterReportableAttachments,
  extractSectionSignature,
};
