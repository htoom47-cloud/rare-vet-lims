/**
 * Ensure URINE category + urinalysis test parameters with editable entry_options.
 * Usage: node src/scripts/ensure-urine.js
 */
const { ANIMAL_TYPE_CODES } = require('../constants/animal-types');
const { normalizeEntryOptions } = require('../utils/entry-options');

const DIPSTICK = ['Nil', '+', '++', '+++'];
const COLOUR = ['Pale Yellow', 'Yellow', 'Dark Yellow', 'Amber', 'Red', 'Brown', 'Cloudy'];
const PH = ['Acid', 'Alkaline'];
const ABSENT_SCALE = ['Absent', 'Present', 'Few', 'Moderate', 'Many'];

const URINE_TEST = {
  code: 'URINE-UA',
  name: 'Urinalysis',
  name_ar: 'تحليل البول',
  price: 100,
  method: 'Dipstick / Microscope',
  turnaround_hours: 24,
};

/** section → stored on test_parameters.category */
const URINE_PARAMS = [
  {
    code: 'COLOUR',
    name: 'Colour',
    name_ar: 'اللون',
    section: 'physical',
    options: COLOUR,
    text_reference: 'Pale Yellow',
  },
  {
    code: 'SG',
    name: 'Specific Gravity',
    name_ar: 'الكثافة النوعية',
    section: 'physical',
    options: [],
    text_reference: '1.005-1.030',
    value_type: 'numeric',
  },
  {
    code: 'PH',
    name: 'pH',
    name_ar: 'الأس الهيدروجيني',
    section: 'physical',
    options: PH,
    text_reference: 'Acid or Alkaline',
  },
  {
    code: 'PROTEIN',
    name: 'Protein',
    name_ar: 'البروتين',
    section: 'chemical',
    options: DIPSTICK,
    text_reference: 'Absent',
  },
  {
    code: 'SUGAR',
    name: 'Sugar',
    name_ar: 'السكر',
    section: 'chemical',
    options: DIPSTICK,
    text_reference: 'Absent',
  },
  {
    code: 'KETONE',
    name: 'Ketone',
    name_ar: 'الكيتون',
    section: 'chemical',
    options: DIPSTICK,
    text_reference: 'Absent',
  },
  {
    code: 'BILIRUBIN',
    name: 'Bilirubin',
    name_ar: 'البيليروبين',
    section: 'chemical',
    options: DIPSTICK,
    text_reference: 'Absent',
  },
  {
    code: 'NITRITE',
    name: 'Nitrite',
    name_ar: 'النيتريت',
    section: 'chemical',
    options: DIPSTICK,
    text_reference: 'Absent',
  },
  {
    code: 'RBC',
    name: 'R.B.C.',
    name_ar: 'كرات دم حمراء',
    section: 'microscopic',
    options: ['0-1 /HPF', '1-3 /HPF', '3-5 /HPF', 'Many'],
    text_reference: '0 - 1 /HPF',
  },
  {
    code: 'PUS',
    name: 'Pus Cells',
    name_ar: 'خلايا صديدية',
    section: 'microscopic',
    options: ['0-5 /HPF', '5-10 /HPF', '10-20 /HPF', 'Many'],
    text_reference: '0 – 5/ HPF',
  },
  {
    code: 'EPITHELIAL',
    name: 'Epithelial Cells',
    name_ar: 'خلايا طلائية',
    section: 'microscopic',
    options: ABSENT_SCALE,
    text_reference: 'Absent',
  },
  {
    code: 'CASTS',
    name: 'Casts',
    name_ar: 'الأسطوانات',
    section: 'microscopic',
    options: ABSENT_SCALE,
    text_reference: 'Absent',
  },
  {
    code: 'CRYSTALS',
    name: 'Crystals',
    name_ar: 'البلورات',
    section: 'microscopic',
    options: ABSENT_SCALE,
    text_reference: 'Absent',
  },
  {
    code: 'BACTERIA',
    name: 'Bacteria',
    name_ar: 'بكتيريا',
    section: 'microscopic',
    options: ABSENT_SCALE,
    text_reference: 'Absent',
  },
  {
    code: 'OTHERS',
    name: 'Others',
    name_ar: 'أخرى',
    section: 'microscopic',
    options: [],
    text_reference: '',
  },
];

const SPECIES = ANIMAL_TYPE_CODES.filter((t) => t !== 'other');

async function ensureUrineCategory(query) {
  const existing = await query(`SELECT id FROM test_categories WHERE code = 'URINE'`);
  if (existing.rows[0]) {
    await query(
      `UPDATE test_categories
       SET name = 'Urinalysis', name_ar = 'تحليل البول', department = 'Lab',
           is_active = true, sort_order = COALESCE(sort_order, 85)
       WHERE id = $1`,
      [existing.rows[0].id]
    );
    return existing.rows[0].id;
  }
  const inserted = await query(
    `INSERT INTO test_categories (code, name, name_ar, department, sort_order, is_active)
     VALUES ('URINE', 'Urinalysis', 'تحليل البول', 'Lab', 85, true)
     RETURNING id`
  );
  return inserted.rows[0].id;
}

async function ensureTextReference(query, parameterId, textReference) {
  const ref = String(textReference || '').trim();
  if (!ref) return;
  for (const species of SPECIES) {
    const existing = await query(
      `SELECT id FROM test_reference_ranges
       WHERE parameter_id = $1 AND animal_type = $2
         AND (is_active IS NULL OR is_active = true)
       ORDER BY updated_at DESC NULLS LAST
       LIMIT 1`,
      [parameterId, species]
    );
    if (existing.rows[0]) continue;
    await query(
      `INSERT INTO test_reference_ranges
         (parameter_id, animal_type, min_value, max_value, critical_low, critical_high,
          unit, notes, text_reference, is_active)
       VALUES ($1, $2, NULL, NULL, NULL, NULL, NULL, $3, $4, true)`,
      [parameterId, species, 'Urinalysis template (edit in LIMS Admin)', ref]
    );
  }
}

async function seedUrineParameters(query, testId) {
  for (let i = 0; i < URINE_PARAMS.length; i += 1) {
    const param = URINE_PARAMS[i];
    const options = normalizeEntryOptions(param.options);
    const valueType = param.value_type || 'text';
    const existing = await query(
      'SELECT id FROM test_parameters WHERE test_id = $1 AND code = $2',
      [testId, param.code]
    );
    let paramId = existing.rows[0]?.id;
    if (!paramId) {
      const inserted = await query(
        `INSERT INTO test_parameters
           (test_id, code, name, name_ar, unit, sort_order, value_type, category, entry_options, show_in_report, is_active)
         VALUES ($1, $2, $3, $4, '', $5, $6, $7, $8::jsonb, true, true)
         RETURNING id`,
        [
          testId,
          param.code,
          param.name,
          param.name_ar,
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
             entry_options = COALESCE(entry_options, $6::jsonb),
             show_in_report = true, is_active = true, unit = COALESCE(NULLIF(unit, 'qual'), '')
         WHERE id = $7`,
        [
          i,
          param.name,
          param.name_ar,
          valueType,
          param.section,
          options ? JSON.stringify(options) : null,
          paramId,
        ]
      );
    }
    await ensureTextReference(query, paramId, param.text_reference);
  }
}

async function ensureUrineCatalog() {
  const { query } = require('../config/database');
  const logger = require('../config/logger');
  const categoryId = await ensureUrineCategory(query);
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
      URINE_TEST.code,
      URINE_TEST.name,
      URINE_TEST.name_ar,
      categoryId,
      URINE_TEST.price,
      URINE_TEST.method,
      URINE_TEST.turnaround_hours,
    ]
  );
  await seedUrineParameters(query, testResult.rows[0].id);
  logger.info('Urinalysis catalog ensured under URINE category');
}

if (require.main === module) {
  require('dotenv').config();
  const { pool } = require('../config/database');
  const logger = require('../config/logger');
  ensureUrineCatalog()
    .then(() => pool.end())
    .catch((err) => {
      logger.error('ensure-urine failed', { error: err.message });
      process.exit(1);
    });
}

module.exports = { ensureUrineCatalog, URINE_PARAMS, URINE_TEST };
