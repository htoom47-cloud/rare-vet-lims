const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { uuidv4 } = require('../utils/uuid');
const { countDistinctAnimals, discountVolumeCount } = require('../utils/discount');

const isPresetAllowed = (preset, animalCount) => {
  const min = parseInt(preset?.min_animal_count, 10) || 0;
  return min <= 0 || Number(animalCount) > min;
};

const list = async ({ includeInactive } = {}) => {
  const where = includeInactive ? '' : 'WHERE is_active = true';
  const result = await query(
    `SELECT * FROM discount_presets ${where} ORDER BY sort_order, percent, name`
  );
  return result.rows;
};

const getById = async (id) => {
  const result = await query('SELECT * FROM discount_presets WHERE id = $1', [id]);
  if (!result.rows[0]) throw new AppError('Discount not found', 404, 'NOT_FOUND');
  return result.rows[0];
};

const findActiveByPercent = async (percent) => {
  const pct = parseFloat(percent);
  if (!(pct > 0)) return null;
  const result = await query(
    `SELECT * FROM discount_presets
     WHERE is_active = true AND percent = $1
     ORDER BY sort_order, name
     LIMIT 1`,
    [pct]
  );
  return result.rows[0] || null;
};

const create = async (data) => {
  const percent = parseFloat(data.percent);
  if (!(percent > 0) || percent > 100) {
    throw new AppError('Discount percent must be between 0.01 and 100', 400, 'VALIDATION_ERROR');
  }
  const name = String(data.name || '').trim();
  const nameAr = String(data.name_ar || data.name || '').trim();
  if (!name && !nameAr) throw new AppError('Discount name is required', 400, 'VALIDATION_ERROR');
  const code = String(data.code || `d${Date.now()}`).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 50);
  const minAnimalCount = Math.max(0, parseInt(data.min_animal_count, 10) || 0);
  const sortOrder = parseInt(data.sort_order, 10) || 0;
  try {
    const result = await query(
      `INSERT INTO discount_presets (id, code, name, name_ar, percent, min_animal_count, is_active, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,true,$7) RETURNING *`,
      [uuidv4(), code || uuidv4().slice(0, 8), name || nameAr, nameAr || name, percent, minAnimalCount, sortOrder]
    );
    return result.rows[0];
  } catch (err) {
    if (err.code === '23505') throw new AppError('Discount code already exists', 409, 'DUPLICATE');
    throw err;
  }
};

const update = async (id, data) => {
  await getById(id);
  const percent = parseFloat(data.percent);
  if (!(percent > 0) || percent > 100) {
    throw new AppError('Discount percent must be between 0.01 and 100', 400, 'VALIDATION_ERROR');
  }
  const name = String(data.name || '').trim();
  const nameAr = String(data.name_ar || data.name || '').trim();
  if (!name && !nameAr) throw new AppError('Discount name is required', 400, 'VALIDATION_ERROR');
  const minAnimalCount = Math.max(0, parseInt(data.min_animal_count, 10) || 0);
  const sortOrder = parseInt(data.sort_order, 10) || 0;
  const isActive = data.is_active !== false;
  const result = await query(
    `UPDATE discount_presets
     SET name = $1, name_ar = $2, percent = $3, min_animal_count = $4,
         is_active = $5, sort_order = $6, updated_at = NOW()
     WHERE id = $7 RETURNING *`,
    [name || nameAr, nameAr || name, percent, minAnimalCount, isActive, sortOrder, id]
  );
  return result.rows[0];
};

const deactivate = async (id) => {
  await getById(id);
  const result = await query(
    `UPDATE discount_presets SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id]
  );
  return result.rows[0];
};

const resolvePresetForDocument = async (data, { presetId, percent, amount, animalCount }) => {
  const pct = parseFloat(percent) || 0;
  const amt = parseFloat(amount) || 0;
  if (!presetId && pct <= 0 && amt <= 0) {
    return { percent: 0, amount: 0 };
  }
  let preset = null;
  if (presetId) {
    preset = await getById(presetId);
  } else if (pct > 0) {
    preset = await findActiveByPercent(pct);
  }
  if (!preset || preset.is_active === false) {
    throw new AppError('اختر خصماً من القائمة المعتمدة من مدير النظام', 400, 'DISCOUNT_PRESET_REQUIRED');
  }
  if (!isPresetAllowed(preset, animalCount)) {
    throw new AppError(
      `هذا الخصم يتطلب أكثر من ${preset.min_animal_count} فحوصات أو حيوانات`,
      400,
      'DISCOUNT_ANIMAL_MINIMUM'
    );
  }
  return { percent: parseFloat(preset.percent), amount: 0 };
};

const applyToDocumentData = async (data) => {
  const animalCount = discountVolumeCount(data.items);
  const service = await resolvePresetForDocument(data, {
    presetId: data.discount_preset_id,
    percent: data.discount_percent,
    amount: data.discount_amount,
    animalCount,
  });
  const fieldVisit = await resolvePresetForDocument(data, {
    presetId: data.field_visit_discount_preset_id,
    percent: data.field_visit_discount_percent,
    amount: data.field_visit_discount_amount,
    animalCount,
  });
  return {
    ...data,
    discount_percent: service.percent,
    discount_amount: service.amount,
    field_visit_discount_percent: fieldVisit.percent,
    field_visit_discount_amount: fieldVisit.amount,
  };
};

module.exports = {
  countDistinctAnimals,
  discountVolumeCount,
  isPresetAllowed,
  list,
  getById,
  findActiveByPercent,
  create,
  update,
  deactivate,
  applyToDocumentData,
};
