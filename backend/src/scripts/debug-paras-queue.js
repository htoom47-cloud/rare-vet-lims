require('dotenv').config();
const samples = require('../services/samples.service');
const { pool } = require('../config/database');

async function main() {
  const codes = ['PARAS-BLOOD', 'PARAS-STOOL'];

  const sample = await pool.query(
    `SELECT id, sample_code, status FROM samples WHERE sample_code = $1`,
    ['SMP-260622-212628']
  );
  console.log('Sample:', sample.rows[0]);

  const queue = await samples.getParasitologyQueue();
  console.log('Queue count:', queue.length);
  console.log('Queue codes:', queue.map((s) => s.sample_code));

  const direct = await pool.query(
    `SELECT s.id, s.sample_code, s.status
     FROM samples s
     WHERE s.status IN ('received', 'running')
       AND EXISTS (
         SELECT 1 FROM sample_tests st
         JOIN tests t ON st.test_id = t.id
         WHERE st.sample_id = s.id AND t.code = ANY($1::text[])
       )`,
    [codes]
  );
  console.log('Direct SQL:', direct.rows);

  const direct2 = await pool.query(
    `SELECT s.id, s.sample_code, s.status
     FROM samples s
     WHERE s.status IN ('received', 'running')
       AND EXISTS (
         SELECT 1 FROM sample_tests st
         JOIN tests t ON st.test_id = t.id
         WHERE st.sample_id = s.id AND t.code IN ('PARAS-BLOOD', 'PARAS-STOOL')
       )`
  );
  console.log('Direct IN:', direct2.rows);

  const rv = await pool.query(
    `SELECT rv.value, rv.flag, tp.name, tp.unit, tp.id
     FROM result_values rv
     JOIN test_parameters tp ON tp.id = rv.parameter_id
     JOIN results r ON r.id = rv.result_id
     JOIN sample_tests st ON st.id = r.sample_test_id
     JOIN samples s ON s.id = st.sample_id
     WHERE s.sample_code = $1`,
    ['SMP-260622-212628']
  );
  console.log('Result values:', rv.rows);

  await pool.end();
}

main();
