#!/usr/bin/env node
/**
 * Phase 15 — Reference Range Simplification Verification
 *
 * Validates that LIMS (Admin Reference Ranges) is the sole source
 * for reference ranges, with no Device or Norma fallback.
 */
'use strict';

const path = require('path');
const fs = require('fs');

let passed = 0;
let failed = 0;
const results = [];

function assert(condition, label) {
  if (condition) {
    passed++;
    results.push({ status: 'PASS', label });
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    results.push({ status: 'FAIL', label });
    console.error(`  ❌ ${label}`);
  }
}

const ROOT = path.resolve(__dirname, '..', '..', '..');

// ── 1. Norma Reference Correction pages removed ────────────────────────
console.log('\n1. Frontend pages removed');
assert(
  !fs.existsSync(path.join(ROOT, 'frontend/src/pages/DeviceReferenceRanges.jsx')),
  'DeviceReferenceRanges.jsx deleted'
);
assert(
  !fs.existsSync(path.join(ROOT, 'frontend/src/pages/NormaRefDebug.jsx')),
  'NormaRefDebug.jsx deleted'
);

// ── 2. React routes removed ────────────────────────────────────────────
console.log('\n2. React routes cleaned');
const appJsx = fs.readFileSync(path.join(ROOT, 'frontend/src/App.jsx'), 'utf8');
assert(!appJsx.includes('DeviceReferenceRanges'), 'No DeviceReferenceRanges route in App.jsx');
assert(!appJsx.includes('NormaRefDebug'), 'No NormaRefDebug route in App.jsx');
assert(!appJsx.includes('device-reference-ranges'), 'No device-reference-ranges path in App.jsx');
assert(!appJsx.includes('norma-ref-debug'), 'No norma-ref-debug path in App.jsx');

// ── 3. Sidebar entries removed ─────────────────────────────────────────
console.log('\n3. Sidebar entries cleaned');
const sidebar = fs.readFileSync(path.join(ROOT, 'frontend/src/components/layout/Sidebar.jsx'), 'utf8');
assert(!sidebar.includes('device-reference-ranges'), 'No device-reference-ranges in Sidebar');
assert(!sidebar.includes('norma-ref-debug'), 'No norma-ref-debug in Sidebar');
assert(!sidebar.includes('deviceRefRanges'), 'No deviceRefRanges label in Sidebar');
assert(!sidebar.includes('normaRefDebug'), 'No normaRefDebug label in Sidebar');

// ── 4. Backend services removed ────────────────────────────────────────
console.log('\n4. Backend services cleaned');
assert(
  !fs.existsSync(path.join(ROOT, 'backend/src/services/device-reference-ranges.service.js')),
  'device-reference-ranges.service.js deleted'
);
assert(
  !fs.existsSync(path.join(ROOT, 'backend/src/services/norma-ref-debug.service.js')),
  'norma-ref-debug.service.js deleted'
);

// ── 5. Backend routes cleaned ──────────────────────────────────────────
console.log('\n5. Backend routes cleaned');
const devRoutes = fs.readFileSync(path.join(ROOT, 'backend/src/routes/devices.routes.js'), 'utf8');
assert(!devRoutes.includes('reference-ranges/list'), 'No reference-ranges/list route');
assert(!devRoutes.includes('reference-ranges/sync'), 'No reference-ranges/sync route');
assert(!devRoutes.includes('ref-debug'), 'No ref-debug routes');
assert(!devRoutes.includes('normaRefDebug'), 'No normaRefDebug in device routes');

// ── 6. Frontend API cleaned ────────────────────────────────────────────
console.log('\n6. Frontend API cleaned');
const apiJs = fs.readFileSync(path.join(ROOT, 'frontend/src/services/api.js'), 'utf8');
assert(!apiJs.includes('referenceRanges:'), 'No device referenceRanges API method');
assert(!apiJs.includes('refDebug'), 'No refDebug API methods');
assert(!apiJs.includes('deleteAllReferenceRanges'), 'No deleteAllReferenceRanges API');

// ── 7. Reference Range Engine — LIMS only ──────────────────────────────
console.log('\n7. Reference Range Engine — LIMS only source');
const engine = require('../services/reference-range-engine.service');
assert(engine.RANGE_SOURCES.LIMS_MANUAL === 'lims-manual', 'LIMS_MANUAL source exists');
assert(engine.RANGE_SOURCES.LIMS_SPECIES === 'lims-species', 'LIMS_SPECIES source exists');
assert(engine.RANGE_SOURCES.LIMS_GENERAL === 'lims-general', 'LIMS_GENERAL source exists');
assert(!engine.RANGE_SOURCES.DEVICE, 'No DEVICE source');

// ── 7b. Synced-from notes are NOT manual tier ───────────────────────────
console.log('\n7b. Synced-from notes excluded from manual tier');
assert(!engine.isManualLimsNotes('Synced from norma-profile'), 'Synced from is not manual');
assert(!engine.isManualLimsNotes('Norma: 5-15'), 'Norma notes are not manual');
assert(engine.isManualLimsNotes('Admin override note'), 'True manual notes detected');

// ── 8. No device fallback in engine ────────────────────────────────────
console.log('\n8. No device fallback');
const engineSrc = fs.readFileSync(
  path.join(ROOT, 'backend/src/services/reference-range-engine.service.js'), 'utf8'
);
assert(!engineSrc.includes('fetchDeviceRange'), 'No fetchDeviceRange function');
assert(!engineSrc.includes('device_reference_ranges'), 'No device_reference_ranges query');
assert(!engineSrc.includes('allowDeviceReferenceFallback'), 'No allowDeviceReferenceFallback check');
assert(!engineSrc.includes('normalizeDeviceRow'), 'No normalizeDeviceRow function');

// ── 9. No legacy Norma extraction ──────────────────────────────────────
console.log('\n9. No legacy Norma extraction');
assert(!engineSrc.includes('extractLegacyNormaReference'), 'No extractLegacyNormaReference');
assert(typeof engine.extractLegacyNormaReference === 'undefined', 'extractLegacyNormaReference not exported');

// ── 10. env.features — no allowDeviceReferenceFallback ──────────────────
console.log('\n10. Feature flag removed');
const envJs = fs.readFileSync(path.join(ROOT, 'backend/src/config/env.js'), 'utf8');
assert(!envJs.includes('allowDeviceReferenceFallback'), 'No allowDeviceReferenceFallback in env.js');
assert(!envJs.includes('ALLOW_DEVICE_REFERENCE_FALLBACK'), 'No ALLOW_DEVICE_REFERENCE_FALLBACK env var');

// ── 11. HIGH/LOW flags from LIMS only ──────────────────────────────────
console.log('\n11. HIGH/LOW flags — LIMS ranges only');
const flagResult = engine.evaluateResultFlag(20, { min_value: 5, max_value: 15 });
assert(flagResult.flag === 'HIGH' || flagResult.flag === 'H', 'Value above max → HIGH flag');
const flagLow = engine.evaluateResultFlag(2, { min_value: 5, max_value: 15 });
assert(flagLow.flag === 'LOW' || flagLow.flag === 'L', 'Value below min → LOW flag');
const flagNormal = engine.evaluateResultFlag(10, { min_value: 5, max_value: 15 });
assert(flagNormal.flag === '' || flagNormal.flag === 'NORMAL', 'Value in range → no flag');

// ── 12. N/A when no range exists ───────────────────────────────────────
console.log('\n12. N/A when no range exists');
const noRange = engine.evaluateResultFlag(10, null);
assert(noRange.flag === '', 'No range → empty flag');
assert(!noRange.isCritical, 'No range → not critical');
const noRangeDisplay = engine.formatReferenceRange(null);
assert(noRangeDisplay === null, 'formatReferenceRange(null) → null (report shows N/A)');

// ── 13. Device import no longer stores reference notes ─────────────────
console.log('\n13. Device import cleaned');
const importSrc = fs.readFileSync(
  path.join(ROOT, 'backend/src/services/device-import.service.js'), 'utf8'
);
assert(!importSrc.includes('normaReferenceNote'), 'No normaReferenceNote in device-import');
assert(!importSrc.includes('normaRefDebug'), 'No normaRefDebug in device-import');
assert(!importSrc.includes('from_norma: true'), 'No from_norma flag in device-import');
assert(!importSrc.includes('device_flag:'), 'No device_flag stored in device-import');

// ── 14. Reports — no Norma audit ───────────────────────────────────────
console.log('\n14. Reports cleaned');
const reportsSrc = fs.readFileSync(
  path.join(ROOT, 'backend/src/services/reports.service.js'), 'utf8'
);
assert(!reportsSrc.includes('normaRefDebug'), 'No normaRefDebug in reports');
assert(!reportsSrc.includes('norma-ref-debug'), 'No norma-ref-debug import in reports');
assert(!reportsSrc.includes('normaAnimalType'), 'No normaAnimalType in report data');

// ── 15. i18n translations cleaned ──────────────────────────────────────
console.log('\n15. i18n translations cleaned');
const i18n = fs.readFileSync(path.join(ROOT, 'frontend/src/i18n/index.js'), 'utf8');
assert(!i18n.includes("deviceRefRanges: '"), 'No deviceRefRanges nav label');
assert(!i18n.includes("normaRefDebug: '"), 'No normaRefDebug nav label');

// ── 16. Dead scripts removed ───────────────────────────────────────────
console.log('\n16. Dead scripts removed');
const deadScripts = [
  'sync-device-reference-ranges.js',
  'clear-device-reference-ranges.js',
  'verify-device-reference-ranges.js',
  'pull-norma-species-refs.js',
  'audit-norma-report-refs.js',
  'audit-norma-species-refs.js',
  'production-audit-norma-refs.js',
  'sync-norma-references.js',
  'apply-norma-hl7-refs.js',
  'verify-norma-ref-chain.js',
];
for (const script of deadScripts) {
  assert(
    !fs.existsSync(path.join(ROOT, 'backend/src/scripts', script)),
    `${script} deleted`
  );
}

// ── 17. Docs removed ──────────────────────────────────────────────────
console.log('\n17. Documentation cleaned');
assert(
  !fs.existsSync(path.join(ROOT, 'docs/norma-device-reference-ranges.md')),
  'norma-device-reference-ranges.md deleted'
);

// ── 18. Reference Range admin screen still exists ──────────────────────
console.log('\n18. Reference Ranges admin screen is sole manager');
assert(
  fs.existsSync(path.join(ROOT, 'frontend/src/pages/ReferenceRanges.jsx')),
  'ReferenceRanges.jsx exists'
);
assert(appJsx.includes('reference-ranges'), 'reference-ranges route in App.jsx');
assert(sidebar.includes('referenceRanges'), 'referenceRanges in Sidebar');

// ── 19. reference-range.js utility cleaned ─────────────────────────────
console.log('\n19. reference-range.js utility cleaned');
const refUtilSrc = fs.readFileSync(
  path.join(ROOT, 'backend/src/utils/reference-range.js'), 'utf8'
);
assert(!refUtilSrc.includes('normaReferenceNote'), 'No normaReferenceNote in reference-range.js');
assert(!refUtilSrc.includes('verbatimFromResultNotes'), 'No verbatimFromResultNotes');
assert(!refUtilSrc.includes('referenceFromResultNotes'), 'No referenceFromResultNotes');
assert(!refUtilSrc.includes('resolveNormaReferenceOnly'), 'No resolveNormaReferenceOnly');

// ── 20. cloud-start.js — no device ref sync ────────────────────────────
console.log('\n20. Cloud start cleaned');
const cloudStart = fs.readFileSync(
  path.join(ROOT, 'backend/src/scripts/cloud-start.js'), 'utf8'
);
assert(!cloudStart.includes('sync-device-reference-ranges'), 'No sync-device-reference-ranges in cloud-start');

// ── Summary ────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) {
  console.error('\n⚠️  Some assertions failed — review above.');
  process.exit(1);
} else {
  console.log('\n✅ All assertions passed — Reference Range Simplification verified.');
}
