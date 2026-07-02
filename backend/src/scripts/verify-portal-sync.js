/**
 * Portal Sync — unit verification (no DB required).
 * Usage: node src/scripts/verify-portal-sync.js
 */
const assert = require('assert');
const portalSync = require('../services/portal-sync.service');
const reportBuilder = require('../services/report-builder.service');

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

const cbcResult = (overrides = {}) => ({
  testCode: 'CBC-FULL',
  categoryCode: 'CBC',
  code: 'WBC',
  value: '10',
  numericValue: 10,
  flag: 'NORMAL',
  ...overrides,
});

const chemResult = (overrides = {}) => ({
  testCode: 'CHEM-17',
  categoryCode: 'CHEM',
  code: 'ALT',
  value: '45',
  numericValue: 45,
  flag: 'NORMAL',
  ...overrides,
});

const ordered = (...tests) => tests.map((t) => ({
  test_code: t.code,
  category_code: t.cat,
}));

const buildPreviewFixture = (fixture, reportRow = null) => {
  const sections = portalSync.buildSectionsFromFixture(fixture);
  const attachments = portalSync.filterReportableAttachments(fixture.attachments || []);
  const preview = {
    reportNumber: 'RPT-TEST-001',
    pdfUrl: '/uploads/reports/test.pdf',
    results: fixture.results || [],
    sections,
    attachments,
    approvals: { lab: { approved: true }, vet: { approved: false } },
  };
  return portalSync.buildUnifiedReportView(preview, reportRow, { hasValidatedResults: true });
};

console.log('\n=== Portal Sync — Phase 6 ===\n');

check('Draft hidden from portal', () => {
  const lifecycle = portalSync.resolveReportLifecycle(null, { hasValidatedResults: false });
  assert.strictEqual(lifecycle, portalSync.LIFECYCLE.DRAFT);
  assert.strictEqual(portalSync.isPortalVisible(lifecycle), false);
});

check('Results Entered hidden from portal', () => {
  const lifecycle = portalSync.resolveReportLifecycle(null, { hasValidatedResults: true });
  assert.strictEqual(lifecycle, portalSync.LIFECYCLE.RESULTS_ENTERED);
  assert.strictEqual(portalSync.isPortalVisible(lifecycle), false);
});

check('Approved visible', () => {
  const row = { lab_specialist_approved_by: 'u1', pdf_url: null, is_final: false };
  const lifecycle = portalSync.resolveReportLifecycle(row, { hasValidatedResults: true });
  assert.strictEqual(lifecycle, portalSync.LIFECYCLE.APPROVED);
  assert.strictEqual(portalSync.isPortalVisible(lifecycle), true);
});

check('Published visible', () => {
  const row = { pdf_url: '/uploads/r.pdf', is_final: true };
  const lifecycle = portalSync.resolveReportLifecycle(row, { hasValidatedResults: true });
  assert.strictEqual(lifecycle, portalSync.LIFECYCLE.PUBLISHED);
  assert.strictEqual(portalSync.isPortalVisible(lifecycle), true);
});

check('Reviewed hidden unless PORTAL_SHOW_REVIEWED', () => {
  const row = { pdf_url: '/uploads/r.pdf', is_final: false };
  const lifecycle = portalSync.resolveReportLifecycle(row, { hasValidatedResults: true });
  assert.strictEqual(lifecycle, portalSync.LIFECYCLE.REVIEWED);
  assert.strictEqual(portalSync.isPortalVisible(lifecycle, { showReviewed: false }), false);
  assert.strictEqual(portalSync.isPortalVisible(lifecycle, { showReviewed: true }), true);
});

check('PDF url on unified view (pdf_url + pdfUrl)', () => {
  const unified = buildPreviewFixture({ results: [cbcResult()] }, { pdf_url: '/uploads/r.pdf', is_final: true });
  assert.strictEqual(unified.pdf_url, '/uploads/reports/test.pdf');
  assert.strictEqual(unified.pdfUrl, unified.pdf_url);
});

check('Staff and portal share same section signature after sanitize', () => {
  const fixture = {
    orderedTests: ordered({ code: 'CBC-FULL', cat: 'CBC' }, { code: 'CHEM-17', cat: 'CHEM' }),
    results: [cbcResult(), chemResult()],
    attachments: [],
    language: 'ar',
  };
  const staff = buildPreviewFixture(fixture, { pdf_url: '/x.pdf', is_final: true });
  const portal = portalSync.sanitizeForPortal(staff);
  assert.deepStrictEqual(portal.sectionSignature, staff.sectionSignature);
});

check('Images — include_in_report=true only', () => {
  const fixture = {
    orderedTests: ordered({ code: 'PARAS-STOOL', cat: 'PARAS' }),
    results: [],
    attachments: [
      { file_url: '/a.jpg', include_in_report: true },
      { file_url: '/b.jpg', include_in_report: false },
    ],
  };
  const unified = buildPreviewFixture(fixture, { pdf_url: '/x.pdf', is_final: true });
  assert.strictEqual(unified.attachments.length, 1);
  assert.strictEqual(unified.sections.length, 1);
  assert.strictEqual(unified.sections[0].sectionType, 'microscopy');
});

check('No images — no microscopy section', () => {
  const unified = buildPreviewFixture({
    orderedTests: ordered({ code: 'CBC-FULL', cat: 'CBC' }),
    results: [cbcResult()],
    attachments: [],
  }, { pdf_url: '/x.pdf', is_final: true });
  assert.ok(!unified.sections.some((s) => s.sectionType === 'microscopy'));
});

check('CBC only — no chemistry section', () => {
  const unified = buildPreviewFixture({
    orderedTests: ordered({ code: 'CBC-FULL', cat: 'CBC' }),
    results: [cbcResult()],
    attachments: [],
  }, { pdf_url: '/x.pdf', is_final: true });
  const types = unified.sections.map((s) => s.sectionType);
  assert.ok(types.includes('hematology'));
  assert.ok(!types.includes('chemistry'));
});

check('Chemistry only — no CBC section', () => {
  const unified = buildPreviewFixture({
    orderedTests: ordered({ code: 'CHEM-17', cat: 'CHEM' }),
    results: [chemResult()],
    attachments: [],
  }, { pdf_url: '/x.pdf', is_final: true });
  const types = unified.sections.map((s) => s.sectionType);
  assert.ok(types.includes('chemistry'));
  assert.ok(!types.includes('hematology'));
});

check('Full package — multiple non-empty sections', () => {
  const unified = buildPreviewFixture({
    orderedTests: ordered(
      { code: 'CBC-FULL', cat: 'CBC' },
      { code: 'CHEM-17', cat: 'CHEM' }
    ),
    results: [cbcResult(), chemResult()],
    attachments: [{ file_url: '/img.jpg', include_in_report: true }],
  }, { pdf_url: '/x.pdf', is_final: true });
  assert.strictEqual(unified.sections.length, 3);
  for (const s of unified.sections) {
    assert.ok(s.results?.length || s.attachments?.length);
  }
});

check('summary and flags built from sections', () => {
  const unified = buildPreviewFixture({
    orderedTests: ordered({ code: 'CBC-FULL', cat: 'CBC' }),
    results: [cbcResult({ flag: 'HIGH', value: '20' })],
    attachments: [],
  }, { pdf_url: '/x.pdf', is_final: true });
  assert.ok(unified.summary);
  assert.ok(unified.summary.total >= 1);
  assert.ok(unified.flags.abnormal.length >= 1);
});

check('assertPortalReportVisible blocks draft lifecycle', () => {
  const unified = portalSync.buildUnifiedReportView(
    { sections: [], results: [] },
    null,
    { hasValidatedResults: false }
  );
  assert.throws(() => portalSync.assertPortalReportVisible(unified), /not available/i);
});

check('Portal does not rebuild sections — uses report-builder output', () => {
  const fixture = {
    orderedTests: ordered({ code: 'CBC-FULL', cat: 'CBC' }),
    results: [cbcResult()],
    attachments: [],
  };
  const direct = reportBuilder.buildReportSections(fixture);
  const viaPortal = buildPreviewFixture(fixture, { pdf_url: '/x.pdf', is_final: true }).sections;
  assert.deepStrictEqual(
    reportBuilder.extractSectionSignature(viaPortal),
    reportBuilder.extractSectionSignature(direct)
  );
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed ? 1 : 0);
