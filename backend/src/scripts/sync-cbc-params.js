/**
 * Add/update CBC-FULL parameters to match Norma — run without full seed.
 * Usage: node src/scripts/sync-cbc-params.js
 */
require('dotenv').config();
const { query, pool } = require('../config/database');
const { NORMA_CBC_ORDER } = require('../utils/norma-cbc-map');
const logger = require('../config/logger');

const CBC_PARAMS = [
  { code: 'WBC', name: 'WBC', name_ar: 'كريات الدم البيضاء', unit: '10³/µL' },
  { code: 'LYM', name: 'Lymphocytes', name_ar: 'اللمفاويات', unit: '10³/µL' },
  { code: 'LYM_PCT', name: 'Lymphocytes %', name_ar: 'نسبة اللمفاويات', unit: '%' },
  { code: 'MON', name: 'Monocytes', name_ar: 'الوحيدات', unit: '10³/µL' },
  { code: 'MON_PCT', name: 'Monocytes %', name_ar: 'نسبة الوحيدات', unit: '%' },
  { code: 'NEU', name: 'Neutrophils', name_ar: 'العدلات', unit: '10³/µL' },
  { code: 'NEU_PCT', name: 'Neutrophils %', name_ar: 'نسبة العدلات', unit: '%' },
  { code: 'EOS', name: 'Eosinophils', name_ar: 'الحمضات', unit: '10³/µL' },
  { code: 'EOS_PCT', name: 'Eosinophils %', name_ar: 'نسبة الحمضات', unit: '%' },
  { code: 'BAS', name: 'Basophils', name_ar: 'القعدات', unit: '10³/µL' },
  { code: 'BAS_PCT', name: 'Basophils %', name_ar: 'نسبة القعدات', unit: '%' },
  { code: 'RBC', name: 'RBC', name_ar: 'كريات الدم الحمراء', unit: '10⁶/µL' },
  { code: 'HGB', name: 'Hemoglobin', name_ar: 'الهيموجلوبين', unit: 'g/dL' },
  { code: 'MCV', name: 'MCV', name_ar: 'حجم الكرية الوسطي', unit: 'fL' },
  { code: 'HCT', name: 'Hematocrit', name_ar: 'الهيماتوكريت', unit: '%' },
  { code: 'MCH', name: 'MCH', name_ar: 'هيموجلوبين الكرية', unit: 'pg' },
  { code: 'MCHC', name: 'MCHC', name_ar: 'تركيز الهيموجلوبين', unit: 'g/dL' },
  { code: 'RDW-SD', name: 'RDW-SD', name_ar: 'انحراف توزع الكريات', unit: 'fL' },
  { code: 'RDW-CV', name: 'RDW-CV', name_ar: 'تباين توزع الكريات', unit: '%' },
  { code: 'PLT', name: 'Platelets', name_ar: 'الصفائح الدموية', unit: '10³/µL' },
  { code: 'MPV', name: 'MPV', name_ar: 'حجم الصفيح الوسطي', unit: 'fL' },
  { code: 'PCT', name: 'Plateletcrit', name_ar: 'النسبة الصفية', unit: '%' },
  { code: 'PDW-SD', name: 'PDW-SD', name_ar: 'انحراف توزع الصفائح', unit: 'fL' },
  { code: 'PDW-CV', name: 'PDW-CV', name_ar: 'تباين توزع الصفائح', unit: '%' },
  { code: 'PLC-R', name: 'Platelet Large Cell Ratio', name_ar: 'نسبة الصفائح الكبيرة', unit: '%' },
  { code: 'PLC-C', name: 'Platelet Large Cell Count', name_ar: 'عدد الصفائح الكبيرة', unit: '10³/µL' },
];

async function main() {
  const test = await query("SELECT id FROM tests WHERE code = 'CBC-FULL' LIMIT 1");
  const testId = test.rows[0]?.id;
  if (!testId) {
    logger.error('CBC-FULL test not found — run seed first');
    process.exit(1);
  }

  let added = 0;
  let updated = 0;
  for (let i = 0; i < CBC_PARAMS.length; i++) {
    const p = CBC_PARAMS[i];
    const sortOrder = NORMA_CBC_ORDER.indexOf(p.code);
    const order = sortOrder >= 0 ? sortOrder : i;
    const existing = await query(
      'SELECT id FROM test_parameters WHERE test_id = $1 AND code = $2',
      [testId, p.code]
    );
    if (existing.rows[0]) {
      await query(
        `UPDATE test_parameters SET sort_order = $1, name = $2, name_ar = $3, unit = $4 WHERE id = $5`,
        [order, p.name, p.name_ar, p.unit, existing.rows[0].id]
      );
      updated += 1;
    } else {
      await query(
        `INSERT INTO test_parameters (test_id, code, name, name_ar, unit, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [testId, p.code, p.name, p.name_ar, p.unit, order]
      );
      added += 1;
    }
  }

  logger.info(`CBC parameters synced: ${added} added, ${updated} updated (${CBC_PARAMS.length} total)`);
  logger.info('Run: npm run sync-norma-refs — to sync Norma reference ranges');
  await pool.end();
}

main().catch((err) => {
  logger.error('Sync failed', { error: err.message });
  process.exit(1);
});
