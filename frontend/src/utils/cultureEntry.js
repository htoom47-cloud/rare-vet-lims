/** Culture / smear AST helpers — active only when staff feature cultureAstReport is on. */

export const GROWTH_NO = 'No growth';
export const GROWTH_YES = 'Growth';

export const CULTURE_ANTIBIOTICS = [
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

export const GRAM_PRESETS = [
  'Gram-negative Bacilli',
  'Gram-positive Bacilli',
  'Gram-positive Cocci',
  'Gram-negative Cocci',
  'Mixed flora',
];

const PARASITE_EXCLUDE = /PARAS-|BRUCELLA|^BRU-ROSE|ELISA/i;
const CULTURE_NAME_RE = /مسح|تزريع|مزرعة|culture|smear/i;
const BLOOD_SMEAR_ONLY_RE = /طفيلي|parasite|blood smear|مسحة دم/i;
const UTERINE_OR_CULTURE_RE = /رحم|uterine|تزريع|culture|مزرعة/i;

export const isCultureTest = (test = {}) => {
  const code = String(test.test_code || test.code || '').toUpperCase();
  const cat = String(test.category_code || test.categoryCode || '').toUpperCase();
  const name = `${test.test_name || test.name || ''} ${test.test_name_ar || test.name_ar || ''}`;
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

const isNoGrowth = (value) => /^(no\s*growth|لا\s*نمو|negative|سلبي)$/i.test(String(value || '').trim());
const isGrowth = (value) => /^(growth|نمو|positive|إيجابي)$/i.test(String(value || '').trim());

const splitList = (value) => String(value || '')
  .split(/\r?\n|,|;/g)
  .map((v) => v.trim())
  .filter(Boolean);

const normalizeAbName = (name) => String(name || '').trim();

const uniqueAntibiotics = (names = []) => {
  const out = [];
  const seen = new Set();
  for (const raw of names) {
    const name = normalizeAbName(raw);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
};

const emptyAst = (antibiotics = CULTURE_ANTIBIOTICS) => (
  Object.fromEntries(antibiotics.map((ab) => [ab, '']))
);

export const emptyCultureForm = () => {
  const antibiotics = [...CULTURE_ANTIBIOTICS];
  return {
    specimen: '',
    growth: '',
    organism: '',
    gram: '',
    antibiotics,
    ast: emptyAst(antibiotics),
    notes: '',
  };
};

export const cultureFormFromFields = (fields = [], test = {}) => {
  const form = emptyCultureForm();
  const byCode = new Map((fields || []).map((p) => [String(p.code || '').toUpperCase(), p]));
  const growthField = byCode.get('GROWTH') || byCode.get('CEC') || byCode.get('RESULT');
  const rawGrowth = growthField?.value || '';
  if (isNoGrowth(rawGrowth)) form.growth = GROWTH_NO;
  else if (isGrowth(rawGrowth)) form.growth = GROWTH_YES;
  else if (rawGrowth) form.growth = GROWTH_YES;

  form.specimen = byCode.get('SPECIMEN')?.value || byCode.get('SAMPLE')?.value
    || test.test_name_ar || test.test_name || '';
  form.organism = byCode.get('ORGANISM')?.value || '';
  form.gram = byCode.get('GRAM')?.value || '';
  form.notes = byCode.get('CULT_NOTES')?.value || byCode.get('NOTES')?.value || '';

  const savedNames = [
    ...splitList(byCode.get('SENS_HIGH')?.value),
    ...splitList(byCode.get('SENS_WEAK')?.value),
    ...splitList(byCode.get('SENS_RES')?.value),
  ];
  form.antibiotics = uniqueAntibiotics([...CULTURE_ANTIBIOTICS, ...savedNames]);
  form.ast = emptyAst(form.antibiotics);

  const assign = (list, rank) => {
    for (const name of splitList(list)) {
      const match = form.antibiotics.find((ab) => ab.toLowerCase() === name.toLowerCase());
      if (match) form.ast[match] = rank;
    }
  };
  assign(byCode.get('SENS_HIGH')?.value, 'high');
  assign(byCode.get('SENS_WEAK')?.value, 'weak');
  assign(byCode.get('SENS_RES')?.value, 'res');
  return form;
};

const antibioticOrder = (form = emptyCultureForm()) => {
  if (Array.isArray(form.antibiotics) && form.antibiotics.length) {
    return uniqueAntibiotics(form.antibiotics);
  }
  return uniqueAntibiotics([
    ...CULTURE_ANTIBIOTICS,
    ...Object.keys(form.ast || {}),
  ]);
};

export const culturePayloadFromForm = (form = emptyCultureForm()) => {
  const highly = [];
  const weak = [];
  const resistant = [];
  for (const name of antibioticOrder(form)) {
    const rank = form.ast?.[name];
    if (rank === 'high') highly.push(name);
    else if (rank === 'weak') weak.push(name);
    else if (rank === 'res') resistant.push(name);
  }
  const noGrowth = form.growth === GROWTH_NO;
  return {
    specimen: String(form.specimen || '').trim(),
    growth: form.growth,
    organism: noGrowth ? '' : String(form.organism || '').trim(),
    gram: noGrowth ? '' : String(form.gram || '').trim(),
    highly_sensitive: noGrowth ? [] : highly,
    weak_sensitive: noGrowth ? [] : weak,
    resistant: noGrowth ? [] : resistant,
    notes: String(form.notes || '').trim(),
  };
};

export const cultureFormHasValue = (form) => {
  if (!form) return false;
  if (String(form.growth || '').trim()) return true;
  if (String(form.specimen || '').trim()) return true;
  if (String(form.organism || '').trim()) return true;
  if (String(form.gram || '').trim()) return true;
  if (String(form.notes || '').trim()) return true;
  return Object.values(form.ast || {}).some(Boolean);
};

export const addCultureAntibiotic = (form = emptyCultureForm(), name) => {
  const nextName = normalizeAbName(name);
  if (!nextName) return { form, error: 'empty' };
  const antibiotics = antibioticOrder(form);
  if (antibiotics.some((ab) => ab.toLowerCase() === nextName.toLowerCase())) {
    return { form, error: 'duplicate' };
  }
  return {
    form: {
      ...form,
      antibiotics: [...antibiotics, nextName],
      ast: { ...(form.ast || {}), [nextName]: '' },
    },
    error: null,
  };
};

export const removeCultureAntibiotic = (form = emptyCultureForm(), name) => {
  const target = normalizeAbName(name);
  const antibiotics = antibioticOrder(form).filter(
    (ab) => ab.toLowerCase() !== target.toLowerCase()
  );
  const ast = { ...(form.ast || {}) };
  for (const key of Object.keys(ast)) {
    if (key.toLowerCase() === target.toLowerCase()) delete ast[key];
  }
  return { ...form, antibiotics, ast };
};
