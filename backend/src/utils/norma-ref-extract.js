const { resolveNormaResultLimsCode } = require('./norma-cbc-map');
const { defaultCritical } = require('./reference-range');

/** Build { CODE: { min, max, crit_low, crit_high } } from parsed Norma OBX rows. */
const extractRefProfileFromResults = (results = []) => {
  const profile = {};
  for (const row of results) {
    const limsCode = resolveNormaResultLimsCode(row);
    if (!limsCode) continue;
    if (row.referenceMin == null || row.referenceMax == null) continue;
    const min = Number(row.referenceMin);
    const max = Number(row.referenceMax);
    if (Number.isNaN(min) || Number.isNaN(max)) continue;
    const crit = defaultCritical(min, max);
    profile[limsCode] = {
      min,
      max,
      crit_low: crit.crit_low,
      crit_high: crit.crit_high,
      reference: row.reference || `${min}-${max}`,
      unit: row.unit || null,
    };
  }
  return profile;
};

const countRefsInResults = (results = []) =>
  results.filter((r) => r.referenceMin != null && r.referenceMax != null).length;

module.exports = { extractRefProfileFromResults, countRefsInResults };
