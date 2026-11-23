/**
 * Ensure SEMEN category + camel semen analysis parameters (gated by SEMEN_ANALYSIS_ENABLED).
 * Usage: node src/scripts/ensure-semen.js
 *
 * Additive only — does not modify urine/CBC/culture catalogs.
 */
const env = require('../config/env');
const { normalizeEntryOptions } = require('../utils/entry-options');

const COLOUR = [
  'Milky white',
  'Grayish',
  'Milky white to grayish',
  'Yellowish',
  'Watery',
];
const VISCOSITY = [
  'Viscous / Spinnbarkeit',
  'Viscous',
  'Slightly viscous',
  'Watery',
];
const ABSENT_SCALE = ['Absent', 'Present', 'Few', 'Moderate', 'Many'];
const IMPRESSION = [
  'Satisfactory / Good',
  'Sub-standard / Needs Re-evaluation',
];

const SEMEN_TEST = {
  code: 'SEMEN-CAMEL',
  name: 'Camel Semen Analysis',
  name_ar: 'تحليل السائل المنوي — إبل',
  price: 150,
  method: 'Physical / Microscopic',
  turnaround_hours: 24,
};

/** section → stored on test_parameters.category */
const SEMEN_PARAMS = [
  {
    code: 'VOLUME',
    name: 'Volume',
    name_ar: 'الحجم',
    section: 'physical',
    unit: 'mL',
    value_type: 'numeric',
    options: [],
    text_reference: '2.0–15.0 mL (avg ≈ 5–8 mL)',
  },
  {
    code: 'COLOUR',
    name: 'Colour',
    name_ar: 'اللون',
    section: 'physical',
    options: COLOUR,
    text_reference: 'Milky white to grayish',
  },
  {
    code: 'VISCOSITY',
    name: 'Viscosity',
    name_ar: 'اللزوجة',
    section: 'physical',
    options: VISCOSITY,
    text_reference: 'Viscous / Spinnbarkeit',
  },
  {
    code: 'PH',
    name: 'pH',
    name_ar: 'رقم الحموضة',
    section: 'physical',
    unit: '',
    value_type: 'numeric',
    options: [],
    text_reference: '7.2–7.8 (slightly alkaline)',
  },
  {
    code: 'MOTILITY_TOTAL',
    name: 'Total Motility',
    name_ar: 'الحركة الكلية',
    section: 'microscopic',
    unit: '%',
    value_type: 'numeric',
    options: [],
    text_reference: '≥60%–80%',
  },
  {
    code: 'MOTILITY_PROG',
    name: 'Progressive Motility',
    name_ar: 'الحركة التقدمية الأمامية',
    section: 'microscopic',
    unit: '%',
    value_type: 'numeric',
    options: [],
    text_reference: '>50%–70% forward (fresh liquefied)',
  },
  {
    code: 'CONCENTRATION',
    name: 'Concentration',
    name_ar: 'التركيز',
    section: 'microscopic',
    unit: '×10⁶/mL',
    value_type: 'numeric',
    options: [],
    text_reference: '200–600 million/mL',
  },
  {
    code: 'VIABILITY',
    name: 'Viability / Live Sperm',
    name_ar: 'الحيوية',
    section: 'microscopic',
    unit: '%',
    value_type: 'numeric',
    options: [],
    text_reference: '≥70% (Eosin-Nigrosin)',
  },
  {
    code: 'ABNORMALITIES',
    name: 'Total Abnormalities',
    name_ar: 'إجمالي التشوهات',
    section: 'microscopic',
    unit: '%',
    value_type: 'numeric',
    options: [],
    text_reference: '≤20%–25%',
  },
  {
    code: 'WBC',
    name: 'WBCs / Pus cells',
    name_ar: 'خلايا الدم البيضاء',
    section: 'other_cells',
    options: ABSENT_SCALE,
    text_reference: 'Absent / Few',
  },
  {
    code: 'RBC',
    name: 'RBCs',
    name_ar: 'خلايا الدم الحمراء',
    section: 'other_cells',
    options: ABSENT_SCALE,
    text_reference: 'Absent',
  },
  {
    code: 'OTHER_CELLS',
    name: 'Other cells / Debris',
    name_ar: 'خلايا طلائية / شوائب أخرى',
    section: 'other_cells',
    options: ABSENT_SCALE,
    text_reference: 'Absent / Minimal',
  },
  {
    code: 'IMPRESSION',
    name: 'Impression & Evaluation',
    name_ar: 'التقييم والقرار النهائي',
    section: 'impression',
    options: IMPRESSION,
    text_reference: '',
  },
  {
    code: 'VET_NOTES',
    name: "Veterinarian's notes",
    name_ar: 'ملاحظات الطبيب البيطري',
    section: 'impression',
    options: [],
    text_reference: '',
  },
];

async function ensureSemenCategory(query) {
  const existing = await query(`SELECT id FROM test_categories WHERE code = 'SEMEN'`);
  if (existing.rows[0]) {
    await query(
      `UPDATE test_categories
       SET name = 'Semen Analysis', name_ar = 'تحليل السائل المنوي', department = 'Lab',
           is_active = true, sort_order = COALESCE(sort_order, 88)
       WHERE id = $1`,
      [existing.rows[0].id]
    );
    return existing.rows[0].id;
  }
  const inserted = await query(
    `INSERT INTO test_categories (code, name, name_ar, department, sort_order, is_active)
     VALUES ('SEMEN', 'Semen Analysis', 'تحليل السائل المنوي', 'Lab', 88, true)
     RETURNING id`
  );
  return inserted.rows[0].id;
}

async function ensureCamelTextReference(query, parameterId, textReference) {
  const ref = String(textReference || '').trim();
  if (!ref) return;
  const existing = await query(
    `SELECT id FROM test_reference_ranges
     WHERE parameter_id = $1 AND animal_type = 'camel'
       AND (is_active IS NULL OR is_active = true)
     ORDER BY updated_at DESC NULLS LAST
     LIMIT 1`,
    [parameterId]
  );
  if (existing.rows[0]) return;
  await query(
    `INSERT INTO test_reference_ranges
       (parameter_id, animal_type, min_value, max_value, critical_low, critical_high,
        unit, notes, text_reference, is_active)
     VALUES ($1, 'camel', NULL, NULL, NULL, NULL, NULL, $2, $3, true)`,
    [parameterId, 'Camel semen template (edit in LIMS Admin)', ref]
  );
}

async function seedSemenParameters(query, testId) {
  for (let i = 0; i < SEMEN_PARAMS.length; i += 1) {
    const param = SEMEN_PARAMS[i];
    const options = normalizeEntryOptions(param.options);
    const valueType = param.value_type || 'text';
    const unit = param.unit || '';
    const existing = await query(
      'SELECT id FROM test_parameters WHERE test_id = $1 AND code = $2',
      [testId, param.code]
    );
    let paramId = existing.rows[0]?.id;
    if (!paramId) {
      const inserted = await query(
        `INSERT INTO test_parameters
           (test_id, code, name, name_ar, unit, sort_order, value_type, category, entry_options, show_in_report, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, true, true)
         RETURNING id`,
        [
          testId,
          param.code,
          param.name,
          param.name_ar,
          unit,
          i,
          valueType,
          param.section,
          options ? JSON.stringify(options) : null,
        ]
      );
      paramId = inserted.rows[0].id;
    } else {
      await query(
        `UPDATE test_parameters
         SET sort_order = $1, name = $2, name_ar = $3, value_type = $4, category = $5,
             unit = $6,
             entry_options = COALESCE(entry_options, $7::jsonb),
             show_in_report = true, is_active = true
         WHERE id = $8`,
        [
          i,
          param.name,
          param.name_ar,
          valueType,
          param.section,
          unit,
          options ? JSON.stringify(options) : null,
          paramId,
        ]
      );
    }
    await ensureCamelTextReference(query, paramId, param.text_reference);
  }
}

async function ensureSemenCatalog() {
  const logger = require('../config/logger');
  if (!env.features?.semenAnalysis) {
    logger.info('Semen analysis catalog skipped (SEMEN_ANALYSIS_ENABLED is not true)');
    return { skipped: true };
  }
  const { query } = require('../config/database');
  const categoryId = await ensureSemenCategory(query);
  const testResult = await query(
    `INSERT INTO tests (code, name, name_ar, category_id, price, method, turnaround_hours, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true)
     ON CONFLICT (code) DO UPDATE SET
       name = EXCLUDED.name,
       name_ar = EXCLUDED.name_ar,
       category_id = EXCLUDED.category_id,
       price = EXCLUDED.price,
       method = EXCLUDED.method,
       turnaround_hours = EXCLUDED.turnaround_hours,
       is_active = true
     RETURNING id`,
    [
      SEMEN_TEST.code,
      SEMEN_TEST.name,
      SEMEN_TEST.name_ar,
      categoryId,
      SEMEN_TEST.price,
      SEMEN_TEST.method,
      SEMEN_TEST.turnaround_hours,
    ]
  );
  await seedSemenParameters(query, testResult.rows[0].id);
  logger.info('Camel semen analysis catalog ensured under SEMEN category');
  return { skipped: false, testId: testResult.rows[0].id };
}

if (require.main === module) {
  require('dotenv').config();
  const { pool } = require('../config/database');
  const logger = require('../config/logger');
  ensureSemenCatalog()
    .then(() => pool.end())
    .catch((err) => {
      logger.error('ensure-semen failed', { error: err.message });
      process.exit(1);
    });
}

module.exports = { ensureSemenCatalog, SEMEN_PARAMS, SEMEN_TEST };
