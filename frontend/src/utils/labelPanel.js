/** Panel grouping + display text for barcode labels (50×25 mm). */

/** Short English codes printed on thermal labels (Zebra 50×25 mm). */
export const PANEL_CODES = {
  CBC: 'CBC',
  CHEM: 'CHEM',
  MICRO: 'PARAS',
  PARAS: 'PARAS',
  HORM: 'HORM',
  ELISA: 'ELISA',
  SERO: 'SERO',
  PCR: 'PCR',
  CULT: 'CULT',
  OTHER: 'LAB',
};

export const PANEL_LABELS = {
  CBC: { ar: 'تعداد الدم', en: 'CBC' },
  CHEM: { ar: 'كيمياء الدم', en: 'CHEM' },
  MICRO: { ar: 'طفيليات', en: 'PARAS' },
  HORM: { ar: 'هرمونات', en: 'HORM' },
  ELISA: { ar: 'ELISA', en: 'ELISA' },
  SERO: { ar: 'أمصال', en: 'SERO' },
  PCR: { ar: 'PCR', en: 'PCR' },
  CULT: { ar: 'مزارع', en: 'CULT' },
  OTHER: { ar: 'فحص مخبري', en: 'LAB' },
};

const PANEL_ORDER = {
  CBC: 0, CHEM: 1, HORM: 2, ELISA: 3, SERO: 4, PCR: 5, MICRO: 6, PARAS: 6, CULT: 7, OTHER: 99,
};

export const resolvePanelKey = (test) => {
  const cat = String(test?.category_code || '').toUpperCase();
  const code = String(test?.test_code || '').toUpperCase();

  if (cat === 'CBC' || /^CBC/.test(code)) return 'CBC';
  if (cat === 'CHEM' || cat === 'BIOCHEM' || /^CHEM/.test(code)) return 'CHEM';
  if (
    cat === 'MICRO' || cat === 'PARAS'
    || /^PARAS/.test(code) || /^BRU-/.test(code) || /^MICRO/.test(code)
  ) return 'MICRO';
  if (cat && cat !== 'OTHER') return cat;
  if (code) return code.split('-')[0];
  return 'OTHER';
};

export const panelCode = (panelKey) => {
  const key = String(panelKey || 'OTHER').toUpperCase();
  return PANEL_CODES[key] || key;
};

export const panelDisplayName = (panelKey, isArabic) => {
  if (!isArabic) return panelCode(panelKey);
  const key = String(panelKey || 'OTHER').toUpperCase();
  const entry = PANEL_LABELS[key] || PANEL_LABELS.OTHER;
  return entry.ar;
};

export const sortPanelKeys = (keys) => [...keys].sort((a, b) => {
  const oa = PANEL_ORDER[a] ?? 98;
  const ob = PANEL_ORDER[b] ?? 98;
  if (oa !== ob) return oa - ob;
  return a.localeCompare(b);
});

export const buildLabelLines = (sample, { isArabic = false, panelKey = null } = {}) => {
  const barcode = String(sample?.barcode || sample?.sample_code || '').trim();
  const animalLine = [sample?.animal_code, sample?.animal_name].filter(Boolean).join(' · ');

  let panel = panelKey;
  if (!panel && sample?.tests?.length) {
    panel = resolvePanelKey(sample.tests[0]);
  }
  const panelLine = panelCode(panel);

  const testLine = (sample?.tests || [])
    .map((t) => (isArabic ? t.test_name_ar : t.test_name) || t.test_name || t.test_code)
    .filter(Boolean)
    .join(' · ');

  return {
    barcode,
    panelKey: panel || 'OTHER',
    panelLine,
    animalLine,
    testLine,
    primaryLine: panelLine,
    secondaryLine: animalLine,
  };
};
