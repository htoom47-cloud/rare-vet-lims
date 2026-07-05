/**
 * Lookup customer by name or mobile for portal login troubleshooting.
 * Usage: node src/scripts/lookup-portal-customer.js "ثامر" 0549595505
 */
require('dotenv').config();
const { query, pool } = require('../config/database');
const { normalizeMobileDigits, mobileEqualsSql } = require('../utils/helpers');

const search = process.argv[2] || '';
const mobileArg = process.argv[3] || '';

(async () => {
  if (search) {
    const byName = await query(
      `SELECT id, full_name, full_name_ar, mobile, is_active, created_at
       FROM customers
       WHERE full_name ILIKE $1 OR full_name_ar ILIKE $1 OR farm_company ILIKE $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [`%${search}%`]
    );
    console.log('\nBy name search:', search);
    console.table(byName.rows.map((r) => ({
      ...r,
      mobile_digits: normalizeMobileDigits(r.mobile),
    })));
  }

  if (mobileArg) {
    const digits = normalizeMobileDigits(mobileArg);
    const byMobile = await query(
      `SELECT id, full_name, full_name_ar, mobile, is_active
       FROM customers
       WHERE ${mobileEqualsSql('mobile', 1)}`,
      [digits]
    );
    console.log('\nBy mobile (normalized):', digits);
    console.table(byMobile.rows.length ? byMobile.rows : [{ note: 'NO MATCH' }]);
  }

  await pool.end();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
