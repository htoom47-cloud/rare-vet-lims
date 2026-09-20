const { query } = require('../config/database');
const { UREA_LIMS_CODES, isUreaLimsCode } = require('./diasys-chem-map');

/**
 * CHEM-BASIC urea row as shown in LIMS (UR / UREA / BUN).
 * Prefers the active catalog code the workbench displays over a hidden BUN leftover.
 */
const findChemUreaParameter = async (testCode) => {
  if (!testCode) return null;
  const result = await query(
    `SELECT tp.id, tp.code, tp.name, tp.unit, tp.decimal_places
     FROM test_parameters tp
     JOIN tests t ON tp.test_id = t.id
     WHERE t.code = $1
       AND tp.is_active = true
       AND (
         UPPER(tp.code) = ANY($2::text[])
         OR UPPER(COALESCE(tp.short_code, '')) = ANY($2::text[])
         OR UPPER(COALESCE(tp.device_code, '')) = ANY($2::text[])
         OR UPPER(TRIM(tp.name)) IN ('UREA', 'BUN', 'UR')
         OR TRIM(tp.name_ar) IN ('اليوريا', 'يوريا')
       )
     ORDER BY
       CASE WHEN COALESCE(tp.show_in_report, true) = false THEN 1 ELSE 0 END,
       CASE UPPER(tp.code)
         WHEN 'UR' THEN 0
         WHEN 'UREA' THEN 1
         WHEN 'URE' THEN 2
         WHEN 'BUN' THEN 3
         ELSE 4
       END,
       tp.sort_order NULLS LAST
     LIMIT 1`,
    [testCode, UREA_LIMS_CODES]
  );
  return result.rows[0] || null;
};

module.exports = {
  UREA_LIMS_CODES,
  isUreaLimsCode,
  findChemUreaParameter,
};
