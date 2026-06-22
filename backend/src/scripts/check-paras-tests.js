require('dotenv').config();
const { pool } = require('../config/database');
pool.query(`
  SELECT t.code, t.is_active, tc.code AS category_code
  FROM tests t
  LEFT JOIN test_categories tc ON t.category_id = tc.id
  WHERE t.code LIKE 'PARAS%' OR tc.code IN ('PARAS', 'MICRO')
  ORDER BY t.code
`).then((r) => {
  console.log(r.rows);
  return pool.end();
});
