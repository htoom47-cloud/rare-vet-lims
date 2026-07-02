/** Match sample by scan — exact digits, legacy BC-/SMP-, or digits-only from thermal barcode. */
const barcodeLookupSql = (prefix = '') => {
  const p = prefix ? `${prefix}.` : '';
  return `
    ${p}barcode = $1 OR ${p}sample_code = $1
    OR (
      length(regexp_replace($1, '[^0-9]', '', 'g')) >= 10
      AND regexp_replace(${p}barcode, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g')
    )
    OR (
      length(regexp_replace($1, '[^0-9]', '', 'g')) >= 10
      AND regexp_replace(${p}sample_code, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g')
    )
  `;
};

/** Prefer exact match, then barcode digits, then sample_code digits (legacy BC/SMP split). */
const barcodeLookupOrderSql = (prefix = 's') => `
  CASE
    WHEN ${prefix}.barcode = $1 OR ${prefix}.sample_code = $1 THEN 0
    WHEN regexp_replace(${prefix}.barcode, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g')
      AND length(regexp_replace($1, '[^0-9]', '', 'g')) >= 10 THEN 1
    WHEN regexp_replace(${prefix}.sample_code, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g')
      AND length(regexp_replace($1, '[^0-9]', '', 'g')) >= 10 THEN 2
    ELSE 3
  END,
  ${prefix}.created_at DESC
`;

module.exports = { barcodeLookupSql, barcodeLookupOrderSql };
