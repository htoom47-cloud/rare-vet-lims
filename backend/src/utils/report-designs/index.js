/**
 * Lab report design registry.
 * Design 1 = compact professional bilingual layout (saved Jun 2026).
 * Set REPORT_DESIGN=1 (default) in env to select active PDF generator.
 */
const design1 = require('./design-1');

const DESIGNS = {
  1: {
    id: 1,
    name: 'Compact Professional Bilingual',
    nameAr: 'تقرير مضغوط احترافي ثنائي اللغة',
    referenceReport: 'RPT-260623-812322',
    gitCommit: '86870a4',
    pdf: design1,
    files: {
      pdf: 'backend/src/utils/report-designs/design-1.js',
      pdfRouter: 'backend/src/utils/pdf.js',
      htmlView: 'frontend/src/pages/LaboratoryReport.jsx',
      printStyles: 'frontend/src/utils/report-designs/design-1-print.js',
      screenStyles: 'frontend/src/index.css',
      printUtil: 'frontend/src/utils/labReportPrint.js',
      demoScript: 'backend/src/scripts/seed-demo-comprehensive-report.js',
      cursorRule: '.cursor/rules/report-design-1.mdc',
    },
    traits: [
      '2–3 A4 pages for full 10-test panel (43 rows + 2 microscope images)',
      'Y-based pagination (no Arabic raster page drift)',
      'Page footer: report number + Page N / Total',
      'Continuation header on page 2+',
      'Repeating results table header on new pages',
      'FINAL/PRELIM badge on title banner',
      'Brand brown/gold palette only for panel headers',
      'Flag symbols ↑ ↓ + − instead of long status text',
      'Patient info: 4 rows × 2 fields',
      'Microscope images: 2 columns, max 120px height',
      'Bilingual column headers (EN/AR)',
      'QR verification + confidentiality notice in footer',
    ],
  },
};

const getActiveDesignId = () => {
  const raw = process.env.REPORT_DESIGN || '1';
  const id = Number(raw);
  return DESIGNS[id] ? id : 1;
};

const getDesign = (id = getActiveDesignId()) => {
  const design = DESIGNS[Number(id)] || DESIGNS[1];
  if (!design) throw new Error(`Unknown report design: ${id}`);
  return design;
};

const generateReportPDF = (...args) => getDesign().pdf.generateReportPDF(...args);

module.exports = {
  DESIGNS,
  getDesign,
  getActiveDesignId,
  generateReportPDF,
};
