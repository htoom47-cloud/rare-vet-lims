/** Match sample by label scan — full code (BC-/SMP-) or digits-only from thermal barcode. */
const barcodeLookupSql = (prefix = '') => {
  const p = prefix ? `${prefix}.` : '';
  return `
    ${p}barcode = $1 OR ${p}sample_code = $1
    OR (
      length(regexp_replace($1, '[^0-9]', '', 'g')) >= 6
      AND regexp_replace(${p}barcode, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g')
    )
    OR (
      length(regexp_replace($1, '[^0-9]', '', 'g')) >= 6
      AND regexp_replace(${p}sample_code, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g')
    )
  `;
};

module.exports = { barcodeLookupSql };
