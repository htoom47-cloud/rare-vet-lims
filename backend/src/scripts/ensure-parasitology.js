require('dotenv').config();
const { query, pool } = require('../config/database');
const logger = require('../config/logger');

const { consolidateBrucellaCatalog } = require('./consolidate-brucella-catalog');

/** Blood + stool only — brucella is consolidated onto lab BRUCELLA (see consolidate-brucella-catalog.js). */
const PARAS_TESTS = [
  { code: 'PARAS-BLOOD', name: 'Blood Parasites', name_ar: 'طفيليات الدم', price: 120, method: 'Microscope' },
  { code: 'PARAS-STOOL', name: 'Stool Parasites', name_ar: 'طفيليات البراز', price: 120, method: 'Microscope' },
];

const PARAS_PARAMS = {
  'PARAS-BLOOD': {
    params: [
      { code: 'BABESIA', name: 'Babesia', name_ar: 'بابيسيا', unit: 'qual' },
      { code: 'THEILERIA', name: 'Theileria', name_ar: 'ثيليريا', unit: 'qual' },
      { code: 'TRYPANO', name: 'Trypanosoma', name_ar: 'تريبانوسوما (إيفانسى)', unit: 'qual' },
      { code: 'ANAPLASMA', name: 'Anaplasma', name_ar: 'أنابلازما', unit: 'qual' },
      { code: 'EHRLICHIA', name: 'Ehrlichia', name_ar: 'إيرليكيا', unit: 'qual' },
      { code: 'HAEMOPROTEUS', name: 'Haemoproteus', name_ar: 'هيموبروتيوس (طيور)', unit: 'qual' },
      { code: 'PLASMODIUM', name: 'Plasmodium', name_ar: 'بلازموديوم (طيور)', unit: 'qual' },
      { code: 'NOTES', name: 'Comments', name_ar: 'ملاحظات', unit: '' },
    ],
  },
  'PARAS-STOOL': {
    params: [
      { code: 'STRONGYLES', name: 'Strongyles', name_ar: 'ديدان معوية قوية', unit: 'qual' },
      { code: 'HAEMONCHUS', name: 'Haemonchus', name_ar: 'هيمونكوس', unit: 'qual' },
      { code: 'TRICHOSTRONG', name: 'Trichostrongylus', name_ar: 'تريكوسترونجيلوس', unit: 'qual' },
      { code: 'ASCARIS', name: 'Ascaris / Toxocara', name_ar: 'الصفار (أسكاريس)', unit: 'qual' },
      { code: 'COCCIDIA', name: 'Coccidia (Eimeria)', name_ar: 'كوكسيديا', unit: 'qual' },
      { code: 'GIARDIA', name: 'Giardia', name_ar: 'جيارديا', unit: 'qual' },
      { code: 'CRYPTOSPOR', name: 'Cryptosporidium', name_ar: 'كريبتوسبوريديوم', unit: 'qual' },
      { code: 'FASCIOLA', name: 'Fasciola', name_ar: 'دودة الكبد (فاشولا)', unit: 'qual' },
      { code: 'MONIEZIA', name: 'Moniezia', name_ar: 'مونيزيا', unit: 'qual' },
      { code: 'TAPEWORM', name: 'Tapeworm Eggs', name_ar: 'بيض الديدان الشريطية', unit: 'qual' },
      { code: 'NEMATODE', name: 'Nematode Eggs', name_ar: 'بيض الديدان المستديرة', unit: 'qual' },
      { code: 'BALANTIDIUM', name: 'Balantidium', name_ar: 'بالانتيديوم', unit: 'qual' },
      { code: 'NOTES', name: 'Comments', name_ar: 'ملاحظات', unit: '' },
    ],
  },
  'BRU-ROSE-BENGAL': {
    params: [
      { code: 'RESULT', name: 'Rose Bengal', name_ar: 'روز بنغال', unit: 'qual' },
      { code: 'NOTES', name: 'Comments', name_ar: 'ملاحظات', unit: '' },
    ],
  },
};

async function seedTestParameters(testId, config) {
  if (!testId || !config?.params) return;
  for (let i = 0; i < config.params.length; i++) {
    const param = config.params[i];
    const existing = await query(
      'SELECT id FROM test_parameters WHERE test_id = $1 AND code = $2',
      [testId, param.code]
    );
    let paramId = existing.rows[0]?.id;
    if (!paramId) {
      const inserted = await query(
        `INSERT INTO test_parameters (test_id, code, name, name_ar, unit, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [testId, param.code, param.name, param.name_ar, param.unit, i]
      );
      paramId = inserted.rows[0].id;
    } else {
      await query(
        `UPDATE test_parameters
         SET sort_order = $1, name = $2, name_ar = $3, unit = $4, is_active = true
         WHERE id = $5`,
        [i, param.name, param.name_ar, param.unit, paramId]
      );
    }
  }
}

async function ensureParasitologyCatalog() {
  const micro = await query(
    `SELECT id FROM test_categories WHERE code = 'MICRO'`
  );
  if (!micro.rows[0]) {
    logger.warn('MICRO category not found — skipping parasitology catalog');
    return;
  }
  const categoryId = micro.rows[0].id;

  const testIdMap = {};
  for (const test of PARAS_TESTS) {
    const result = await query(
      `INSERT INTO tests (code, name, name_ar, category_id, price, method)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (code) DO UPDATE SET name = $2, name_ar = $3, category_id = $4, price = $5, method = $6
       RETURNING id`,
      [test.code, test.name, test.name_ar, categoryId, test.price, test.method]
    );
    testIdMap[test.code] = result.rows[0].id;
  }

  for (const [code, config] of Object.entries(PARAS_PARAMS)) {
    if (testIdMap[code]) await seedTestParameters(testIdMap[code], config);
  }

  const client = await pool.connect();
  try {
    await consolidateBrucellaCatalog(client, { apply: true });
  } finally {
    client.release();
  }

  await query(`UPDATE test_categories SET is_active = false WHERE code = 'PARAS'`);

  await query(`
    CREATE TABLE IF NOT EXISTS result_attachments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      result_id UUID NOT NULL REFERENCES results(id) ON DELETE CASCADE,
      parameter_id UUID REFERENCES test_parameters(id) ON DELETE SET NULL,
      file_url TEXT NOT NULL,
      caption TEXT,
      sort_order INTEGER DEFAULT 0,
      uploaded_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(
    'CREATE INDEX IF NOT EXISTS idx_result_attachments_result ON result_attachments(result_id)'
  );

  logger.info('Parasitology tests ensured under MICRO category');
}

if (require.main === module) {
  ensureParasitologyCatalog()
    .then(() => pool.end())
    .catch((err) => {
      logger.error('ensure-parasitology failed', { error: err.message });
      process.exit(1);
    });
}

module.exports = { ensureParasitologyCatalog, seedTestParameters, PARAS_PARAMS };
