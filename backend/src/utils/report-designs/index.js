/**
 * Lab report design registry.
 * Design 1 = compact professional bilingual layout (saved Jun 2026).
 * Design 2 = legacy PDFKit premium layout.
 * Design 3 = VetConnect HTML/CSS — Puppeteer PDF.
 * Set REPORT_DESIGN=1|2|3 in env (default 1 — matches staff preview LaboratoryReport.jsx).
 */
const design1 = require('./design-1');
const design2 = require('./design-2');
const design3 = require('./design-3');

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
  2: {
    id: 2,
    name: 'Premium World-Class Medical Report',
    nameAr: 'تقرير طبي عالمي المستوى',
    referenceReport: null,
    gitCommit: null,
    pdf: design2,
    files: {
      pdf: 'backend/src/utils/report-designs/design-2.js',
      clinical: 'backend/src/utils/report-designs/design-2-clinical.js',
      sparkline: 'backend/src/utils/report-designs/design-2-sparkline.js',
    },
    traits: [
      'IDEXX-style premium header with logo, QR, barcode, report/sample cards',
      'Patient information card (owner, animal, dates)',
      'Zebra results table with abnormal row highlighting',
      'Clinical Summary auto-bullets + Clinical Interpretation',
      'Previous result comparison + sparkline trends',
      'Electronic signatures + lab seal',
      'Minimal footer with contact info only',
      'Brand watermark background',
    ],
  },
  3: {
    id: 3,
    name: 'VetConnect HTML Report (Design 3)',
    nameAr: 'تقرير VetConnect — HTML/CSS',
    referenceReport: null,
    gitCommit: null,
    pdf: design3,
    files: {
      pdf: 'backend/src/utils/report-designs/design-3/index.js',
      html: 'backend/src/utils/report-designs/design-3/build-html.js',
      styles: 'backend/src/utils/report-designs/design-3/styles.css',
      helpers: 'backend/src/utils/report-designs/design-3/helpers.js',
    },
    traits: [
      'HTML/CSS Grid + Flexbox layout (Puppeteer → PDF)',
      'Design system: 8px grid, typography scale, status colors',
      'Page 1: header, patient, overview, results table',
      'Page 2: clinical summary, interpretation, signatures, QR',
      'Full RTL/LTR — no overlap, no ellipsis, no fixed coordinates',
      'IDEXX VetConnect / Antech inspired modern lab report',
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
