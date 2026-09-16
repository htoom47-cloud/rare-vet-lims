const { query, getClient } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { uuidv4 } = require('../utils/uuid');
const { generateRandomAnimalCode, ANIMAL_CODE_LOCK } = require('../utils/helpers');
const { notDeleted } = require('../utils/soft-delete-sql');
const speciesService = require('./animal-species.service');
const entitlements = require('./entitlements.service');
const { GESTATION_DAYS, BREEDING_TYPES, BREEDING_OUTCOMES, GENDERS, NOTE_KINDS } = require('../constants/breeder');

const asIds = (ids) => (Array.isArray(ids) ? ids : [ids]).filter(Boolean);

const emptyToNull = (v) => {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string' && !v.trim()) return null;
  return v;
};

const addDays = (dateValue, days) => {
  if (!dateValue || !days) return null;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const gestationDaysFor = (animalType) => GESTATION_DAYS[String(animalType || '').toLowerCase()] || null;

const ageFromBirthDate = (birthDate) => {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (now.getDate() < d.getDate()) months -= 1;
  if (months < 0) return { years: 0, months: 0, total_months: 0 };
  return { years: Math.floor(months / 12), months: months % 12, total_months: months };
};

const mapAnimal = (row) => {
  if (!row) return null;
  const sireDisplay = row.sire_animal_name || row.sire_name || null;
  const damDisplay = row.dam_animal_name || row.dam_name || null;
  return {
    id: row.id,
    animal_code: row.animal_code,
    animal_type: row.animal_type,
    name_tag: row.name_tag,
    age: row.age,
    age_computed: ageFromBirthDate(row.birth_date),
    gender: row.gender,
    weight: row.weight,
    color: row.color,
    breed: row.breed,
    rfid_chip: row.rfid_chip,
    birth_date: row.birth_date,
    registration_number: row.registration_number,
    sire_id: row.sire_id,
    dam_id: row.dam_id,
    sire_name: row.sire_name,
    dam_name: row.dam_name,
    sire_display: sireDisplay,
    dam_display: damDisplay,
    has_photo: Boolean(row.image_url),
    vaccinations_due: parseInt(row.vaccinations_due, 10) || 0,
    vaccination_count: parseInt(row.vaccination_count, 10) || 0,
    pending_breeding: parseInt(row.pending_breeding, 10) || 0,
    offspring_count: parseInt(row.offspring_count, 10) || 0,
    is_mother: (parseInt(row.offspring_count, 10) || 0) > 0 || (parseInt(row.dam_children, 10) || 0) > 0,
    is_sire: row.gender === 'male' || (parseInt(row.sire_children, 10) || 0) > 0,
    is_offspring: Boolean(row.sire_id || row.dam_id) || (parseInt(row.birth_as_offspring, 10) || 0) > 0,
    created_at: row.created_at,
  };
};

const animalSelect = `
  SELECT a.*,
         sire.name_tag AS sire_animal_name,
         dam.name_tag AS dam_animal_name,
         (SELECT COUNT(*) FROM animal_vaccinations v
           WHERE v.animal_id = a.id AND v.deleted_at IS NULL
             AND v.next_due_at IS NOT NULL AND v.next_due_at <= (CURRENT_DATE + 14)) AS vaccinations_due,
         (SELECT COUNT(*) FROM animal_breeding_events b
           WHERE b.animal_id = a.id AND b.deleted_at IS NULL AND b.outcome = 'pending') AS pending_breeding,
         (SELECT COUNT(*) FROM animal_births br
           WHERE br.mother_id = a.id AND br.deleted_at IS NULL) AS offspring_count,
         (SELECT COUNT(*) FROM animal_vaccinations v
           WHERE v.animal_id = a.id AND v.deleted_at IS NULL) AS vaccination_count,
         (SELECT COUNT(*) FROM animals c
           WHERE c.dam_id = a.id AND c.is_active = true) AS dam_children,
         (SELECT COUNT(*) FROM animals c
           WHERE c.sire_id = a.id AND c.is_active = true) AS sire_children,
         (SELECT COUNT(*) FROM animal_births br
           WHERE br.offspring_id = a.id AND br.deleted_at IS NULL) AS birth_as_offspring
  FROM animals a
  LEFT JOIN animals sire ON sire.id = a.sire_id
  LEFT JOIN animals dam ON dam.id = a.dam_id
`;

const assertOwnedAnimal = async (animalId, customerIds, { includeInactive = false } = {}) => {
  const ids = asIds(customerIds);
  const result = await query(
    `${animalSelect}
     WHERE a.id = $1 AND a.owner_id = ANY($2::uuid[]) AND ${notDeleted('a')}
       ${includeInactive ? '' : 'AND a.is_active = true'}`,
    [animalId, ids]
  );
  if (!result.rows[0]) throw new AppError('Animal not found', 404, 'NOT_FOUND');
  return result.rows[0];
};

const assertHerdAccess = async (customerIds) => {
  await entitlements.requireBreederDashboard(customerIds);
};

const relatedAnimalOrNull = async (relatedId, customerIds) => {
  if (!relatedId) return null;
  const ids = asIds(customerIds);
  const result = await query(
    `SELECT id, name_tag, gender, animal_type FROM animals
     WHERE id = $1 AND owner_id = ANY($2::uuid[]) AND is_active = true AND ${notDeleted()}`,
    [relatedId, ids]
  );
  return result.rows[0] || null;
};

const listSpecies = async () => {
  const rows = await speciesService.listActive();
  return rows.map((r) => ({
    code: r.code,
    name_en: r.name_en,
    name_ar: r.name_ar,
  }));
};

const listHerd = async (customerIds) => {
  await assertHerdAccess(customerIds);
  const ids = asIds(customerIds);
  const result = await query(
    `${animalSelect}
     WHERE a.owner_id = ANY($1::uuid[]) AND a.is_active = true AND ${notDeleted('a')}
     ORDER BY a.created_at DESC`,
    [ids]
  );
  return result.rows.map(mapAnimal);
};

const getDashboard = async (customerIds) => {
  await assertHerdAccess(customerIds);
  const ids = asIds(customerIds);
  const animals = await listHerd(ids);

  const dueVacc = await query(
    `SELECT v.id, v.animal_id, v.vaccine_name, v.next_due_at, a.name_tag, a.animal_code, a.animal_type
     FROM animal_vaccinations v
     JOIN animals a ON a.id = v.animal_id
     WHERE a.owner_id = ANY($1::uuid[]) AND a.is_active = true AND ${notDeleted('a')}
       AND v.deleted_at IS NULL AND v.next_due_at IS NOT NULL
       AND v.next_due_at <= (CURRENT_DATE + 30)
     ORDER BY v.next_due_at ASC
     LIMIT 50`,
    [ids]
  );

  const expectedBirths = await query(
    `SELECT b.id, b.animal_id, b.event_date, b.expected_birth_date, b.sire_name, b.outcome,
            a.name_tag, a.animal_code, a.animal_type, sire.name_tag AS sire_animal_name
     FROM animal_breeding_events b
     JOIN animals a ON a.id = b.animal_id
     LEFT JOIN animals sire ON sire.id = b.sire_id
     WHERE a.owner_id = ANY($1::uuid[]) AND a.is_active = true AND ${notDeleted('a')}
       AND b.deleted_at IS NULL
       AND b.outcome IN ('pending', 'pregnant')
       AND b.expected_birth_date IS NOT NULL
       AND b.expected_birth_date >= (CURRENT_DATE - 14)
     ORDER BY b.expected_birth_date ASC
     LIMIT 50`,
    [ids]
  );

  const recentBirths = await query(
    `SELECT br.id, br.mother_id, br.birth_date, br.offspring_name, br.gender, br.father_name,
            a.name_tag AS mother_name, a.animal_code AS mother_code
     FROM animal_births br
     JOIN animals a ON a.id = br.mother_id
     WHERE a.owner_id = ANY($1::uuid[]) AND a.is_active = true AND ${notDeleted('a')}
       AND br.deleted_at IS NULL
     ORDER BY br.birth_date DESC
     LIMIT 10`,
    [ids]
  );

  const males = animals.filter((a) => a.gender === 'male').length;
  const females = animals.filter((a) => a.gender === 'female').length;

  return {
    stats: {
      animals: animals.length,
      males,
      females,
      vaccinations_due: dueVacc.rows.filter((r) => new Date(r.next_due_at) <= new Date()).length,
      vaccinations_upcoming: dueVacc.rows.length,
      expected_births: expectedBirths.rows.length,
      recent_births: recentBirths.rows.length,
    },
    due_vaccinations: dueVacc.rows,
    expected_births: expectedBirths.rows.map((r) => ({
      ...r,
      sire_display: r.sire_animal_name || r.sire_name || null,
    })),
    recent_births: recentBirths.rows,
    animals,
    species: await listSpecies(),
  };
};

const getAnimal = async (animalId, customerIds) => {
  await assertHerdAccess(customerIds);
  const row = await assertOwnedAnimal(animalId, customerIds);
  const [vaccinations, breeding, births, healthNotes, extraNotes, herdMales, herdFemales] = await Promise.all([
    listVaccinations(animalId, customerIds, { skipAccess: true }),
    listBreeding(animalId, customerIds, { skipAccess: true }),
    listBirths(animalId, customerIds, { skipAccess: true }),
    listHerdNotes(animalId, customerIds, 'health', { skipAccess: true }),
    listHerdNotes(animalId, customerIds, 'extra', { skipAccess: true }),
    query(
      `SELECT id, name_tag, animal_code, animal_type FROM animals
       WHERE owner_id = ANY($1::uuid[]) AND is_active = true AND gender = 'male' AND ${notDeleted()}
       ORDER BY name_tag NULLS LAST, animal_code`,
      [asIds(customerIds)]
    ),
    query(
      `SELECT id, name_tag, animal_code, animal_type FROM animals
       WHERE owner_id = ANY($1::uuid[]) AND is_active = true AND gender = 'female' AND ${notDeleted()}
       ORDER BY name_tag NULLS LAST, animal_code`,
      [asIds(customerIds)]
    ),
  ]);
  return {
    animal: mapAnimal(row),
    vaccinations,
    breeding,
    births,
    health_notes: healthNotes,
    extra_notes: extraNotes,
    sires: herdMales.rows,
    dams: herdFemales.rows,
    gestation_days: gestationDaysFor(row.animal_type),
  };
};

const profileFieldsFrom = (data, existing = {}) => {
  const gender = data.gender && GENDERS.includes(data.gender) ? data.gender : (existing.gender || 'unknown');
  return {
    name_tag: emptyToNull(data.name_tag) ?? existing.name_tag ?? null,
    age: emptyToNull(data.age) ?? existing.age ?? null,
    gender,
    weight: data.weight === '' || data.weight === undefined ? (existing.weight ?? null) : data.weight,
    color: emptyToNull(data.color) ?? existing.color ?? null,
    breed: emptyToNull(data.breed) ?? existing.breed ?? null,
    rfid_chip: emptyToNull(data.rfid_chip) ?? existing.rfid_chip ?? null,
    birth_date: data.birth_date === undefined ? (existing.birth_date ?? null) : emptyToNull(data.birth_date),
    registration_number: data.registration_number === undefined
      ? (existing.registration_number ?? null)
      : emptyToNull(data.registration_number),
    sire_id: data.sire_id === undefined ? (existing.sire_id ?? null) : emptyToNull(data.sire_id),
    dam_id: data.dam_id === undefined ? (existing.dam_id ?? null) : emptyToNull(data.dam_id),
    sire_name: data.sire_name === undefined ? (existing.sire_name ?? null) : emptyToNull(data.sire_name),
    dam_name: data.dam_name === undefined ? (existing.dam_name ?? null) : emptyToNull(data.dam_name),
  };
};

const createAnimal = async (customerIds, actorCustomerId, data) => {
  await assertHerdAccess(customerIds);
  const ownerId = actorCustomerId || asIds(customerIds)[0];
  const speciesCode = await speciesService.assertActiveSpecies(data.animal_type);
  const fields = profileFieldsFrom(data);
  if (fields.sire_id) {
    const sire = await relatedAnimalOrNull(fields.sire_id, customerIds);
    if (!sire) throw new AppError('Sire not found in your herd', 400, 'SIRE_NOT_FOUND');
  }
  if (fields.dam_id) {
    const dam = await relatedAnimalOrNull(fields.dam_id, customerIds);
    if (!dam) throw new AppError('Dam not found in your herd', 400, 'DAM_NOT_FOUND');
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [ANIMAL_CODE_LOCK]);
    const animalCode = await generateRandomAnimalCode(client.query.bind(client));
    const result = await client.query(
      `INSERT INTO animals (
         id, animal_code, animal_type, name_tag, age, gender, weight, color, breed, rfid_chip,
         owner_id, birth_date, registration_number, sire_id, dam_id, sire_name, dam_name
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        uuidv4(), animalCode, speciesCode, fields.name_tag, fields.age, fields.gender, fields.weight,
        fields.color, fields.breed, fields.rfid_chip, ownerId, fields.birth_date, fields.registration_number,
        fields.sire_id, fields.dam_id, fields.sire_name, fields.dam_name,
      ]
    );
    await client.query('COMMIT');
    return mapAnimal({ ...result.rows[0], vaccinations_due: 0, pending_breeding: 0, offspring_count: 0 });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
};

const updateAnimal = async (animalId, customerIds, data) => {
  await assertHerdAccess(customerIds);
  const existing = await assertOwnedAnimal(animalId, customerIds);
  const speciesCode = data.animal_type
    ? await speciesService.assertActiveSpecies(data.animal_type)
    : existing.animal_type;
  const fields = profileFieldsFrom(data, existing);
  if (fields.sire_id && fields.sire_id === animalId) {
    throw new AppError('Animal cannot be its own sire', 400, 'INVALID_SIRE');
  }
  if (fields.dam_id && fields.dam_id === animalId) {
    throw new AppError('Animal cannot be its own dam', 400, 'INVALID_DAM');
  }
  if (fields.sire_id) {
    const sire = await relatedAnimalOrNull(fields.sire_id, customerIds);
    if (!sire) throw new AppError('Sire not found in your herd', 400, 'SIRE_NOT_FOUND');
  }
  if (fields.dam_id) {
    const dam = await relatedAnimalOrNull(fields.dam_id, customerIds);
    if (!dam) throw new AppError('Dam not found in your herd', 400, 'DAM_NOT_FOUND');
  }

  const result = await query(
    `UPDATE animals SET
       animal_type=$1, name_tag=$2, age=$3, gender=$4, weight=$5, color=$6, breed=$7,
       rfid_chip=$8, birth_date=$9, registration_number=$10, sire_id=$11, dam_id=$12,
       sire_name=$13, dam_name=$14, updated_at=NOW()
     WHERE id=$15 RETURNING *`,
    [
      speciesCode, fields.name_tag, fields.age, fields.gender, fields.weight, fields.color, fields.breed,
      fields.rfid_chip, fields.birth_date, fields.registration_number, fields.sire_id, fields.dam_id,
      fields.sire_name, fields.dam_name, animalId,
    ]
  );
  return mapAnimal({ ...existing, ...result.rows[0] });
};

const deactivateAnimal = async (animalId, customerIds) => {
  await assertHerdAccess(customerIds);
  await assertOwnedAnimal(animalId, customerIds);
  const samples = await query(
    'SELECT 1 FROM samples WHERE animal_id = $1 LIMIT 1',
    [animalId]
  );
  if (samples.rows[0]) {
    throw new AppError(
      'This animal has laboratory samples and cannot be removed from the portal',
      409,
      'HAS_SAMPLES'
    );
  }
  await query('UPDATE animals SET is_active = false, updated_at = NOW() WHERE id = $1', [animalId]);
  return { deactivated: true };
};

const getImageUrl = async (animalId, customerIds) => {
  await assertHerdAccess(customerIds);
  const row = await assertOwnedAnimal(animalId, customerIds);
  if (!row.image_url) throw new AppError('Photo not found', 404, 'NOT_FOUND');
  return row.image_url;
};

const updatePhoto = async (animalId, customerIds, imageUrl) => {
  await assertHerdAccess(customerIds);
  await assertOwnedAnimal(animalId, customerIds);
  const result = await query(
    'UPDATE animals SET image_url = $1, updated_at = NOW() WHERE id = $2 RETURNING id, image_url',
    [imageUrl, animalId]
  );
  return { id: result.rows[0].id, has_photo: true };
};

const listVaccinations = async (animalId, customerIds, { skipAccess = false } = {}) => {
  if (!skipAccess) {
    await assertHerdAccess(customerIds);
    await assertOwnedAnimal(animalId, customerIds);
  }
  const result = await query(
    `SELECT * FROM animal_vaccinations
     WHERE animal_id = $1 AND deleted_at IS NULL
     ORDER BY administered_at DESC, created_at DESC`,
    [animalId]
  );
  return result.rows;
};

const createVaccination = async (animalId, customerIds, actorCustomerId, data) => {
  await assertHerdAccess(customerIds);
  await assertOwnedAnimal(animalId, customerIds);
  const vaccineName = emptyToNull(data.vaccine_name);
  if (!vaccineName) throw new AppError('Vaccine name is required', 400, 'VALIDATION');
  const administeredAt = emptyToNull(data.administered_at);
  if (!administeredAt) throw new AppError('Vaccination date is required', 400, 'VALIDATION');
  const result = await query(
    `INSERT INTO animal_vaccinations (
       id, animal_id, vaccine_name, batch_number, administered_at, next_due_at,
       administered_by, notes, created_by_customer
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      uuidv4(), animalId, vaccineName, emptyToNull(data.batch_number), administeredAt,
      emptyToNull(data.next_due_at), emptyToNull(data.administered_by), emptyToNull(data.notes),
      actorCustomerId || null,
    ]
  );
  return result.rows[0];
};

const getOwnedEvent = async (table, id, customerIds) => {
  const result = await query(
    `SELECT e.*, a.owner_id, a.id AS animal_id
     FROM ${table} e
     JOIN animals a ON a.id = e.animal_id
     WHERE e.id = $1 AND e.deleted_at IS NULL
       AND a.owner_id = ANY($2::uuid[]) AND a.is_active = true AND ${notDeleted('a')}`,
    [id, asIds(customerIds)]
  );
  if (!result.rows[0] && table === 'animal_births') {
    const viaMother = await query(
      `SELECT e.*, a.owner_id, a.id AS animal_id
       FROM animal_births e
       JOIN animals a ON a.id = e.mother_id
       WHERE e.id = $1 AND e.deleted_at IS NULL
         AND a.owner_id = ANY($2::uuid[]) AND a.is_active = true AND ${notDeleted('a')}`,
      [id, asIds(customerIds)]
    );
    if (!viaMother.rows[0]) throw new AppError('Record not found', 404, 'NOT_FOUND');
    return viaMother.rows[0];
  }
  if (!result.rows[0]) throw new AppError('Record not found', 404, 'NOT_FOUND');
  return result.rows[0];
};

const updateVaccination = async (id, customerIds, data) => {
  await assertHerdAccess(customerIds);
  await getOwnedEvent('animal_vaccinations', id, customerIds);
  const result = await query(
    `UPDATE animal_vaccinations SET
       vaccine_name = COALESCE($1, vaccine_name),
       batch_number = $2,
       administered_at = COALESCE($3, administered_at),
       next_due_at = $4,
       administered_by = $5,
       notes = $6,
       updated_at = NOW()
     WHERE id = $7 RETURNING *`,
    [
      emptyToNull(data.vaccine_name),
      emptyToNull(data.batch_number),
      emptyToNull(data.administered_at),
      emptyToNull(data.next_due_at),
      emptyToNull(data.administered_by),
      emptyToNull(data.notes),
      id,
    ]
  );
  return result.rows[0];
};

const removeVaccination = async (id, customerIds) => {
  await assertHerdAccess(customerIds);
  await getOwnedEvent('animal_vaccinations', id, customerIds);
  await query('UPDATE animal_vaccinations SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1', [id]);
  return { deleted: true };
};

const listBreeding = async (animalId, customerIds, { skipAccess = false } = {}) => {
  if (!skipAccess) {
    await assertHerdAccess(customerIds);
    await assertOwnedAnimal(animalId, customerIds);
  }
  const result = await query(
    `SELECT b.*, sire.name_tag AS sire_animal_name
     FROM animal_breeding_events b
     LEFT JOIN animals sire ON sire.id = b.sire_id
     WHERE b.animal_id = $1 AND b.deleted_at IS NULL
     ORDER BY b.event_date DESC, b.created_at DESC`,
    [animalId]
  );
  return result.rows.map((r) => ({ ...r, sire_display: r.sire_animal_name || r.sire_name || null }));
};

const resolveExpectedBirth = (animalType, eventDate, provided) => {
  if (provided) return provided;
  const days = gestationDaysFor(animalType);
  return addDays(eventDate, days);
};

const createBreeding = async (animalId, customerIds, actorCustomerId, data) => {
  await assertHerdAccess(customerIds);
  const animal = await assertOwnedAnimal(animalId, customerIds);
  const eventType = BREEDING_TYPES.includes(data.event_type) ? data.event_type : 'natural';
  const eventDate = emptyToNull(data.event_date);
  if (!eventDate) throw new AppError('Breeding date is required', 400, 'VALIDATION');
  const outcome = BREEDING_OUTCOMES.includes(data.outcome) ? data.outcome : 'pending';
  let sireId = emptyToNull(data.sire_id);
  if (sireId) {
    const sire = await relatedAnimalOrNull(sireId, customerIds);
    if (!sire) throw new AppError('Sire not found in your herd', 400, 'SIRE_NOT_FOUND');
  }
  const expected = resolveExpectedBirth(animal.animal_type, eventDate, emptyToNull(data.expected_birth_date));
  const result = await query(
    `INSERT INTO animal_breeding_events (
       id, animal_id, event_type, event_date, sire_id, sire_name, outcome,
       expected_birth_date, notes, created_by_customer
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [
      uuidv4(), animalId, eventType, eventDate, sireId, emptyToNull(data.sire_name), outcome,
      expected, emptyToNull(data.notes), actorCustomerId || null,
    ]
  );
  const row = result.rows[0];
  return { ...row, sire_display: row.sire_name || null };
};

const updateBreeding = async (id, customerIds, data) => {
  await assertHerdAccess(customerIds);
  const existing = await getOwnedEvent('animal_breeding_events', id, customerIds);
  const eventType = data.event_type && BREEDING_TYPES.includes(data.event_type) ? data.event_type : existing.event_type;
  const outcome = data.outcome && BREEDING_OUTCOMES.includes(data.outcome) ? data.outcome : existing.outcome;
  let sireId = data.sire_id === undefined ? existing.sire_id : emptyToNull(data.sire_id);
  if (sireId) {
    const sire = await relatedAnimalOrNull(sireId, customerIds);
    if (!sire) throw new AppError('Sire not found in your herd', 400, 'SIRE_NOT_FOUND');
  }
  const eventDate = emptyToNull(data.event_date) || existing.event_date;
  const animal = await assertOwnedAnimal(existing.animal_id, customerIds);
  const expected = data.expected_birth_date === undefined
    ? (existing.expected_birth_date || resolveExpectedBirth(animal.animal_type, eventDate, null))
    : emptyToNull(data.expected_birth_date);
  const result = await query(
    `UPDATE animal_breeding_events SET
       event_type=$1, event_date=$2, sire_id=$3, sire_name=$4, outcome=$5,
       expected_birth_date=$6, notes=$7, updated_at=NOW()
     WHERE id=$8 RETURNING *`,
    [
      eventType, eventDate, sireId,
      data.sire_name === undefined ? existing.sire_name : emptyToNull(data.sire_name),
      outcome, expected,
      data.notes === undefined ? existing.notes : emptyToNull(data.notes),
      id,
    ]
  );
  return result.rows[0];
};

const removeBreeding = async (id, customerIds) => {
  await assertHerdAccess(customerIds);
  await getOwnedEvent('animal_breeding_events', id, customerIds);
  await query('UPDATE animal_breeding_events SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1', [id]);
  return { deleted: true };
};

const listBirths = async (animalId, customerIds, { skipAccess = false } = {}) => {
  if (!skipAccess) {
    await assertHerdAccess(customerIds);
    await assertOwnedAnimal(animalId, customerIds);
  }
  const result = await query(
    `SELECT br.*, off.name_tag AS offspring_animal_name, off.animal_code AS offspring_code,
            father.name_tag AS father_animal_name
     FROM animal_births br
     LEFT JOIN animals off ON off.id = br.offspring_id
     LEFT JOIN animals father ON father.id = br.father_id
     WHERE (br.mother_id = $1 OR br.offspring_id = $1) AND br.deleted_at IS NULL
     ORDER BY br.birth_date DESC, br.created_at DESC`,
    [animalId]
  );
  return result.rows.map((r) => ({
    ...r,
    father_display: r.father_animal_name || r.father_name || null,
    offspring_display: r.offspring_animal_name || r.offspring_name || null,
  }));
};

const createBirth = async (animalId, customerIds, actorCustomerId, data) => {
  await assertHerdAccess(customerIds);
  const mother = await assertOwnedAnimal(animalId, customerIds);
  const birthDate = emptyToNull(data.birth_date);
  if (!birthDate) throw new AppError('Birth date is required', 400, 'VALIDATION');
  let fatherId = emptyToNull(data.father_id);
  if (fatherId) {
    const father = await relatedAnimalOrNull(fatherId, customerIds);
    if (!father) throw new AppError('Sire not found in your herd', 400, 'SIRE_NOT_FOUND');
  }
  let offspringId = emptyToNull(data.offspring_id);
  if (data.register_offspring === true && !offspringId) {
    const created = await createAnimal(customerIds, actorCustomerId, {
      animal_type: mother.animal_type,
      name_tag: emptyToNull(data.offspring_name),
      gender: GENDERS.includes(data.gender) ? data.gender : 'unknown',
      birth_date: birthDate,
      weight: emptyToNull(data.birth_weight),
      color: emptyToNull(data.color),
      dam_id: mother.id,
      sire_id: fatherId,
      sire_name: emptyToNull(data.father_name),
    });
    offspringId = created.id;
  } else if (offspringId) {
    const off = await relatedAnimalOrNull(offspringId, customerIds);
    if (!off) throw new AppError('Offspring not found in your herd', 400, 'OFFSPRING_NOT_FOUND');
  }

  const result = await query(
    `INSERT INTO animal_births (
       id, mother_id, father_id, father_name, offspring_id, offspring_name, birth_date,
       birth_weight, gender, complications, notes, breeding_event_id, created_by_customer, animal_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [
      uuidv4(), mother.id, fatherId, emptyToNull(data.father_name), offspringId,
      emptyToNull(data.offspring_name), birthDate, emptyToNull(data.birth_weight),
      GENDERS.includes(data.gender) ? data.gender : 'unknown',
      emptyToNull(data.complications), emptyToNull(data.notes), emptyToNull(data.breeding_event_id),
      actorCustomerId || null, mother.id,
    ]
  );
  return result.rows[0];
};

const updateBirth = async (id, customerIds, data) => {
  await assertHerdAccess(customerIds);
  const existing = await getOwnedEvent('animal_births', id, customerIds);
  let fatherId = data.father_id === undefined ? existing.father_id : emptyToNull(data.father_id);
  if (fatherId) {
    const father = await relatedAnimalOrNull(fatherId, customerIds);
    if (!father) throw new AppError('Sire not found in your herd', 400, 'SIRE_NOT_FOUND');
  }
  const result = await query(
    `UPDATE animal_births SET
       father_id=$1, father_name=$2, offspring_name=$3, birth_date=COALESCE($4, birth_date),
       birth_weight=$5, gender=$6, complications=$7, notes=$8, updated_at=NOW()
     WHERE id=$9 RETURNING *`,
    [
      fatherId,
      data.father_name === undefined ? existing.father_name : emptyToNull(data.father_name),
      data.offspring_name === undefined ? existing.offspring_name : emptyToNull(data.offspring_name),
      emptyToNull(data.birth_date),
      data.birth_weight === undefined ? existing.birth_weight : emptyToNull(data.birth_weight),
      data.gender && GENDERS.includes(data.gender) ? data.gender : existing.gender,
      data.complications === undefined ? existing.complications : emptyToNull(data.complications),
      data.notes === undefined ? existing.notes : emptyToNull(data.notes),
      id,
    ]
  );
  return result.rows[0];
};

const removeBirth = async (id, customerIds) => {
  await assertHerdAccess(customerIds);
  await getOwnedEvent('animal_births', id, customerIds);
  await query('UPDATE animal_births SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1', [id]);
  return { deleted: true };
};

const mapHerdNote = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    animal_id: row.animal_id,
    kind: row.kind,
    body: row.body,
    noted_at: row.noted_at,
    created_at: row.created_at,
  };
};

const listHerdNotes = async (animalId, customerIds, kind, { skipAccess = false } = {}) => {
  if (!skipAccess) {
    await assertHerdAccess(customerIds);
    await assertOwnedAnimal(animalId, customerIds);
  }
  const kinds = kind && NOTE_KINDS.includes(kind) ? [kind] : NOTE_KINDS;
  try {
    const result = await query(
      `SELECT id, animal_id, kind, body, noted_at, created_at
       FROM animal_herd_notes
       WHERE animal_id = $1 AND kind = ANY($2::text[]) AND deleted_at IS NULL
       ORDER BY noted_at DESC, created_at DESC`,
      [animalId, kinds]
    );
    return result.rows.map(mapHerdNote);
  } catch (err) {
    if (err.code === '42P01') return [];
    throw err;
  }
};

const createHerdNote = async (animalId, customerIds, actorCustomerId, data) => {
  await assertHerdAccess(customerIds);
  await assertOwnedAnimal(animalId, customerIds);
  const noteKind = NOTE_KINDS.includes(data.kind) ? data.kind : null;
  if (!noteKind) throw new AppError('Invalid note type', 400, 'VALIDATION');
  const body = emptyToNull(data.body);
  if (!body) throw new AppError('Note text is required', 400, 'VALIDATION');
  const notedAt = emptyToNull(data.noted_at) || new Date().toISOString().slice(0, 10);
  try {
    const result = await query(
      `INSERT INTO animal_herd_notes (id, animal_id, kind, body, noted_at, created_by_customer)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, animal_id, kind, body, noted_at, created_at`,
      [uuidv4(), animalId, noteKind, body, notedAt, actorCustomerId || null]
    );
    return mapHerdNote(result.rows[0]);
  } catch (err) {
    if (err.code === '42P01') throw new AppError('Herd notes are not available yet', 503, 'SCHEMA_OUTDATED');
    throw err;
  }
};

const removeHerdNote = async (id, customerIds) => {
  await assertHerdAccess(customerIds);
  await getOwnedEvent('animal_herd_notes', id, customerIds);
  await query('UPDATE animal_herd_notes SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1', [id]);
  return { deleted: true };
};

module.exports = {
  listSpecies,
  getDashboard,
  listHerd,
  getAnimal,
  createAnimal,
  updateAnimal,
  deactivateAnimal,
  getImageUrl,
  updatePhoto,
  listVaccinations,
  createVaccination,
  updateVaccination,
  removeVaccination,
  listBreeding,
  createBreeding,
  updateBreeding,
  removeBreeding,
  listBirths,
  createBirth,
  updateBirth,
  removeBirth,
  listHerdNotes,
  createHerdNote,
  removeHerdNote,
};
