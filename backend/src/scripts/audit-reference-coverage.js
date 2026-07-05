#!/usr/bin/env node
/**
 * Audit: which test parameters × animal types lack min/max reference ranges.
 * Usage: node src/scripts/audit-reference-coverage.js
 */
require('dotenv').config();
const { query, pool } = require('../config/database');
const { ANIMAL_TYPE_CODES } = require('../constants/animal-types');
const { cbcReferenceDisplayCode } = require('../utils/cbc-reference-params');

const SPECIES = ANIMAL_TYPE_CODES.filter((t) => t !== 'other');

const TEXT_OR_QUAL_PARAMS = new Set([
  'NOTES', 'FINDINGS', 'GROWTH', 'RESULT', 'PCR-RES', 'TITER', 'SP-RATIO',
  'BABESIA', 'THEILERIA', 'TRYPANO', 'ANAPLASMA', 'EHRLICHIA', 'HAEMOPROTEUS', 'PLASMODIUM',
  'STRONGYLES', 'HAEMONCHUS', 'TRICHOSTRONG', 'ASCARIS', 'NEMATODE', 'TAPEWORM', 'MONIEZIA',
  'FASCIOLA', 'COCCIDIA', 'GIARDIA', 'CRYPTOSPOR', 'BALANTIDIUM',
]);

const isNumericParam = (p) => (
  p.unit !== 'qual'
  && !TEXT_OR_QUAL_PARAMS.has(p.code)
  && String(p.unit || '').trim() !== ''
);

(async () => {
  const tests = await query(`
    SELECT t.code AS test_code, t.name, t.name_ar
    FROM tests t WHERE t.is_active = true ORDER BY t.code
  `);

  const params = await query(`
    SELECT tp.id, tp.code, tp.name, tp.name_ar, tp.unit, t.code AS test_code
    FROM test_parameters tp
    JOIN tests t ON t.id = tp.test_id
    WHERE tp.is_active = true AND t.is_active = true
    ORDER BY t.code, tp.sort_order, tp.code
  `);

  const ranges = await query(`
    SELECT trr.parameter_id, trr.animal_type, trr.min_value, trr.max_value, trr.text_reference,
           tp.code AS parameter_code, t.code AS test_code
    FROM test_reference_ranges trr
    JOIN test_parameters tp ON tp.id = trr.parameter_id
    JOIN tests t ON t.id = tp.test_id
    WHERE (trr.is_active IS NULL OR trr.is_active = true)
  `);

  const rangeByKey = new Map();
  for (const r of ranges.rows) {
    rangeByKey.set(`${r.parameter_id}:${r.animal_type}`, r);
  }

  const gaps = [];
  let covered = 0;

  for (const p of params.rows) {
    for (const species of SPECIES) {
      const r = rangeByKey.get(`${p.id}:${species}`);
      const display = p.test_code === 'CBC-FULL' ? cbcReferenceDisplayCode(p.code) : p.code;
      if (!r || r.min_value == null || r.max_value == null) {
        gaps.push({
          test_code: p.test_code,
          parameter_code: p.code,
          parameter_display: display,
          parameter_name_ar: p.name_ar,
          animal_type: species,
          unit: p.unit,
          numeric: isNumericParam(p),
          issue: !r ? 'no_range' : (r.text_reference ? 'text_only' : 'missing_bounds'),
        });
      } else {
        covered += 1;
      }
    }
  }

  const numericGaps = gaps.filter((g) => g.numeric);
  const qualGaps = gaps.filter((g) => !g.numeric);
  const camelNumeric = numericGaps.filter((g) => g.animal_type === 'camel');

  console.log('\n=== Reference Range Coverage Audit ===\n');
  console.log(`Tests: ${tests.rows.length} | Parameters: ${params.rows.length}`);
  console.log(`Species: ${SPECIES.join(', ')}`);
  console.log(`Slots: ${params.rows.length * SPECIES.length} | With min+max: ${covered}`);
  console.log(`Gaps total: ${gaps.length} | Numeric: ${numericGaps.length} | Qual/text: ${qualGaps.length}`);

  console.log('\n--- By test (all species) ---');
  for (const t of tests.rows) {
    const tGaps = gaps.filter((g) => g.test_code === t.test_code);
    const tParams = params.rows.filter((p) => p.test_code === t.test_code).length;
    const expected = tParams * SPECIES.length;
    const ok = expected - tGaps.length;
    const num = tGaps.filter((g) => g.numeric).length;
    console.log(`${t.test_code}: ${ok}/${expected} OK | gaps=${tGaps.length} (numeric=${num})`);
  }

  console.log('\n=== إبل (camel) — معاملات رقمية بدون حد أدنى/أعلى ===\n');
  if (!camelNumeric.length) {
    console.log('لا يوجد — جميع المعاملات الرقمية لديها نطاق لإبل.');
  } else {
    console.table(camelNumeric.map((g) => ({
      الفحص: g.test_code,
      المعامل: g.parameter_display,
      الكود: g.parameter_code,
      الوحدة: g.unit,
    })));
  }

  console.log('\n=== Numeric gaps by test × species ===\n');
  const numByTest = {};
  for (const g of numericGaps) {
    numByTest[g.test_code] = numByTest[g.test_code] || {};
    numByTest[g.test_code][g.animal_type] = numByTest[g.test_code][g.animal_type] || [];
    numByTest[g.test_code][g.animal_type].push(g.parameter_display);
  }
  for (const [test, spMap] of Object.entries(numByTest).sort()) {
    console.log(`${test}:`);
    for (const sp of SPECIES) {
      const arr = spMap[sp];
      if (arr?.length) console.log(`  ${sp}: ${arr.join(', ')}`);
    }
  }

  console.log('\n=== CBC-FULL screen params × camel ===');
  const cbcCamelGaps = numericGaps.filter((g) => g.test_code === 'CBC-FULL' && g.animal_type === 'camel');
  if (!cbcCamelGaps.length) {
    console.log('✅ كل معاملات CBC (26) لديها min/max لإبل في قاعدة البيانات المحلية.');
  } else {
    console.table(cbcCamelGaps);
  }

  await pool.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
