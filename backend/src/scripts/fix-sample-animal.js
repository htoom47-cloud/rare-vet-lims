/**
 * Reassign a sample to the correct animal (fixes wrong animal_id at registration).
 * Usage: node src/scripts/fix-sample-animal.js <sample_code> <target_animal_code>
 */
require('dotenv').config();
const { query, pool } = require('../config/database');
const samplesService = require('../services/samples.service');

const sampleCode = process.argv[2];
const animalCode = process.argv[3];

if (!sampleCode || !animalCode) {
  console.error('Usage: node fix-sample-animal.js <sample_code> <target_animal_code>');
  process.exit(1);
}

(async () => {
  const sample = await query(
    `SELECT s.id, s.sample_code, a.animal_code AS current_animal_code, a.name_tag
     FROM samples s
     LEFT JOIN animals a ON a.id = s.animal_id
     WHERE s.sample_code = $1 OR s.barcode = $1`,
    [sampleCode]
  );
  if (!sample.rows[0]) {
    console.error('Sample not found:', sampleCode);
    process.exit(1);
  }

  const animal = await query(
    'SELECT id, animal_code, name_tag, owner_id FROM animals WHERE animal_code = $1',
    [animalCode]
  );
  if (!animal.rows[0]) {
    console.error('Animal not found:', animalCode);
    process.exit(1);
  }

  console.log('Sample:', sample.rows[0].sample_code);
  console.log('From:', sample.rows[0].current_animal_code, sample.rows[0].name_tag || '');
  console.log('To:', animal.rows[0].animal_code, animal.rows[0].name_tag || '');

  const admin = await query(`SELECT id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'admin' LIMIT 1`);
  const userId = admin.rows[0]?.id || null;

  const updated = await samplesService.reassignAnimal(
    sample.rows[0].id,
    animal.rows[0].id,
    userId,
    'admin',
    { ip: '127.0.0.1' }
  );
  console.log('OK — linked to', updated.animal_code, updated.animal_name || '');
  await pool.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
