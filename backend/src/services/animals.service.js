const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { generateCode, paginate, buildPagination } = require('../utils/helpers');

const list = async ({ search, owner_id, animal_type, page, limit }) => {
  const { offset, page: p, limit: l } = paginate(page, limit);
  const params = [];
  let where = 'WHERE a.is_active = true';

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
  const animalCode = generateCode('ANM');
  const result = await query(
    `INSERT INTO animals (animal_code, animal_type, name_tag, age, gender, weight, color, rfid_chip, owner_id, medical_history, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [animalCode, data.animal_type, data.name_tag, data.age, data.gender, data.weight, data.color, data.rfid_chip, data.owner_id, data.medical_history, userId]
  );
  return result.rows[0];
};

const update = async (id, data) => {
  await getById(id);
  const result = await query(
    `UPDATE animals SET animal_type=$1, name_tag=$2, age=$3, gender=$4, weight=$5, color=$6,
     rfid_chip=$7, owner_id=$8, medical_history=$9, updated_at=NOW() WHERE id=$10 RETURNING *`,
    [data.animal_type, data.name_tag, data.age, data.gender, data.weight, data.color, data.rfid_chip, data.owner_id, data.medical_history, id]
  );
  return result.rows[0];
};

const updateImage = async (id, imageUrl) => {
  await getById(id);
  const result = await query('UPDATE animals SET image_url = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [imageUrl, id]);
  return result.rows[0];
};

const remove = async (id) => {
  await getById(id);
  await query('UPDATE animals SET is_active = false WHERE id = $1', [id]);
  return { message: 'Animal deactivated' };
};

module.exports = { list, getById, getHistory, create, update, updateImage, remove };
