/**
 * Dual report notes: Results Summary (ai_interpretation) + Treatment Recommendations.
 * Static checks — no DB required.
 * Usage: node src/scripts/verify-report-dual-notes.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const routesSrc = read('src/routes/reports.routes.js');
const serviceSrc = read('src/services/reports.service.js');
const samplesSrc = read('src/services/samples.service.js');
const design3Src = read('src/utils/report-designs/design-3/build-html.js');
const design1Src = read('src/utils/report-designs/design-1.js');
const reportsUiSrc = read('../frontend/src/pages/Reports.jsx');
const labReportSrc = read('../frontend/src/pages/LaboratoryReport.jsx');
const apiSrc = read('../frontend/src/services/api.js');
const i18nSrc = read('../frontend/src/i18n/index.js');

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

console.log('\n=== Report Dual Notes ===\n');

check('generate route accepts ai_interpretation', () => {
  assert.ok(/ai_interpretation:\s*req\.body\.ai_interpretation/.test(routesSrc));
  assert.ok(/treatment_recommendations:\s*req\.body\.treatment_recommendations/.test(routesSrc));
});

check('generate INSERT persists ai_interpretation (not hard-coded NULL)', () => {
  assert.ok(/aiInterpretation \|\| null/.test(serviceSrc));
  assert.ok(!/VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, \$7, NULL, \$8/.test(serviceSrc));
  assert.ok(/options\.ai_interpretation/.test(serviceSrc));
});

check('reuseExistingReportRow updates both note fields', () => {
  assert.ok(/notesPatch\.ai_interpretation/.test(serviceSrc));
  assert.ok(/notesPatch\.treatment_recommendations/.test(serviceSrc));
});

check('samples list exposes ai_interpretation for regenerate UI', () => {
  assert.ok(/rep\.ai_interpretation/.test(samplesSrc));
  assert.ok(/as ai_interpretation/.test(samplesSrc));
});

check('design-3 Results Summary section + renamed overview Arabic title', () => {
  assert.ok(design3Src.includes('buildResultsSummarySection'));
  assert.ok(design3Src.includes("'Results Summary', 'ملخص النتائج'"));
  assert.ok(design3Src.includes("reportData.aiInterpretation"));
  assert.ok(design3Src.includes("'Result Overview', 'نظرة عامة على النتائج'"));
  assert.ok(!design3Src.includes("'Result Overview', 'ملخص النتائج'"));
});

check('design-1 draws summary then treatment', () => {
  assert.ok(design1Src.includes("'Results Summary', 'ملخص النتائج'"));
  assert.ok(/drawNotes\(doc, reportData\.aiInterpretation, reportData\.treatmentRecommendations\)/.test(design1Src));
});

check('staff Reports UI has both textareas and sends both fields', () => {
  assert.ok(reportsUiSrc.includes('resultsSummary'));
  assert.ok(reportsUiSrc.includes('resultsSummarySection'));
  assert.ok(reportsUiSrc.includes('ai_interpretation: resultsSummary'));
  assert.ok(reportsUiSrc.includes('treatment_recommendations: treatment'));
});

check('LaboratoryReport edit notes saves both fields', () => {
  assert.ok(labReportSrc.includes('ai_interpretation: summaryValue'));
  assert.ok(labReportSrc.includes('treatment_recommendations: notesValue'));
  assert.ok(labReportSrc.includes('resultsSummarySection'));
});

check('API generate payload includes ai_interpretation', () => {
  assert.ok(apiSrc.includes('ai_interpretation: opts.ai_interpretation'));
});

check('i18n keys for results summary (ar + en)', () => {
  assert.ok(i18nSrc.includes('resultsSummarySection'));
  assert.ok(i18nSrc.includes('ملخص النتائج (الطبيب البيطري'));
  assert.ok(i18nSrc.includes('Results Summary (Veterinarian'));
  assert.ok(i18nSrc.includes('resultsSummaryPlaceholder'));
});

check('empty summary section omitted (trim guard in builder)', () => {
  const idx = design3Src.indexOf('const buildResultsSummarySection');
  const slice = design3Src.slice(idx, idx + 350);
  assert.ok(/if \(!body\) return ''/.test(slice));
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed ? 1 : 0);
