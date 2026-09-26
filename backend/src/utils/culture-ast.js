/**
 * Bacterial culture / smear + antibiotic sensitivity.
 * Used only when CULTURE_AST_REPORT=true. Does not mutate non-culture tests.
 */

const GROWTH_NO = 'No growth';
const GROWTH_YES = 'Growth';

const CULTURE_ANTIBIOTICS = [
  'Enrofloxacin',
  'Ciprofloxacin',
  'Gentamycin',
  'Neomycin',
  'Tobramycin',
  'Chloramphenicol',
  'Spiramycin',
  'Doxycycline',
  'Oxytetracycline',
  'Ampicillin',
  'Amoxicillin',
  'Penicillin',
  'Streptomycin',
  'Erythromycin',
];

const CULTURE_PARAM_DEFS = [
  { code: 'SPECIMEN', name: 'Sample', name_ar: 'نوع العينة' },
  { code: 'GROWTH', name: 'Culture Result', name_ar: 'نتيجة المزرعة' },
  { code: 'ORGANISM', name: 'Organism', name_ar: 'الكائن المعزول' },
  { code: 'GRAM', name: 'Gram Stain', name_ar: 'صبغة جرام' },
  { code: 'SENS_HIGH', name: 'Highly Sensitive', name_ar: 'حساس جداً' },
  { code: 'SENS_WEAK', name: 'Weakly Sensitive', name_ar: 'ضعيف الحساسية' },
  { code: 'SENS_RES', name: 'Resistant', name_ar: 'مقاوم' },
  { code: 'CULT_NOTES', name: 'Comments', name_ar: 'ملاحظات' },
];

const SENS_CODES = {
  high: 'SENS_HIGH',
  weak: 'SENS_WEAK',
  res: 'SENS_RES',
};

const PARASITE_EXCLUDE = /PARAS-|BRUCELLA|^BRU-ROSE|ELISA/i;
const CULTURE_NAME_RE = /مسح|تزريع|مزرعة|culture|smear/i;
const BLOOD_SMEAR_ONLY_RE = /طفيلي|parasite|blood smear|مسحة دم/i;
const UTERINE_OR_CULTURE_RE = /رحم|uterine|تزريع|culture|مزرعة/i;

const testCodeOf = (test = {}) => String(
  test.test_code || test.testCode || test.code || ''
).toUpperCase();

const categoryOf = (test = {}) => String(
  test.category_code || test.categoryCode || ''
).toUpperCase();

const nameOf = (test = {}) => [
  test.test_name,
  test.name,
  test.test_name_ar,
  test.name_ar,
  test.testNameAr,
  test.testNameEn,
].filter(Boolean).join(' ');

const isCultureTest = (test = {}) => {
  const code = testCodeOf(test);
  const cat = categoryOf(test);
  const name = nameOf(test);
  if (PARASITE_EXCLUDE.test(code)) return false;
  if (cat === 'CULT') return true;
  if (/CULT|SMEAR/.test(code)) return true;
  if (CULTURE_NAME_RE.test(name)) {
    if (cat === 'MICRO' && BLOOD_SMEAR_ONLY_RE.test(name) && !UTERINE_OR_CULTURE_RE.test(name)) {
      return false;
    }
    return true;
  }
  return false;
};

const isCultureRow = (row = {}) => isCultureTest({
  test_code: row.testCode || row.test_code,
  category_code: row.categoryCode || row.category_code,
  test_name: row.testNameEn || row.test_name,
  test_name_ar: row.testNameAr || row.test_name_ar,
});

const isNoGrowthValue = (value) => {
  const v = String(value || '').trim();
  if (!v) return false;
  return /^(no\s*growth|لا\s*نمو|negative|سلبي)$/i.test(v);
};

const isGrowthValue = (value) => {
  const v = String(value || '').trim();
  if (!v) return false;
  if (isNoGrowthValue(v)) return false;
  return /^(growth|نمو|positive|إيجابي)$/i.test(v);
};

const normalizeGrowth = (value) => {
  if (isNoGrowthValue(value)) return GROWTH_NO;
  if (isGrowthValue(value)) return GROWTH_YES;
  return String(value || '').trim();
};

const splitAntibioticList = (value) => {
  if (Array.isArray(value)) {
    return [...new Set(value.map((v) => String(v || '').trim()).filter(Boolean))];
  }
  return [...new Set(String(value || '')
    .split(/\r?\n|,|;/g)
    .map((v) => v.trim())
    .filter(Boolean))];
};

const joinAntibioticList = (list) => splitAntibioticList(list).join('\n');

const rowParamCode = (row = {}) => String(row.systemCode || row.code || row.parameter_code || '').toUpperCase();

const pickRowByCodes = (rows, codes) => {
  const want = codes.map((c) => String(c).toUpperCase());
  return (rows || []).find((r) => want.includes(rowParamCode(r))) || null;
};

const rowValue = (row) => (row ? String(row.value ?? '').trim() : '');

const hasCulturePayload = (culture) => {
  if (!culture || typeof culture !== 'object') return false;
  if (String(culture.growth || '').trim()) return true;
  if (String(culture.specimen || '').trim()) return true;
  if (String(culture.organism || '').trim()) return true;
  if (String(culture.gram || '').trim()) return true;
  if (String(culture.notes || '').trim()) return true;
  return splitAntibioticList(culture.highly_sensitive).length > 0
    || splitAntibioticList(culture.weak_sensitive).length > 0
    || splitAntibioticList(culture.resistant).length > 0;
};

const resolveGrowthCode = (byCode) => {
  if (byCode.has('GROWTH')) return 'GROWTH';
  if (byCode.has('CEC')) return 'CEC';
  return 'GROWTH';
};

const ensureCultureParameters = async (client, testId) => {
  const existing = await client.query(
    `SELECT id, code, sort_order FROM test_parameters WHERE test_id = $1`,
    [testId]
  );
  const byCode = new Map(
    existing.rows.map((r) => [String(r.code || '').toUpperCase(), r])
  );
  let nextSort = existing.rows.reduce((max, r) => (
    Number.isFinite(Number(r.sort_order)) ? Math.max(max, Number(r.sort_order)) : max
  ), -1) + 1;

  const growthCode = resolveGrowthCode(byCode);

  for (const def of CULTURE_PARAM_DEFS) {
    const code = def.code === 'GROWTH' ? growthCode : def.code;
    if (byCode.has(code)) continue;
    const inserted = await client.query(
      `INSERT INTO test_parameters (test_id, code, name, name_ar, unit, value_type, sort_order)
       VALUES ($1, $2, $3, $4, $5, 'text', $6)
       RETURNING id, code, sort_order`,
      [testId, code, def.name, def.name_ar, '', nextSort]
    );
    nextSort += 1;
    byCode.set(code, inserted.rows[0]);
  }

  return { byCode, growthCode };
};

const mapCultureToValues = (culture, { byCode, growthCode }) => {
  const noGrowth = isNoGrowthValue(culture.growth);
  const pairs = [
    ['SPECIMEN', culture.specimen],
    [growthCode, normalizeGrowth(culture.growth) || culture.growth],
    ['ORGANISM', noGrowth ? '' : culture.organism],
    ['GRAM', noGrowth ? '' : culture.gram],
    [SENS_CODES.high, noGrowth ? '' : joinAntibioticList(culture.highly_sensitive)],
    [SENS_CODES.weak, noGrowth ? '' : joinAntibioticList(culture.weak_sensitive)],
    [SENS_CODES.res, noGrowth ? '' : joinAntibioticList(culture.resistant)],
    ['CULT_NOTES', culture.notes],
  ];

  const values = [];
  for (const [code, raw] of pairs) {
    const param = byCode.get(String(code).toUpperCase());
    const value = String(raw ?? '').trim();
    if (!param?.id || !value) continue;
    values.push({ parameter_id: param.id, value });
  }
  return values;
};

module.exports = {
  GROWTH_NO,
  GROWTH_YES,
  CULTURE_ANTIBIOTICS,
  CULTURE_PARAM_DEFS,
  SENS_CODES,
  isCultureTest,
  isCultureRow,
  isNoGrowthValue,
  isGrowthValue,
  normalizeGrowth,
  splitAntibioticList,
  joinAntibioticList,
  pickRowByCodes,
  rowValue,
  rowParamCode,
  hasCulturePayload,
  resolveGrowthCode,
  ensureCultureParameters,
  mapCultureToValues,
};
