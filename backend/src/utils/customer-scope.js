const { query } = require('../config/database');
const { normalizeMobileDigits, sqlNormalizeMobileDigits } = require('./helpers');

/** Active customer IDs sharing the same mobile (exact normalized or last 9 digits). */
const resolveCustomerIdsByMobile = async (customerId) => {
  if (!customerId) return [];

  const base = await query(
    'SELECT id, mobile FROM customers WHERE id = $1 AND is_active = true',
    [customerId]
  );
  if (!base.rows[0]) return [customerId];

  const digits = normalizeMobileDigits(base.rows[0].mobile);
  if (digits.length < 9) return [customerId];

  const suffix = digits.slice(-9);
  const norm = sqlNormalizeMobileDigits('mobile');
  const result = await query(
    `SELECT id FROM customers
     WHERE is_active = true
       AND (
         ${norm} = $1
         OR RIGHT(regexp_replace(mobile, '[^0-9]', '', 'g'), 9) = $2
       )
     ORDER BY created_at DESC`,
    [digits, suffix]
  );

  const ids = result.rows.map((r) => r.id);
  if (!ids.includes(customerId)) ids.unshift(customerId);
  return ids.length ? ids : [customerId];
};

module.exports = { resolveCustomerIdsByMobile };
