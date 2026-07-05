#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  PCT_BY_ABS,
  isPercentLikeRange,
  isSyncedNotes,
  cbcReferenceDisplayCode,
  cbcPctFallbackAbsCode,
  resolveCbcLimsRange,
} = require('../utils/cbc-reference-params');

let passed = 0;
let failed = 0;

const checks = [];

const check = (label, fn) => {
  checks.push({ label, fn });
};

console.log('\nCBC reference parameter alignment\n');

check('WBC diff abs → pct mapping', () => {
  assert.strictEqual(PCT_BY_ABS.LYM, 'LYM_PCT');
  assert.strictEqual(PCT_BY_ABS.NEU, 'NEU_PCT');
});

check('LYM 30-45 is percent-like (misplaced on LYM)', () => {
  assert.strictEqual(isPercentLikeRange(30, 45, ''), true);
});

check('LYM 1-8 is not percent-like (absolute count)', () => {
  assert.strictEqual(isPercentLikeRange(1, 8, '10³/µL'), false);
});

check('MON 2-8 is not flagged percent-like (small % — migrated by reconcile anyway)', () => {
  assert.strictEqual(isPercentLikeRange(2, 8, ''), false);
});

check('LYM_PCT displays as LYM%', () => {
  assert.strictEqual(cbcReferenceDisplayCode('LYM_PCT'), 'LYM%');
});

check('LYM abs displays as LYM', () => {
  assert.strictEqual(cbcReferenceDisplayCode('LYM'), 'LYM');
});

check('pct fallback abs code', () => {
  assert.strictEqual(cbcPctFallbackAbsCode('NEU_PCT'), 'NEU');
});

check('resolveCbcLimsRange prefers manual MON over synced MON_PCT', async () => {
  const paramIdByCode = { MON: 'abs-id', MON_PCT: 'pct-id' };
  const getRange = async (pid) => {
    if (pid === 'abs-id') return { min_value: 2, max_value: 8, notes: '' };
    if (pid === 'pct-id') return { min_value: 1, max_value: 12, notes: 'Synced from norma-defaults' };
    return null;
  };
  const range = await resolveCbcLimsRange('MON_PCT', 'pct-id', { animal_type: 'camel' }, paramIdByCode, getRange);
  assert.strictEqual(range.min_value, 2);
  assert.strictEqual(range.max_value, 8);
});

(async () => {
  for (const { label, fn } of checks) {
    try {
      await fn();
      passed += 1;
      console.log(`  ✅ ${label}`);
    } catch (err) {
      failed += 1;
      console.error(`  ❌ ${label}: ${err.message}`);
    }
  }
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed ? 1 : 0);
})();
