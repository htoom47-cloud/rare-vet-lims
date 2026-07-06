/**
 * Active lab report PDF generator — delegates to report-designs registry.
 * Default: design 1 (compact bilingual) — same layout as LaboratoryReport.jsx preview.
 * Override with REPORT_DESIGN=1|2|3 env var.
 */
const registry = require('./report-designs');

module.exports = {
  generateReportPDF: registry.generateReportPDF,
  getActiveReportDesignId: registry.getActiveDesignId,
  getReportDesign: registry.getDesign,
};
