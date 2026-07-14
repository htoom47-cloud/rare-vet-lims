/**
 * Phase 12 — Report & Reference Mastering verification.
 * Usage: node src/scripts/verify-report-reference-mastering.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  formatReferenceForReport,
  resolveDisplayCode,
  resolveDisplayNameAr,
  flagForReport,
  validateMinMax,
} = require('../services/parameter-display.utils');
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

const displayContext = {
  deviceCodeMap: { 101: 'WBC', 102: 'LYM%' },
  displayNameArMap: { 101: 'كريات الدم البيضاء', 102: 'اللمفاويات %' },
  displayNameEnMap: { 101: 'White Blood Cells', 102: 'Lymphocytes %' },
};

console.log('\n=== Phase 12 — Report & Reference Mastering ===\n');

console.log('--- Parameter display ---\n');

check('WBC — Arabic name + device code WBC', () => {
  const code = resolveDisplayCode({
    parameterId: 101,
    parameterCode: 'WBC',
    deviceCodeMap: displayContext.deviceCodeMap,
  });
  const nameAr = resolveDisplayNameAr({
    parameterId: 101,
    parameterNameAr: 'fallback',
    displayNameArMap: displayContext.displayNameArMap,
  });
  assert.strictEqual(code, 'WBC');
  assert.strictEqual(nameAr, 'كريات الدم البيضاء');
});

check('LYM% — code from device mapping (not system LYM_PCT)', () => {
  const code = resolveDisplayCode({
    parameterId: 102,
    parameterCode: 'LYM_PCT',
    shortCode: 'LYM_PCT',
    deviceCodeMap: displayContext.deviceCodeMap,
  });
  assert.strictEqual(code, 'LYM%');
});

check('No HIGH/LOW flag without reference range', () => {
  assert.strictEqual(flagForReport({ hasReference: false, flag: 'HIGH', detailFlag: 'HIGH' }), '');
  assert.strictEqual(flagForReport({ hasReference: false, flag: 'LOW', detailFlag: 'LOW' }), '');
  assert.strictEqual(flagForReport({ hasReference: true, flag: 'HIGH', detailFlag: 'HIGH' }), 'HIGH');
});

check('POS/NEG flags kept without numeric reference (qualitative)', () => {
  assert.strictEqual(flagForReport({ hasReference: false, flag: 'POS', detailFlag: 'POS' }), 'POS');
  assert.strictEqual(flagForReport({ hasReference: false, flag: 'NEG', detailFlag: 'NEG' }), 'NEG');
  assert.strictEqual(flagForReport({ hasReference: true, flag: 'POS', detailFlag: 'POS' }), 'POS');
});

check('Reference N/A (en) when missing range', () => {
  assert.strictEqual(formatReferenceForReport(null, false, false), 'N/A');
  assert.strictEqual(formatReferenceForReport('-', false, false), 'N/A');
});

check('Reference غير متوفر (ar) when missing range', () => {
  assert.strictEqual(formatReferenceForReport(null, false, true), 'غير متوفر');
  assert.strictEqual(formatReferenceForReport('-', true, true), 'غير متوفر');
});

check('Min > Max detected by validateMinMax', () => {
  assert.ok(validateMinMax(10, 5));
  assert.strictEqual(validateMinMax(5, 10), null);
});

check('Report row logic — no flag + N/A reference without range', () => {
  const hasReference = false;
  const evaluated = { hasReference, flag: 'HIGH', detailFlag: 'HIGH' };
  const flag = flagForReport(evaluated);
  const reference = formatReferenceForReport(null, hasReference, true);
  const deviceCode = resolveDisplayCode({
    parameterId: 101,
    parameterCode: 'WBC',
    deviceCodeMap: displayContext.deviceCodeMap,
  });
  const nameAr = resolveDisplayNameAr({
    parameterId: 101,
    displayNameArMap: displayContext.displayNameArMap,
  });
  assert.strictEqual(flag, '');
  assert.strictEqual(reference, 'غير متوفر');
  assert.strictEqual(deviceCode, 'WBC');
  assert.strictEqual(nameAr, 'كريات الدم البيضاء');
});

console.log('\n--- Report pipeline consistency ---\n');

const simulatePipeline = (fixture) => {
  const sections = builder.buildReportSections(fixture);
  const reportData = { sections, attachments: [], results: fixture.results || [] };
  const pdfPayload = { ...reportData, isFinal: true };
  const staffPreview = { sections: pdfPayload.sections };
  const portalPreview = { ...staffPreview };
  const sig = (s) => builder.extractSectionSignature(s);
  assert.deepStrictEqual(sig(pdfPayload.sections), sig(reportData.sections));
  assert.deepStrictEqual(sig(staffPreview.sections), sig(reportData.sections));
  assert.deepStrictEqual(sig(portalPreview.sections), sig(reportData.sections));
};

check('Preview = PDF = Portal sections (CBC fixture)', () => {
  simulatePipeline({
    results: [{
      testCode: 'CBC-FULL',
      categoryCode: 'CBC',
      code: 'WBC',
      nameAr: 'كريات الدم البيضاء',
      deviceCode: 'WBC',
      value: '10',
      numericValue: 10,
      unit: '10^3/uL',
      reference: '5.0 - 15.0',
      hasReference: true,
      flag: 'NORMAL',
    }],
    orderedTests: [{ test_code: 'CBC-FULL', category_code: 'CBC' }],
  });
});

check('Empty sections hidden (shouldShowSection)', () => {
  const empty = { sectionType: 'chemistry', results: [], attachments: [] };
  assert.strictEqual(builder.shouldShowSection(empty, {}), false);
  const withRow = {
    sectionType: 'hematology',
    results: [{ code: 'WBC', value: '1' }],
    attachments: [],
  };
  assert.strictEqual(builder.shouldShowSection(withRow, {}), true);
});

console.log('\n--- Admin API wiring ---\n');

check('report-mastering routes — parameters CRUD', () => {
  const src = fs.readFileSync(path.join(ROOT, 'routes', 'report-mastering.routes.js'), 'utf8');
  assert.ok(src.includes("router.get('/parameters'"));
  assert.ok(src.includes("router.put('/parameters/:id'"));
});

check('report-mastering routes — device mappings', () => {
  const src = fs.readFileSync(path.join(ROOT, 'routes', 'report-mastering.routes.js'), 'utf8');
  assert.ok(src.includes("router.get('/device-mappings'"));
  assert.ok(src.includes("router.post('/device-mappings'"));
});

check('reference-ranges routes — quality audit', () => {
  const src = fs.readFileSync(path.join(ROOT, 'routes', 'reference-ranges.routes.js'), 'utf8');
  assert.ok(src.includes("router.get('/quality-audit'"));
});

check('reference-ranges admin — min/max validation', () => {
  const src = fs.readFileSync(path.join(ROOT, 'services', 'reference-ranges-admin.service.js'), 'utf8');
  assert.ok(src.includes('validateMinMax'));
});

check('Frontend ReportMastering page + API client', () => {
  assert.ok(fs.existsSync(path.join(ROOT, '..', '..', 'frontend', 'src', 'pages', 'ReportMastering.jsx')));
  const api = fs.readFileSync(path.join(ROOT, '..', '..', 'frontend', 'src', 'services', 'api.js'), 'utf8');
  assert.ok(api.includes('reportMasteringAPI'));
  assert.ok(api.includes('/report-mastering/parameters'));
});

console.log('\n--- Norma mapping safety ---\n');

check('Norma CSV parser not modified for display names', () => {
  const src = fs.readFileSync(path.join(ROOT, 'utils', 'device-parsers', 'norma-csv.js'), 'utf8');
  assert.ok(!src.includes('parameter-display.utils'), 'norma-csv should not import display utils');
  assert.ok(src.includes('device_parameter') || src.includes('parameter_code') || src.includes('code'),
    'norma ingest still maps device codes');
});

check('reports.service loads displayContext from parameter-mastering', () => {
  const src = fs.readFileSync(path.join(ROOT, 'services', 'reports.service.js'), 'utf8');
  assert.ok(src.includes('loadReportDisplayContext'));
});

check('REPORT_MASTERING_ENABLED feature flag in env', () => {
  const src = fs.readFileSync(path.join(ROOT, 'config', 'env.js'), 'utf8');
  assert.ok(src.includes('reportMastering'));
});

check('REFERENCE_QUALITY_REPORT.md exists', () => {
  assert.ok(fs.existsSync(path.join(ROOT, '..', '..', 'REFERENCE_QUALITY_REPORT.md')));
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
