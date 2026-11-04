/**
 * Ensure Diarrhea Causes rapid Ag panel (مسببات الإسهال).
 * Six qualitative Pos/Neg antigens — not Culture AST / not Parasitology MICRO.
 * Usage: node src/scripts/ensure-diarrhea-causes.js
 */
const DIARR_TEST = {
  code: 'DIARR-AG',
  name: 'Diarrhea Causes (Rapid Ag)',
  name_ar: 'مسببات الإسهال',
  price: 150,
  method: 'Rapid lateral flow (Ag)',
  turnaround_hours: 24,
};

const DIARR_CATEGORY = {
  code: 'RAPID',
  name: 'Rapid Antigen',
  name_ar: 'مستضدات سريعة',
  department: 'Lab',
  sort_order: 75,
};

/** Kit panel — Interpretation of the Result (C / T lines). */
const DIARR_PARAMS = [
  {
    code: 'CRYPTO-AG',
    name: 'Cryptosporidium Ag',
    name_ar: 'مستضد الكريبتوسبوريديوم',
  },
  {
    code: 'ROTA-AG',
    name: 'Rotavirus Ag',
    name_ar: 'مستضد الروتا فيروس',
  },
  {
    code: 'CORONA-AG',
    name: 'Coronavirus Ag',
    name_ar: 'مستضد الكورونا فيروس',
  },
  {
    code: 'ECOLI-K99-AG',
    name: 'E.coli K99/F17 Ag',
    name_ar: 'مستضد الإشريكية القولونية K99/F17',
  },
  {
    code: 'GIARDIA-AG',
    name: 'Giardia lamblia Ag',
    name_ar: 'مستضد الجيارديا',
  },
  {
    code: 'CPERF-AG',
    name: 'C. perfringens Ag',
    name_ar: 'مستضد المطثية الحاطمة',
  },
];

async function ensureRapidCategory(query) {
  const existing = await query(
    `SELECT id FROM test_categories WHERE code = $1`,
    [DIARR_CATEGORY.code]
  );
  if (existing.rows[0]) {
    await query(
      `UPDATE test_categories
       SET name = $2, name_ar = $3, department = $4, is_active = true,
           sort_order = COALESCE(sort_order, $5)
       WHERE id = $1`,
      [
        existing.rows[0].id,
        DIARR_CATEGORY.name,
        DIARR_CATEGORY.name_ar,
        DIARR_CATEGORY.department,
        DIARR_CATEGORY.sort_order,
      ]
    );
    return existing.rows[0].id;
  }
  const inserted = await query(
    `INSERT INTO test_categories (code, name, name_ar, department, sort_order, is_active)
     VALUES ($1, $2, $3, $4, $5, true)
     RETURNING id`,
    [
      DIARR_CATEGORY.code,
      DIARR_CATEGORY.name,
      DIARR_CATEGORY.name_ar,
      DIARR_CATEGORY.department,
      DIARR_CATEGORY.sort_order,
    ]
  );
  return inserted.rows[0].id;
}

async function findExistingDiarrheaTest(query) {
  const byCode = await query(
    `SELECT id, code FROM tests WHERE code = $1 LIMIT 1`,
    [DIARR_TEST.code]
  );
  if (byCode.rows[0]) return byCode.rows[0];

  const byName = await query(
    `SELECT id, code FROM tests
     WHERE name_ar ILIKE '%مسببات%اسهال%'
        OR name_ar ILIKE '%مسببات%إسهال%'
        OR name ILIKE '%diarrhea%cause%'
        OR name ILIKE '%diarr%ag%'
     ORDER BY updated_at DESC NULLS LAST
     LIMIT 1`
  );
  return byName.rows[0] || null;
}

async function seedDiarrheaParameters(query, testId) {
  for (let i = 0; i < DIARR_PARAMS.length; i += 1) {
    const param = DIARR_PARAMS[i];
    const existing = await query(
      `SELECT id FROM test_parameters WHERE test_id = $1 AND code = $2`,
      [testId, param.code]
    );
    if (existing.rows[0]) {
      await query(
        `UPDATE test_parameters
         SET name = $1, name_ar = $2, unit = 'qual', sort_order = $3,
             value_type = 'text', show_in_report = true, is_active = true
         WHERE id = $4`,
        [param.name, param.name_ar, i, existing.rows[0].id]
      );
    } else {
      await query(
        `INSERT INTO test_parameters
           (test_id, code, name, name_ar, unit, sort_order, value_type, show_in_report, is_active)
         VALUES ($1, $2, $3, $4, 'qual', $5, 'text', true, true)`,
        [testId, param.code, param.name, param.name_ar, i]
      );
    }
  }
}

async function ensureDiarrheaCausesCatalog() {
  const { query } = require('../config/database');
  const logger = require('../config/logger');

  const categoryId = await ensureRapidCategory(query);
  const existing = await findExistingDiarrheaTest(query);

  let testId;
  if (existing) {
    await query(
      `UPDATE tests
       SET code = $1,
           name = $2,
           name_ar = $3,
           category_id = $4,
           price = COALESCE(NULLIF(price, 0), $5),
           method = $6,
           turnaround_hours = COALESCE(turnaround_hours, $7),
           is_active = true,
           updated_at = NOW()
       WHERE id = $8`,
      [
        DIARR_TEST.code,
        DIARR_TEST.name,
        DIARR_TEST.name_ar,
        categoryId,
        DIARR_TEST.price,
        DIARR_TEST.method,
        DIARR_TEST.turnaround_hours,
        existing.id,
      ]
    );
    testId = existing.id;
  } else {
    const inserted = await query(
      `INSERT INTO tests (code, name, name_ar, category_id, price, method, turnaround_hours, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)
       ON CONFLICT (code) DO UPDATE SET
         name = EXCLUDED.name,
         name_ar = EXCLUDED.name_ar,
         category_id = EXCLUDED.category_id,
         price = EXCLUDED.price,
         method = EXCLUDED.method,
         turnaround_hours = EXCLUDED.turnaround_hours,
         is_active = true,
         updated_at = NOW()
       RETURNING id`,
      [
        DIARR_TEST.code,
        DIARR_TEST.name,
        DIARR_TEST.name_ar,
        categoryId,
        DIARR_TEST.price,
        DIARR_TEST.method,
        DIARR_TEST.turnaround_hours,
      ]
    );
    testId = inserted.rows[0].id;
  }

  await seedDiarrheaParameters(query, testId);
  logger.info('Diarrhea causes (DIARR-AG) catalog ensured under RAPID category');
  return { testId, code: DIARR_TEST.code };
}

if (require.main === module) {
  require('dotenv').config();
  const { pool } = require('../config/database');
  const logger = require('../config/logger');
  ensureDiarrheaCausesCatalog()
    .then(() => pool.end())
    .catch((err) => {
      logger.error('ensure-diarrhea-causes failed', { error: err.message });
      process.exit(1);
    });
}

module.exports = {
  ensureDiarrheaCausesCatalog,
  DIARR_TEST,
  DIARR_PARAMS,
  DIARR_CATEGORY,
};
