const isPositiveQual = (raw) => /^(positive|إيجابي|\+|pos|yes|نعم)$/i.test(raw);
const formatQualValue = (value, unit) => {
  if (unit !== 'qual' || !value) return value;
  if (isPositiveQual(value)) return 'Positive';
  if (/^(negative|سلبي|\-|neg|no|لا)$/i.test(value)) return 'Negative';
  return value;
};

const raw = 'Positive';
const unit = 'qual';
const normalized = formatQualValue(raw, unit);
console.log({ raw, unit, normalized, pos: isPositiveQual(normalized), neg: /^(negative)$/i.test(normalized) });

require('dotenv').config();
const { pool } = require('../config/database');

(async () => {
  const r = await pool.query(`SELECT id, unit, trim(unit) as tu FROM test_parameters WHERE name = 'Babesia'`);
  console.log('Babesia param:', r.rows[0]);
  const unitDb = r.rows[0]?.unit;
  console.log('unit === qual', unitDb === 'qual', JSON.stringify(unitDb));
  await pool.end();
})();
