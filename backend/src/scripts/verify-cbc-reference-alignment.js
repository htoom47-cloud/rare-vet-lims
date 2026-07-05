#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  PCT_BY_ABS,
  isPercentLikeRange,
  isSyncedNotes,
  cbcReferenceDisplayCode,
  cbcPctFallbackAbsCode,
} = require('../utils/cbc-reference-params');

let passed = 0;
let failed = 0;

const check = (label, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`  ✅ ${label}`);
  } catch (err) {
    failed += 1;
    console.error(`  ❌ ${label}: ${err.message}`);
  }
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

check('synced notes detected', () => {
  assert.strictEqual(isSyncedNotes('Synced from norma-defaults'), true);
  assert.strictEqual(isSyncedNotes(''), false);
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed ? 1 : 0);
