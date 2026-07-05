const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { ANIMAL_TYPE_LABELS } = require('../constants/animal-types');

const CODE_RE = /^[a-z][a-z0-9_]{0,48}$/;

let labelCache = { ...ANIMAL_TYPE_LABELS };

const toLabelEntry = (row) => ({
  en: row.name_en,
  ar: row.name_ar || row.name_en,
});

const refreshLabelCache = async () => {
  const result = await query(
    `SELECT code, name_en, name_ar FROM animal_species WHERE is_active = true ORDER BY sort_order, code`
  );
  const next = { ...ANIMAL_TYPE_LABELS };
  for (const row of result.rows) {
    next[row.code] = toLabelEntry(row);
  }
  labelCache = next;
  return result.rows;
};

const speciesLabel = (code, isArabic = false) => {
  const entry = labelCache[String(code || '').toLowerCase()];
  if (!entry) return code || '';
  return isArabic ? (entry.ar || entry.en) : (entry.en || entry.ar);
};

const listActive = async () => {
  const result = await query(
    `SELECT code, name_en, name_ar, sort_order, is_system
     FROM animal_species WHERE is_active = true
     ORDER BY sort_order, name_en`
  );
  return result.rows;
};

const listAll = async () => {
  const result = await query(
    `SELECT code, name_en, name_ar, sort_order, is_system, is_active, created_at, updated_at
     FROM animal_species ORDER BY sort_order, name_en`
  );
  return result.rows;
};

const getByCode = async (code) => {
  const result = await query('SELECT * FROM animal_species WHERE code = $1', [code]);
  return result.rows[0] || null;
};

const assertActiveSpecies = async (code) => {
  const normalized = String(code || '').trim().toLowerCase();
  if (!normalized) throw new AppError('Animal species is required', 400, 'VALIDATION');
  const row = await getByCode(normalized);
  if (!row || !row.is_active) {
    throw new AppError('Unknown or inactive animal species', 400, 'INVALID_SPECIES');
  }
  return normalized;
};

const normalizeCode = (raw) => String(raw || '')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, '_')
  .replace(/[^a-z0-9_]/g, '')
  .replace(/_+/g, '_')
  .replace(/^_|_$/g, '')
  .slice(0, 49);

const create = async ({ code, name_en, name_ar, sort_order }, userId) => {
  const normalized = normalizeCode(code);
  if (!CODE_RE.test(normalized)) {
    throw new AppError('Species code must be lowercase Latin letters, numbers, or underscore', 400, 'VALIDATION');
  }
  if (!name_en?.trim()) throw new AppError('English name is required', 400, 'VALIDATION');

  const dup = await getByCode(normalized);
  if (dup) throw new AppError('Species code already exists', 409, 'DUPLICATE');

  const result = await query(
    `INSERT INTO animal_species (code, name_en, name_ar, sort_order, is_system, created_by)
     VALUES ($1, $2, $3, $4, false, $5) RETURNING *`,
    [
      normalized,
      name_en.trim(),
      name_ar?.trim() || null,
      Number.isFinite(parseInt(sort_order, 10)) ? parseInt(sort_order, 10) : 50,
      userId || null,
    ]
  );

  await refreshLabelCache();
  return result.rows[0];
};

const update = async (code, { name_en, name_ar, sort_order, is_active }) => {
  const existing = await getByCode(code);
  if (!existing) throw new AppError('Species not found', 404, 'NOT_FOUND');

  const result = await query(
    `UPDATE animal_species SET
       name_en = COALESCE($1, name_en),
       name_ar = COALESCE($2, name_ar),
       sort_order = COALESCE($3, sort_order),
       is_active = COALESCE($4, is_active),
       updated_at = NOW()
     WHERE code = $5 RETURNING *`,
    [
      name_en?.trim() || null,
      name_ar?.trim() || null,
      sort_order != null ? parseInt(sort_order, 10) : null,
      is_active,
      code,
    ]
  );

  await refreshLabelCache();
  return result.rows[0];
};

const deactivate = async (code) => {
  const existing = await getByCode(code);
  if (!existing) throw new AppError('Species not found', 404, 'NOT_FOUND');
  if (existing.is_system) throw new AppError('Cannot remove a system species', 400, 'SYSTEM_SPECIES');

  const inUse = await query(
    `SELECT COUNT(*)::int AS n FROM animals WHERE animal_type = $1 AND is_active = true`,
    [code]
  );
  if (inUse.rows[0]?.n > 0) {
    throw new AppError('Species is linked to active animals', 400, 'SPECIES_IN_USE');
  }

  await query(
    'UPDATE animal_species SET is_active = false, updated_at = NOW() WHERE code = $1',
    [code]
  );
  await refreshLabelCache();
  return { deactivated: true, code };
};

module.exports = {
  CODE_RE,
  normalizeCode,
  refreshLabelCache,
  speciesLabel,
  listActive,
  listAll,
  getByCode,
  assertActiveSpecies,
  create,
  update,
  deactivate,
};
