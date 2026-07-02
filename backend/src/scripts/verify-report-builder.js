/**
 * Dynamic Report Builder — unit verification (no DB required).
 * Usage: node src/scripts/verify-report-builder.js
 */
const assert = require('assert');
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

console.log('\n=== Dynamic Report Builder — Phase 4 ===\n');

check('CBC only — single hematology section', () => {
  const sections = builder.buildReportSections({
    orderedTests: ordered({ code: 'CBC-FULL', cat: 'CBC' }),
    results: [cbcResult(), cbcResult({ code: 'RBC', value: '7' })],
    attachments: [],
    language: 'ar',
  });
  assert.strictEqual(sections.length, 1);
  assert.strictEqual(sections[0].sectionType, 'hematology');
});

check('Chemistry only — single chemistry section', () => {
  const sections = builder.buildReportSections({
    orderedTests: ordered({ code: 'CHEM-17', cat: 'CHEM' }),
    results: [chemResult()],
    attachments: [],
    language: 'en',
  });
  assert.strictEqual(sections.length, 1);
  assert.strictEqual(sections[0].sectionType, 'chemistry');
});

check('CBC + Chemistry — two sections in order', () => {
  const sections = builder.buildReportSections({
    orderedTests: ordered(
      { code: 'CBC-FULL', cat: 'CBC' },
      { code: 'CHEM-17', cat: 'CHEM' }
    ),
    results: [cbcResult(), chemResult()],
    attachments: [],
    language: 'ar',
  });
  assert.strictEqual(sections.length, 2);
  assert.strictEqual(sections[0].sectionType, 'hematology');
  assert.strictEqual(sections[1].sectionType, 'chemistry');
});

check('Full panel — only sections with results appear', () => {
  const sections = builder.buildReportSections({
    orderedTests: ordered(
      { code: 'CBC-FULL', cat: 'CBC' },
      { code: 'CHEM-17', cat: 'CHEM' },
      { code: 'PARAS-BLOOD', cat: 'PARAS' },
      { code: 'PARAS-STOOL', cat: 'PARAS' },
      { code: 'HORM-5', cat: 'HORM' }
    ),
    results: [
      cbcResult(),
      chemResult(),
      {
        testCode: 'PARAS-BLOOD',
        categoryCode: 'PARAS',
        code: 'PARAS',
        value: 'Negative',
        unit: 'qual',
        flag: 'NEG',
      },
    ],
    attachments: [],
    language: 'ar',
  });
  const types = sections.map((s) => s.sectionType);
  assert.ok(types.includes('hematology'));
  assert.ok(types.includes('chemistry'));
  assert.ok(types.includes('blood_parasites'));
  assert.ok(!types.includes('fecal'));
  assert.ok(!types.includes('hormones'));
});

check('Parasite images — microscopy section when include_in_report=true', () => {
  const sections = builder.buildReportSections({
    orderedTests: ordered({ code: 'PARAS-STOOL', cat: 'PARAS' }),
    results: [],
    attachments: [
      { file_url: '/uploads/a.jpg', include_in_report: true, caption: 'Egg' },
    ],
    language: 'ar',
  });
  assert.strictEqual(sections.length, 1);
  assert.strictEqual(sections[0].sectionType, 'microscopy');
  assert.strictEqual(sections[0].attachments.length, 1);
});

check('include_in_report=false — image excluded from sections', () => {
  const sections = builder.buildReportSections({
    orderedTests: ordered({ code: 'PARAS-STOOL', cat: 'PARAS' }),
    results: [],
    attachments: [
      { file_url: '/uploads/hidden.jpg', include_in_report: false },
      { file_url: '/uploads/show.jpg', include_in_report: true },
    ],
    language: 'ar',
  });
  assert.strictEqual(sections.length, 1);
  assert.strictEqual(sections[0].attachments.length, 1);
  assert.strictEqual(sections[0].attachments[0].file_url, '/uploads/show.jpg');
});

check('No empty sections', () => {
  const sections = builder.buildReportSections({
    orderedTests: ordered(
      { code: 'CBC-FULL', cat: 'CBC' },
      { code: 'CHEM-17', cat: 'CHEM' }
    ),
    results: [cbcResult()],
    attachments: [],
    language: 'ar',
  });
  for (const s of sections) {
    assert.strictEqual(builder.shouldShowSection(s, {}), true);
    assert.ok(
      s.results.some((r) => String(r.value).trim() !== '') || s.attachments?.length
    );
  }
});

check('Section order is stable (hematology before chemistry before images)', () => {
  const sections = builder.buildReportSections({
    orderedTests: ordered(
      { code: 'CHEM-17', cat: 'CHEM' },
      { code: 'CBC-FULL', cat: 'CBC' }
    ),
    results: [cbcResult(), chemResult()],
    attachments: [{ file_url: '/uploads/x.jpg', include_in_report: true }],
    language: 'ar',
  });
  const orders = sections.map((s) => s.sortOrder);
  assert.deepStrictEqual(orders, [...orders].sort((a, b) => a - b));
  assert.strictEqual(sections[0].sectionType, 'hematology');
  assert.strictEqual(sections[sections.length - 1].sectionType, 'microscopy');
});

check('Chemistry not shown when not ordered and no results', () => {
  const sections = builder.buildReportSections({
    orderedTests: ordered({ code: 'CBC-FULL', cat: 'CBC' }),
    results: [cbcResult()],
    attachments: [],
    language: 'ar',
  }, { allowOrphanResults: false });
  assert.ok(!sections.some((s) => s.sectionType === 'chemistry'));
});

check('groupResultsBySection groups by category', () => {
  const grouped = builder.groupResultsBySection([cbcResult(), chemResult()], { language: 'ar' });
  assert.strictEqual(grouped.length, 2);
  assert.strictEqual(grouped[0].sectionType, 'hematology');
});

check('buildApprovalSection shape', () => {
  const approval = builder.buildApprovalSection({
    labApproval: { approved: true, name: 'Lab Tech', license: 'L-1' },
    vetApproval: { approved: false },
  });
  assert.strictEqual(approval.lab.approved, true);
  assert.strictEqual(approval.vet.approved, false);
});

check('shouldShowSection rejects empty section', () => {
  const empty = { sectionType: 'chemistry', results: [], attachments: [] };
  assert.strictEqual(builder.shouldShowSection(empty, {}), false);
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed ? 1 : 0);
