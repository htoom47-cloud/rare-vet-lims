const { query, getClient } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { generateRandomAnimalCode, ANIMAL_CODE_LOCK, paginate, buildPagination } = require('../utils/helpers');
const { uuidv4 } = require('../utils/uuid');
const speciesService = require('./animal-species.service');
const { notDeleted } = require('../utils/soft-delete-sql');

const list = async ({ search, owner_id, animal_type, page, limit }) => {
  const { offset, page: p, limit: l } = paginate(page, limit);
  const params = [];
  let where = `WHERE a.is_active = true AND ${notDeleted('a')}`;

  if (search) {
    params.push(`%${search}%`);
    where += ` AND (a.animal_code ILIKE $${params.length} OR a.name_tag ILIKE $${params.length} OR a.rfid_chip ILIKE $${params.length})`;
  }
  if (owner_id) {
    params.push(owner_id);
    where += ` AND a.owner_id = $${params.length}`;
  }
  if (animal_type) {
    params.push(animal_type);
    where += ` AND a.animal_type = $${params.length}`;
  }

  const countResult = await query(`SELECT COUNT(*) FROM animals a ${where}`, params);
  const total = parseInt(countResult.rows[0].count, 10);

  params.push(l, offset);
  const result = await query(
    `SELECT a.*, c.full_name as owner_name, c.mobile as owner_mobile
     FROM animals a LEFT JOIN customers c ON a.owner_id = c.id
     ${where} ORDER BY a.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { data: result.rows, pagination: buildPagination(total, p, l) };
};

const getById = async (id) => {
  const result = await query(
    `SELECT a.*, c.full_name as owner_name FROM animals a
     LEFT JOIN customers c ON a.owner_id = c.id WHERE a.id = $1`,
    [id]
  );
  if (!result.rows[0]) throw new AppError('Animal not found', 404, 'NOT_FOUND');
  return result.rows[0];
};

const getHistory = async (id) => {
  const animal = await getById(id);
  const samples = await query(
    `SELECT s.*, array_agg(t.name) as test_names
     FROM samples s
     LEFT JOIN sample_tests st ON s.id = st.sample_id
     LEFT JOIN tests t ON st.test_id = t.id
     WHERE s.animal_id = $1 GROUP BY s.id ORDER BY s.created_at DESC`,
    [id]
  );
  return { ...animal, samples: samples.rows, medical_history: animal.medical_history };
};

const create = async (data, userId) => {
  const speciesCode = await speciesService.assertActiveSpecies(data.animal_type);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [ANIMAL_CODE_LOCK]);
    const animalCode = await generateRandomAnimalCode(client.query.bind(client));
    const result = await client.query(
      `INSERT INTO animals (id, animal_code, animal_type, name_tag, age, gender, weight, color, breed, rfid_chip, owner_id, medical_history, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [uuidv4(), animalCode, speciesCode, data.name_tag, data.age, data.gender, data.weight, data.color, data.breed, data.rfid_chip, data.owner_id, data.medical_history, userId]
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
};

const update = async (id, data) => {
  await getById(id);
  const speciesCode = await speciesService.assertActiveSpecies(data.animal_type);
  const result = await query(
    `UPDATE animals SET animal_type=$1, name_tag=$2, age=$3, gender=$4, weight=$5, color=$6, breed=$7,
     rfid_chip=$8, owner_id=$9, medical_history=$10, updated_at=NOW() WHERE id=$11 RETURNING *`,
    [speciesCode, data.name_tag, data.age, data.gender, data.weight, data.color, data.breed, data.rfid_chip, data.owner_id, data.medical_history, id]
  );
  const lifecycle = require('./report-lifecycle.service');
  await lifecycle.markReportsNeedsUpdateByAnimalId(id, 'ANIMAL');
  return result.rows[0];
};

const updateImage = async (id, imageUrl) => {
  await getById(id);
  const result = await query('UPDATE animals SET image_url = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [imageUrl, id]);
  const lifecycle = require('./report-lifecycle.service');
  await lifecycle.markReportsNeedsUpdateByAnimalId(id, 'ANIMAL');
  return result.rows[0];
};

const remove = async (id) => {
  await getById(id);
  await query('UPDATE animals SET is_active = false WHERE id = $1', [id]);
  return { message: 'Animal deactivated' };
};

const getResultTrends = async (animalId, { test_code, parameter_code } = {}) => {
  await getById(animalId);
  const params = [animalId];
  let testFilter = '';
  if (test_code) {
    params.push(test_code);
    testFilter = ` AND t.code = $${params.length}`;
  }
  let paramFilter = '';
  if (parameter_code) {
    params.push(parameter_code);
    paramFilter = ` AND tp.code = $${params.length}`;
  }

  const result = await query(
    `SELECT s.id AS sample_id, s.sample_code, s.completed_date,
            t.code AS test_code, t.name AS test_name, t.name_ar AS test_name_ar,
            tp.code AS parameter_code, tp.name AS parameter_name, tp.name_ar AS parameter_name_ar,
            tp.unit, rv.value, rv.numeric_value, rv.flag,
            trr.min_value AS ref_min, trr.max_value AS ref_max
     FROM samples s
     JOIN sample_tests st ON st.sample_id = s.id
     JOIN tests t ON t.id = st.test_id
     JOIN results res ON res.sample_test_id = st.id AND res.is_validated = true
     JOIN result_values rv ON rv.result_id = res.id
     JOIN test_parameters tp ON tp.id = rv.parameter_id
     JOIN animals a ON a.id = s.animal_id
     LEFT JOIN LATERAL (
       SELECT min_value, max_value FROM test_reference_ranges trr
       WHERE trr.parameter_id = tp.id AND trr.animal_type = a.animal_type
         AND (trr.is_active IS NULL OR trr.is_active = true)
       ORDER BY trr.id DESC LIMIT 1
     ) trr ON true
     WHERE s.animal_id = $1 AND s.status = 'completed'${testFilter}${paramFilter}
     ORDER BY s.completed_date ASC, tp.sort_order`,
    params
  );

  return result.rows;
};

module.exports = { list, getById, getHistory, create, update, updateImage, remove, getResultTrends };
