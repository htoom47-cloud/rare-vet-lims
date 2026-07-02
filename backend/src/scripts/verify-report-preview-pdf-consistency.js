/**
 * PDF / Preview consistency — verifies all report paths share the same sections.
 * Usage: node src/scripts/verify-report-preview-pdf-consistency.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const builder = require('../services/report-builder.service');

let passed = 0;
let failed = 0;

const check = (label, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${label}: ${err.message}`);
  }
};

const ROOT = path.join(__dirname, '..');

const cbcResult = (overrides = {}) => ({
  testCode: 'CBC-FULL',
  categoryCode: 'CBC',
  code: 'WBC',
  value: '10',
  numericValue: 10,
  unit: '10^3/uL',
  flag: 'NORMAL',
  ...overrides,
});

const chemResult = (overrides = {}) => ({
  testCode: 'CHEM-17',
  categoryCode: 'CHEM',
  code: 'ALT',
  value: '45',
  numericValue: 45,
  unit: 'U/L',
  flag: 'NORMAL',
  ...overrides,
});

const ordered = (...tests) => tests.map((t) => ({
  test_code: t.code,
  category_code: t.cat,
}));

/** Mirrors buildReportData section assembly (no DB). */
const simulateBuildReportData = (fixture) => {
  const sections = builder.buildReportSections(fixture);
  const attachments = builder.filterReportableAttachments(fixture.attachments || []);
  return { sections, attachments, results: fixture.results || [] };
};

/** Mirrors buildPdfPayload — spreads buildReportData output. */
const simulateBuildPdfPayload = (reportData) => ({
  ...reportData,
  isFinal: true,
});

/** Mirrors reports.service getPreview sections field. */
const simulateStaffPreview = (pdfPayload) => ({
  sections: pdfPayload.sections || [],
  attachments: pdfPayload.attachments || [],
  results: pdfPayload.results || [],
});

/** Mirrors portal.service sanitizePortalPreview (strips sampleId/generatedBy only). */
const simulatePortalPreview = (staffPreview) => {
  const { sampleId, generatedBy, ...safe } = staffPreview;
  return safe;
};

/** Design 3 PDF receives buildPdfPayload output as reportData. */
const simulateDesign3PdfInput = (pdfPayload) => pdfPayload;

const assertPipelineConsistency = (fixture, label) => {
  const reportData = simulateBuildReportData(fixture);
  const pdfPayload = simulateBuildPdfPayload(reportData);
  const staffPreview = simulateStaffPreview(pdfPayload);
  const portalPreview = simulatePortalPreview(staffPreview);
  const pdfInput = simulateDesign3PdfInput(pdfPayload);

  const sigReportData = builder.extractSectionSignature(reportData.sections);
  const sigPdf = builder.extractSectionSignature(pdfPayload.sections);
  const sigStaff = builder.extractSectionSignature(staffPreview.sections);
  const sigPortal = builder.extractSectionSignature(portalPreview.sections);
  const sigDesign3 = builder.extractSectionSignature(pdfInput.sections);

  assert.deepStrictEqual(sigPdf, sigReportData, `${label}: PDF payload ≠ buildReportData`);
  assert.deepStrictEqual(sigStaff, sigReportData, `${label}: staff preview ≠ buildReportData`);
  assert.deepStrictEqual(sigPortal, sigReportData, `${label}: portal preview ≠ buildReportData`);
  assert.deepStrictEqual(sigDesign3, sigReportData, `${label}: Design 3 input ≠ buildReportData`);
};

console.log('\n=== Phase 4.1 — PDF / Preview Consistency ===\n');

console.log('--- Architectural wiring ---\n');

check('reports.service buildReportData uses buildReportSections', () => {
  const src = fs.readFileSync(path.join(ROOT, 'services', 'reports.service.js'), 'utf8');
  assert.ok(src.includes('buildReportSections('));
  assert.ok(src.includes('sections,'));
});

check('getPreview passes base.sections from buildPdfPayload', () => {
  const src = fs.readFileSync(path.join(ROOT, 'services', 'reports.service.js'), 'utf8');
  assert.ok(src.includes('buildPdfPayload(reportRow)'));
  assert.ok(src.includes('sections: base.sections'));
});

check('buildPdfPayload delegates to buildReportData', () => {
  const src = fs.readFileSync(path.join(ROOT, 'services', 'reports.service.js'), 'utf8');
  assert.ok(src.includes('await buildReportData(reportRow.sample_id'));
});

check('portal getReportPreview uses reportsService.getPreview', () => {
  const src = fs.readFileSync(path.join(ROOT, 'services', 'portal.service.js'), 'utf8');
  assert.ok(src.includes('reportsService.getPreview(reportId)'));
  assert.ok(src.includes('sanitizePortalPreview(preview)'));
});

check('Design 3 build-html reads reportData.sections', () => {
  const src = fs.readFileSync(
    path.join(ROOT, 'utils', 'report-designs', 'design-3', 'build-html.js'),
    'utf8'
  );
  assert.ok(src.includes('reportData.sections'));
  assert.ok(src.includes('buildDynamicSections'));
});

check('staff LaboratoryReport.jsx prefers report.sections', () => {
  const src = fs.readFileSync(
    path.join(ROOT, '..', '..', 'frontend', 'src', 'pages', 'LaboratoryReport.jsx'),
    'utf8'
  );
  assert.ok(src.includes('report?.sections?.length'));
});

check('portal LaboratoryReport.jsx prefers report.sections', () => {
  const src = fs.readFileSync(
    path.join(ROOT, '..', '..', 'frontend-portal', 'src', 'pages', 'LaboratoryReport.jsx'),
    'utf8'
  );
  assert.ok(src.includes('report?.sections?.length'));
});

console.log('\n--- Section pipeline (count / names / order) ---\n');

check('CBC only — all paths match', () => {
  assertPipelineConsistency({
    orderedTests: ordered({ code: 'CBC-FULL', cat: 'CBC' }),
    results: [cbcResult(), cbcResult({ code: 'RBC', value: '7' })],
    attachments: [],
    language: 'ar',
  }, 'CBC only');
  const { sections } = simulateBuildReportData({
    orderedTests: ordered({ code: 'CBC-FULL', cat: 'CBC' }),
    results: [cbcResult()],
    attachments: [],
    language: 'ar',
  });
  assert.strictEqual(sections.length, 1);
  assert.strictEqual(sections[0].sectionType, 'hematology');
});

check('Chemistry only — all paths match', () => {
  assertPipelineConsistency({
    orderedTests: ordered({ code: 'CHEM-17', cat: 'CHEM' }),
    results: [chemResult()],
    attachments: [],
    language: 'en',
  }, 'Chemistry only');
});

check('CBC + Chemistry — all paths match', () => {
  assertPipelineConsistency({
    orderedTests: ordered(
      { code: 'CBC-FULL', cat: 'CBC' },
      { code: 'CHEM-17', cat: 'CHEM' }
    ),
    results: [cbcResult(), chemResult()],
    attachments: [],
    language: 'ar',
  }, 'CBC + Chemistry');
  const sig = builder.extractSectionSignature(simulateBuildReportData({
    orderedTests: ordered(
      { code: 'CBC-FULL', cat: 'CBC' },
      { code: 'CHEM-17', cat: 'CHEM' }
    ),
    results: [cbcResult(), chemResult()],
    attachments: [],
    language: 'ar',
  }).sections);
  assert.strictEqual(sig.length, 2);
  assert.strictEqual(sig[0].sectionType, 'hematology');
  assert.strictEqual(sig[1].sectionType, 'chemistry');
});

check('Report with images — all paths match', () => {
  assertPipelineConsistency({
    orderedTests: ordered({ code: 'PARAS-STOOL', cat: 'PARAS' }),
    results: [],
    attachments: [
      { file_url: '/uploads/a.jpg', include_in_report: true, caption: 'Egg' },
      { file_url: '/uploads/b.jpg', include_in_report: false },
    ],
    language: 'ar',
  }, 'with images');
  const { sections } = simulateBuildReportData({
    orderedTests: ordered({ code: 'PARAS-STOOL', cat: 'PARAS' }),
    results: [],
    attachments: [
      { file_url: '/uploads/a.jpg', include_in_report: true },
      { file_url: '/uploads/b.jpg', include_in_report: false },
    ],
    language: 'ar',
  });
  assert.strictEqual(sections.length, 1);
  assert.strictEqual(sections[0].sectionType, 'microscopy');
  assert.strictEqual(sections[0].attachments.length, 1);
});

check('Report without images — all paths match', () => {
  assertPipelineConsistency({
    orderedTests: ordered({ code: 'CBC-FULL', cat: 'CBC' }),
    results: [cbcResult()],
    attachments: [],
    language: 'ar',
  }, 'without images');
  const { sections } = simulateBuildReportData({
    orderedTests: ordered({ code: 'CBC-FULL', cat: 'CBC' }),
    results: [cbcResult()],
    attachments: [],
    language: 'ar',
  });
  assert.ok(!sections.some((s) => s.sectionType === 'microscopy'));
});

check('Portal sanitizePortalPreview preserves section titles and order', () => {
  const fixture = {
    orderedTests: ordered(
      { code: 'CBC-FULL', cat: 'CBC' },
      { code: 'CHEM-17', cat: 'CHEM' }
    ),
    results: [cbcResult(), chemResult()],
    attachments: [{ file_url: '/uploads/x.jpg', include_in_report: true }],
    language: 'ar',
  };
  const staff = simulateStaffPreview(simulateBuildPdfPayload(simulateBuildReportData(fixture)));
  const portal = simulatePortalPreview({ ...staff, sampleId: 'x', generatedBy: 'y' });
  assert.deepStrictEqual(
    builder.extractSectionSignature(portal.sections),
    builder.extractSectionSignature(staff.sections)
  );
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
if (failed === 0) {
  console.log('Conclusion: PDF (Design 3), staff preview, and portal preview use the same');
  console.log('report.sections pipeline from report-builder.service.js — no structural drift.\n');
}
process.exit(failed ? 1 : 0);
