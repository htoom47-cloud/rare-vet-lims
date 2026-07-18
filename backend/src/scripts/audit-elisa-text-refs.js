#!/usr/bin/env node
/**
 * Readonly audit: ELISA SP-RATIO / RESULT parameters missing text_reference.
 * Usage: node src/scripts/audit-elisa-text-refs.js
 */
require('dotenv').config();
const { query, pool } = require('../config/database');

(async () => {
  try {
    const params = await query(`
      SELECT tp.id AS parameter_id, tp.code AS parameter_code, tp.name, tp.unit,
             t.code AS test_code, t.name AS test_name, t.name_ar AS test_name_ar,
             tc.code AS category_code
      FROM test_parameters tp
      JOIN tests t ON t.id = tp.test_id
      LEFT JOIN test_categories tc ON tc.id = t.category_id
      WHERE tp.is_active = true
        AND t.is_active = true
        AND (
          tc.code = 'ELISA'
          OR t.code ILIKE '%ELISA%'
          OR t.name ILIKE '%ELISA%'
        )
        AND UPPER(tp.code) = 'SP-RATIO'
      ORDER BY t.code, tp.sort_order, tp.code
    `);

    const ranges = await query(`
      SELECT trr.parameter_id, trr.animal_type, trr.min_value, trr.max_value,
             trr.text_reference, trr.is_active
      FROM test_reference_ranges trr
      WHERE (trr.is_active IS NULL OR trr.is_active = true)
    `);

    const byParam = new Map();
    for (const r of ranges.rows) {
      if (!byParam.has(r.parameter_id)) byParam.set(r.parameter_id, []);
      byParam.get(r.parameter_id).push(r);
    }

    console.log('\n=== ELISA text reference coverage ===\n');
    console.log(`Parameters checked: ${params.rows.length}\n`);

    let withText = 0;
    let missingText = 0;

    for (const p of params.rows) {
      const list = byParam.get(p.parameter_id) || [];
      const textOnes = list.filter((r) => r.text_reference && String(r.text_reference).trim());
      if (textOnes.length) {
        withText += 1;
        const species = textOnes.map((r) => r.animal_type).join(', ');
        console.log(`  ✓ ${p.test_code} / ${p.parameter_code} — text_reference for: ${species}`);
      } else {
        missingText += 1;
        const speciesHint = list.length
          ? `ranges exist (${list.map((r) => r.animal_type).join(', ')}) but no text_reference`
          : 'no active ranges';
        console.log(`  ✗ ${p.test_code} / ${p.parameter_code} — ${speciesHint}`);
      }
    }

    console.log(`\nSummary: ${withText} with text, ${missingText} missing text (SP-RATIO only)`);
    if (missingText) {
      console.log('Fix: npm run ensure:elisa-refs:apply  OR add via القيم المرجعية UI.\n');
    }
    process.exit(0);
  } catch (err) {
    console.error('Audit failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end().catch(() => {});
  }
})();
