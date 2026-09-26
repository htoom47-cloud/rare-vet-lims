/**
 * Culture / smear report cards — used only when sectionType is culture.
 * Backward compatible: a single GROWTH / CEC "No growth" row still builds a card.
 */

const {
  isCultureRow,
  isNoGrowthValue,
  isGrowthValue,
  normalizeGrowth,
  splitAntibioticList,
  pickRowByCodes,
  rowValue,
} = require('./culture-ast');

const displayGrowth = (value, lang) => {
  const normalized = normalizeGrowth(value);
  if (isNoGrowthValue(normalized)) return lang === 'ar' ? 'لا نمو' : 'No growth';
  if (normalized === 'Growth') return lang === 'ar' ? 'نمو' : 'Growth';
  return String(value || '').trim() || '—';
};

const testTitle = (rows, lang) => {
  const row = (rows || [])[0] || {};
  if (lang === 'ar') {
    return row.testNameAr || row.testNameEn || row.testCode || '';
  }
  return row.testNameEn || row.testNameAr || row.testCode || '';
};

const buildCultureCard = (rows = [], lang = 'ar') => {
  if (!rows.length) return null;
  const specimenRow = pickRowByCodes(rows, ['SPECIMEN', 'SAMPLE']);
  const growthRow = pickRowByCodes(rows, ['GROWTH', 'CEC', 'RESULT']);
  const organismRow = pickRowByCodes(rows, ['ORGANISM']);
  const gramRow = pickRowByCodes(rows, ['GRAM']);
  const highRow = pickRowByCodes(rows, ['SENS_HIGH']);
  const weakRow = pickRowByCodes(rows, ['SENS_WEAK']);
  const resRow = pickRowByCodes(rows, ['SENS_RES']);
  const notesRow = pickRowByCodes(rows, ['CULT_NOTES', 'NOTES']);

  const mapped = new Set([
    specimenRow, growthRow, organismRow, gramRow, highRow, weakRow, resRow, notesRow,
  ].filter(Boolean));
  const leftover = (rows || []).filter((r) => !mapped.has(r));

  const growthRaw = rowValue(growthRow) || rowValue(leftover[0]);
  const noGrowth = isNoGrowthValue(growthRaw);
  const specimenRaw = rowValue(specimenRow);
  const title = testTitle(rows, lang);
  const specimen = specimenRaw || (noGrowth ? '' : (title || '—'));
  const leftoverOrganism = !growthRow && leftover[0] && !isNoGrowthValue(growthRaw) && !isGrowthValue(growthRaw)
    ? growthRaw
    : '';
  const organism = noGrowth
    ? ''
    : (rowValue(organismRow) || leftoverOrganism);
  const gram = noGrowth ? '' : rowValue(gramRow);
  const highly = noGrowth ? [] : splitAntibioticList(rowValue(highRow));
  const weak = noGrowth ? [] : splitAntibioticList(rowValue(weakRow));
  const resistant = noGrowth ? [] : splitAntibioticList(rowValue(resRow));
  const notes = rowValue(notesRow);
  const extraText = leftover
    .slice(growthRow ? 0 : 1)
    .map((r) => rowValue(r))
    .filter(Boolean);

  return {
    title,
    specimen,
    hasSpecimen: Boolean(specimenRaw),
    growth: displayGrowth(growthRaw, lang),
    growthRaw,
    noGrowth,
    organism,
    gram,
    highly,
    weak,
    resistant,
    notes,
    extra: extraText,
    hasAst: highly.length + weak.length + resistant.length > 0,
  };
};

const groupRowsByTest = (results = []) => {
  const map = new Map();
  for (const row of results || []) {
    const key = row.testCode || row.testNameEn || row.testNameAr || 'CULT';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return [...map.values()];
};

const buildCultureCards = (results = [], lang = 'ar') => (
  groupRowsByTest(results).map((rows) => buildCultureCard(rows, lang)).filter(Boolean)
);

const splitCultureSectionResults = (results = []) => {
  const culture = [];
  const other = [];
  for (const row of results || []) {
    if (isCultureRow(row)) culture.push(row);
    else other.push(row);
  }
  return { culture, other };
};

const isCultureRecommendationDuplicate = (text, results = []) => {
  const rec = String(text || '').trim();
  if (!rec) return false;
  return (results || []).some((row) => {
    if (!isCultureRow(row)) return false;
    const val = String(row.value || '').trim();
    return val && val.toLowerCase() === rec.toLowerCase();
  });
};

module.exports = {
  displayGrowth,
  buildCultureCard,
  buildCultureCards,
  splitCultureSectionResults,
  isCultureRecommendationDuplicate,
};
