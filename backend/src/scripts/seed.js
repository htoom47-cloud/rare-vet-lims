require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, query } = require('../config/database');
const { PERMISSIONS, ROLE_PERMISSIONS } = require('../utils/permissions');
const logger = require('../config/logger');

const ROLES = [
  { name: 'admin', name_ar: 'مدير النظام', description: 'Full system access' },
  { name: 'manager', name_ar: 'مدير', description: 'Laboratory manager' },
  { name: 'reception', name_ar: 'استقبال', description: 'Front desk reception' },
  { name: 'lab_technician', name_ar: 'فني مختبر', description: 'Lab technician' },
  { name: 'veterinarian', name_ar: 'طبيب بيطري', description: 'Veterinarian' },
  { name: 'accountant', name_ar: 'محاسب', description: 'Accountant' },
];

const CATEGORIES = [
  { code: 'CBC', name: 'Complete Blood Count', name_ar: 'تعداد الدم الكامل', department: 'Hematology', sort_order: 1 },
  { code: 'CHEM', name: 'Chemistry', name_ar: 'الكيمياء', department: 'Chemistry', sort_order: 2 },
  { code: 'HORM', name: 'Hormones', name_ar: 'الهرمونات', department: 'Immunology', sort_order: 3 },
  { code: 'PCR', name: 'PCR', name_ar: 'تفاعل البلمرة', department: 'Molecular', sort_order: 4 },
  { code: 'ELISA', name: 'ELISA', name_ar: 'إليزا', department: 'Immunology', sort_order: 5 },
  { code: 'CULT', name: 'Culture', name_ar: 'المزرعة', department: 'Microbiology', sort_order: 6 },
  { code: 'SERO', name: 'Serology', name_ar: 'المصلية', department: 'Immunology', sort_order: 7 },
  { code: 'MICRO', name: 'Microscopy', name_ar: 'المجهر', department: 'Microscopy', sort_order: 8 },
];

const TESTS = [
  { code: 'CBC-FULL', name: 'Complete Blood Count', name_ar: 'تعداد الدم الكامل', category: 'CBC', price: 150 },
  { code: 'CHEM-BASIC', name: 'Basic Chemistry Panel', name_ar: 'لوحة الكيمياء الأساسية', category: 'CHEM', price: 200 },
  { code: 'HORM-T4', name: 'Thyroid T4', name_ar: 'هرمون الغدة الدرقية T4', category: 'HORM', price: 180 },
  { code: 'PCR-BRU', name: 'Brucella PCR', name_ar: 'PCR البروسيلا', category: 'PCR', price: 350 },
  { code: 'ELISA-FMD', name: 'FMD ELISA', name_ar: 'إليزا الحمى القلاعية', category: 'ELISA', price: 250 },
  { code: 'CULT-BACT', name: 'Bacterial Culture', name_ar: 'مزرعة بكتيرية', category: 'CULT', price: 300 },
  { code: 'SERO-BRU', name: 'Brucella Serology', name_ar: 'مصلية البروسيلا', category: 'SERO', price: 200 },
  { code: 'MICRO-FECAL', name: 'Fecal Microscopy', name_ar: 'فحص البراز المجهري', category: 'MICRO', price: 100 },
];

const CBC_PARAMS = [
  { code: 'WBC', name: 'White Blood Cells', name_ar: 'كريات الدم البيضاء', unit: '10³/µL' },
  { code: 'LYM', name: 'Lymphocytes', name_ar: 'اللمفاويات', unit: '10³/µL' },
  { code: 'MON', name: 'Monocytes', name_ar: 'الوحيدات', unit: '10³/µL' },
  { code: 'NEU', name: 'Neutrophils', name_ar: 'العدلات', unit: '10³/µL' },
  { code: 'EOS', name: 'Eosinophils', name_ar: 'الحمضات', unit: '10³/µL' },
  { code: 'BAS', name: 'Basophils', name_ar: 'القعدات', unit: '10³/µL' },
  { code: 'RBC', name: 'Red Blood Cells', name_ar: 'كريات الدم الحمراء', unit: '10⁶/µL' },
  { code: 'HGB', name: 'Hemoglobin', name_ar: 'الهيموجلوبين', unit: 'g/dL' },
  { code: 'HCT', name: 'Hematocrit', name_ar: 'الهيماتوكريت', unit: '%' },
  { code: 'MCV', name: 'MCV', name_ar: 'حجم الكرية الوسطي', unit: 'fL' },
  { code: 'MCH', name: 'MCH', name_ar: 'هيموجلوبين الكرية', unit: 'pg' },
  { code: 'MCHC', name: 'MCHC', name_ar: 'تركيز الهيموجلوبين', unit: 'g/dL' },
  { code: 'PLT', name: 'Platelets', name_ar: 'الصفائح الدموية', unit: '10³/µL' },
  { code: 'MPV', name: 'MPV', name_ar: 'حجم الصفيح الوسطي', unit: 'fL' },
  { code: 'RDW', name: 'RDW', name_ar: 'توزع كريات الدم الحمراء', unit: '%' },
];

const CHEM_PARAMS = [
  { code: 'GLU', name: 'Glucose', name_ar: 'الجلوكوز', unit: 'mg/dL' },
  { code: 'BUN', name: 'Blood Urea Nitrogen', name_ar: 'نيتروجين اليوريا', unit: 'mg/dL' },
  { code: 'CREA', name: 'Creatinine', name_ar: 'الكرياتينين', unit: 'mg/dL' },
  { code: 'ALT', name: 'ALT', name_ar: 'ALT', unit: 'U/L' },
  { code: 'AST', name: 'AST', name_ar: 'AST', unit: 'U/L' },
  { code: 'ALP', name: 'Alkaline Phosphatase', name_ar: 'الفوسفاتاز القلوي', unit: 'U/L' },
  { code: 'TP', name: 'Total Protein', name_ar: 'البروتين الكلي', unit: 'g/dL' },
  { code: 'ALB', name: 'Albumin', name_ar: 'الألبومين', unit: 'g/dL' },
];

const TEST_PARAMS = {
  'CBC-FULL': { params: CBC_PARAMS, ranges: {
    WBC: { min: 4, max: 15, crit_low: 2, crit_high: 30 },
    RBC: { min: 5, max: 12, crit_low: 3, crit_high: 15 },
    HGB: { min: 8, max: 18, crit_low: 5, crit_high: 22 },
    HCT: { min: 24, max: 46, crit_low: 15, crit_high: 55 },
    PLT: { min: 100, max: 800, crit_low: 50, crit_high: 1000 },
  }},
  'CHEM-BASIC': { params: CHEM_PARAMS, ranges: {
    GLU: { min: 60, max: 120, crit_low: 40, crit_high: 400 },
    BUN: { min: 10, max: 30, crit_low: 5, crit_high: 80 },
    CREA: { min: 0.8, max: 2.0, crit_low: 0.3, crit_high: 5 },
    ALT: { min: 10, max: 60, crit_low: 5, crit_high: 300 },
    AST: { min: 10, max: 50, crit_low: 5, crit_high: 250 },
    ALP: { min: 50, max: 300, crit_low: 20, crit_high: 800 },
    TP: { min: 5.5, max: 8.5, crit_low: 4, crit_high: 10 },
    ALB: { min: 2.5, max: 4.5, crit_low: 1.5, crit_high: 5.5 },
  }},
  'HORM-T4': { params: [{ code: 'T4', name: 'Thyroxine T4', name_ar: 'هرمون T4', unit: 'µg/dL' }], ranges: {
    T4: { min: 1.0, max: 4.0, crit_low: 0.5, crit_high: 8 },
  }},
  'PCR-BRU': { params: [{ code: 'PCR-RES', name: 'PCR Result', name_ar: 'نتيجة PCR', unit: '' }] },
  'ELISA-FMD': { params: [{ code: 'SP-RATIO', name: 'S/P Ratio', name_ar: 'نسبة S/P', unit: '' }] },
  'CULT-BACT': { params: [{ code: 'GROWTH', name: 'Culture Result', name_ar: 'نتيجة المزرعة', unit: '' }] },
  'SERO-BRU': { params: [{ code: 'TITER', name: 'Antibody Titer', name_ar: 'العيار المصلي', unit: '' }] },
  'MICRO-FECAL': { params: [{ code: 'FINDINGS', name: 'Microscopic Findings', name_ar: 'الموجودات المجهرية', unit: '' }] },
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
    }
    const r = config.ranges?.[param.code];
    if (r && paramId) {
      const rangeExists = await query(
        `SELECT id FROM test_reference_ranges WHERE parameter_id = $1 AND animal_type = 'camel'`,
        [paramId]
      );
      if (!rangeExists.rows[0]) {
        await query(
          `INSERT INTO test_reference_ranges (parameter_id, animal_type, min_value, max_value, critical_low, critical_high, unit)
           VALUES ($1, 'camel', $2, $3, $4, $5, $6)`,
          [paramId, r.min, r.max, r.crit_low, r.crit_high, param.unit]
        );
      }
    }
  }
}

const DEMO_USERS = [
  { username: 'reception', email: 'reception@rarevetcare.com', password: 'Reception@123', full_name: 'Reception Desk', full_name_ar: 'الاستقبال', role: 'reception' },
  { username: 'tech', email: 'tech@rarevetcare.com', password: 'Tech@123', full_name: 'Lab Technician', full_name_ar: 'فني المختبر', role: 'lab_technician' },
  { username: 'vet', email: 'vet@rarevetcare.com', password: 'Vet@123', full_name: 'Dr. Veterinarian', full_name_ar: 'الطبيب البيطري', role: 'veterinarian' },
  { username: 'accountant', email: 'accountant@rarevetcare.com', password: 'Account@123', full_name: 'Accountant', full_name_ar: 'المحاسب', role: 'accountant' },
  { username: 'manager', email: 'manager@rarevetcare.com', password: 'Manager@123', full_name: 'Lab Manager', full_name_ar: 'مدير المختبر', role: 'manager' },
];

const USERS = [
  {
    username: 'admin',
    email: process.env.ADMIN_EMAIL || 'admin@rarevetcare.com',
    password: process.env.ADMIN_INITIAL_PASSWORD || 'Admin@123',
    full_name: 'System Admin',
    full_name_ar: 'مدير النظام',
    role: 'admin',
  },
  ...DEMO_USERS,
];

async function seed() {
  logger.info('Starting database seed...');

  // Roles
  for (const role of ROLES) {
    await query(
      `INSERT INTO roles (name, name_ar, description) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING`,
      [role.name, role.name_ar, role.description]
    );
  }

  // Permissions
  const permMap = {};
  for (const [key, code] of Object.entries(PERMISSIONS)) {
    const module = code.split('.')[0];
    const result = await query(
      `INSERT INTO permissions (code, module, description) VALUES ($1, $2, $3)
       ON CONFLICT (code) DO UPDATE SET module = $2 RETURNING id`,
      [code, module, key]
    );
    permMap[code] = result.rows[0].id;
  }

  // Role permissions (sync on each seed run)
  for (const [roleName, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const roleResult = await query('SELECT id FROM roles WHERE name = $1', [roleName]);
    if (!roleResult.rows[0]) continue;
    const roleId = roleResult.rows[0].id;

    await query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);

    for (const perm of perms) {
      if (permMap[perm]) {
        await query(
          `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [roleId, permMap[perm]]
        );
      }
    }
  }

  // Test categories
  const catMap = {};
  for (const cat of CATEGORIES) {
    const result = await query(
      `INSERT INTO test_categories (code, name, name_ar, department, sort_order)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (code) DO UPDATE SET name = $2 RETURNING id`,
      [cat.code, cat.name, cat.name_ar, cat.department, cat.sort_order]
    );
    catMap[cat.code] = result.rows[0].id;
  }

  // Tests + parameters
  const testIdMap = {};
  for (const test of TESTS) {
    const result = await query(
      `INSERT INTO tests (code, name, name_ar, category_id, price)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (code) DO UPDATE SET name = $2 RETURNING id`,
      [test.code, test.name, test.name_ar, catMap[test.category], test.price]
    );
    testIdMap[test.code] = result.rows[0].id;
  }

  for (const [code, config] of Object.entries(TEST_PARAMS)) {
    await seedTestParameters(testIdMap[code], config);
  }

  for (const user of USERS) {
    const roleResult = await query('SELECT id FROM roles WHERE name = $1', [user.role]);
    if (!roleResult.rows[0]) continue;
    const hash = await bcrypt.hash(user.password, 12);
    const username = user.username.toLowerCase();
    const email = user.email.toLowerCase();
    const existing = await query(
      'SELECT id FROM users WHERE LOWER(username) = $1 OR LOWER(email) = $2',
      [username, email]
    );
    if (existing.rows[0]) {
      if (user.role === 'admin') {
        await query(
          `UPDATE users SET username = $1, full_name = $2, full_name_ar = $3, role_id = $4, email = $5, is_active = true WHERE id = $6`,
          [username, user.full_name, user.full_name_ar, roleResult.rows[0].id, email, existing.rows[0].id]
        );
      } else {
        await query(
          `UPDATE users SET username = $1, password_hash = $2, full_name = $3, full_name_ar = $4, role_id = $5, email = $6, is_active = true WHERE id = $7`,
          [username, hash, user.full_name, user.full_name_ar, roleResult.rows[0].id, email, existing.rows[0].id]
        );
      }
    } else {
      await query(
        `INSERT INTO users (username, email, password_hash, full_name, full_name_ar, role_id, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, true)`,
        [username, email, hash, user.full_name, user.full_name_ar, roleResult.rows[0].id]
      );
    }
  }

  // Sample inventory items
  const inventory = [
    { sku: 'REAG-EDTA', name: 'EDTA Tubes', name_ar: 'أنابيب EDTA', category: 'tube', quantity: 500, min_quantity: 100 },
    { sku: 'REAG-GEL', name: 'Gel Separator Tubes', name_ar: 'أنابيب هلامية', category: 'tube', quantity: 300, min_quantity: 50 },
    { sku: 'REAG-SLIDE', name: 'Microscope Slides', name_ar: 'شرائح مجهرية', category: 'slide', quantity: 1000, min_quantity: 200 },
    { sku: 'REAG-CHEM', name: 'Chemistry Reagent Kit', name_ar: 'مجموعة كواشف كيميائية', category: 'reagent', quantity: 50, min_quantity: 10 },
  ];

  for (const item of inventory) {
    await query(
      `INSERT INTO inventory_items (sku, name, name_ar, category, quantity, min_quantity)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (sku) DO NOTHING`,
      [item.sku, item.name, item.name_ar, item.category, item.quantity, item.min_quantity]
    );
  }

  // Device integrations (inactive, ready for future)
  const devices = [
    { name: 'Diasys Respons 910', model: 'Respons 910', protocol: 'ASTM', connection_type: 'tcp', host: '192.168.1.100', port: 5000 },
    { name: 'Norma CBC', model: 'iVet-5', protocol: 'HL7', connection_type: 'tcp', host: '0.0.0.0', port: 2575 },
    { name: 'Mini Vidas', model: 'Mini Vidas', protocol: 'ASTM', connection_type: 'serial', serial_port: 'COM4' },
  ];

  const crypto = require('crypto');
  for (const device of devices) {
    const config = JSON.stringify({
      api_key: crypto.randomBytes(24).toString('hex'),
      test_code: device.name === 'Norma CBC' ? 'CBC-FULL' : undefined,
    });
    const exists = await query('SELECT id FROM device_integrations WHERE name = $1', [device.name]);
    if (!exists.rows[0]) {
      await query(
        `INSERT INTO device_integrations (name, model, protocol, connection_type, host, port, serial_port, config, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [device.name, device.model, device.protocol, device.connection_type, device.host, device.port, device.serial_port, config, device.name === 'Norma CBC']
      );
    }
  }

  // Settings
  await query(
    `INSERT INTO settings (key, value) VALUES ('lab_info', $1) ON CONFLICT (key) DO NOTHING`,
    [JSON.stringify({ name: 'Rare Veterinary Care', name_ar: 'رير للرعاية البيطرية', vat: '300000000000003' })]
  );

  logger.info('Seed completed successfully!');
  logger.info(`Admin login: ${USERS[0].email} (set ADMIN_INITIAL_PASSWORD to customize on first seed)`);
}

seed()
  .then(() => pool.end())
  .catch((err) => {
    logger.error('Seed failed', { error: err.message });
    pool.end();
    process.exit(1);
  });
