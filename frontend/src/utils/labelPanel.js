/** Panel grouping + display text for barcode labels (50×25 mm). */
import {
  displaySampleId,
  encodeCode128C,
  extractDigits,
} from './barcodeScan';
import { speciesLabel, speciesLabelForZpl } from './speciesLabels';

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
  CHEM: { ar: 'كيمياء الدم', en: 'Chemistry' },
  MICRO: { ar: 'طفيليات', en: 'Parasites' },
  HORM: { ar: 'هرمونات', en: 'Hormone' },
  ELISA: { ar: 'ELISA', en: 'ELISA' },
  SERO: { ar: 'أمصال', en: 'Serology' },
  PCR: { ar: 'PCR', en: 'PCR' },
  CULT: { ar: 'مزارع', en: 'Culture' },
  OTHER: { ar: 'أخرى', en: 'Other' },
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
  const barcode = displaySampleId(sample?.sample_code || sample?.barcode);
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

/** Human-readable digits under barcode — matches Norma / LIMS (no Code128-C pad). */
export const barcodeDisplayDigits = (barcode) => displaySampleId(barcode);

/** Code128-C value for thermal printers and HTML preview. */
export const barcodeEncodeDigits = (barcode) => encodeCode128C(barcode);

/** Truncate with ... suffix for 50 mm thermal labels. */
export const truncateLabel = (text, max) => {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(1, max - 3))}...`;
};

const PANEL_FRIENDLY_EN = {
  CBC: 'CBC',
  CHEM: 'Chemistry',
  MICRO: 'Parasites',
  PARAS: 'Parasites',
  HORM: 'Hormone',
  ELISA: 'ELISA',
  SERO: 'Serology',
  PCR: 'PCR',
  CULT: 'Culture',
  OTHER: 'Other',
};

export const panelFriendlyName = (panelKey, langOrOptions = false) => {
  const key = String(panelKey || 'OTHER').toUpperCase();
  const isArabic = typeof langOrOptions === 'object'
    ? Boolean(langOrOptions?.isArabic)
    : Boolean(langOrOptions);
  if (isArabic) return panelDisplayName(key, true);
  return PANEL_FRIENDLY_EN[key] || panelCode(key);
};

/** Join panel names for label test line — e.g. "CBC + Chemistry". */
export const formatTestsForLabel = (sample, langOrOptions = false) => {
  const isArabic = typeof langOrOptions === 'object'
    ? Boolean(langOrOptions?.isArabic)
    : Boolean(langOrOptions);
  if (sample?.panelKey) {
    return panelFriendlyName(sample.panelKey, isArabic);
  }
  const tests = sample?.tests?.filter(Boolean) || [];
  if (!tests.length) {
    return panelFriendlyName(sample?.panelKey, isArabic);
  }
  const keys = sortPanelKeys([...new Set(tests.map((t) => resolvePanelKey(t)))]);
  return keys.map((k) => panelFriendlyName(k, isArabic)).join(' + ');
};

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

export const hasArabicText = (text) => ARABIC_RE.test(String(text || ''));

/** Strip non-Latin text — used for ASCII-only ZPL fields (not animal name line). */
export const asciiLabelText = (text) => {
  const s = String(text || '').trim();
  if (!s || ARABIC_RE.test(s)) return '';
  return s;
};

/**
 * Bottom label line: animal type + animal name on one line.
 * Name is taken as stored (name_tag / animal_name) — no translation.
 * Type uses Arabic species label when arabic=true.
 */
export const buildAnimalTypeAndNameLine = (sample, { arabic = true } = {}) => {
  const type = arabic
    ? speciesLabel(sample?.animal_type, true)
    : speciesLabelForZpl(sample?.animal_type);
  const name = String(sample?.animal_name || sample?.name_tag || '').trim();
  return [type, name].filter(Boolean).join(' · ');
};

/** Code128 scan value — prefer 12-digit barcode column; fall back to sample ID digits. */
export const barcodeScanValue = (sample) => {
  const scan = displaySampleId(sample?.barcode);
  if (scan && extractDigits(scan).length >= 8) return scan;
  const fromCode = displaySampleId(sample?.sample_code);
  if (fromCode && extractDigits(fromCode).length >= 8) return fromCode;
  return scan || fromCode || '';
};

/** Sequential sample ID shown on label (e.g. 26000003). */
export const sampleDisplayId = (sample) => {
  const code = String(sample?.sample_code || '').replace(/\D/g, '');
  if (code) return code;
  return displaySampleId(sample?.barcode);
};

export const labelHasValidBarcode = (sample) => {
  const barcode = barcodeScanValue(sample);
  const encode = encodeCode128C(barcode);
  return Boolean(barcode && extractDigits(encode).length >= 8);
};

const buildLabelContentCore = (sample, { isArabic = false, englishOnly = false } = {}) => {
  const barcode = barcodeScanValue(sample);
  const sampleId = sampleDisplayId(sample);
  const testLine = formatTestsForLabel(sample, englishOnly ? false : isArabic);
  // Animal line: type + name (Arabic as stored) — never ascii-strip the name
  const animalRaw = buildAnimalTypeAndNameLine(sample, { arabic: true });

  const sampleLine = sampleId
    ? (englishOnly || !isArabic ? `Sample ${sampleId}` : `عينة ${sampleId}`)
    : '';

  const sanitize = (text) => (englishOnly ? (asciiLabelText(text) || '') : text);

  return {
    barcode,
    barcodeDigits: barcode,
    barcodeEncode: encodeCode128C(barcode),
    sampleLine: sampleLine ? truncateLabel(sanitize(sampleLine), 28) : '',
    testLine: testLine ? truncateLabel(sanitize(testLine), 28) : '',
    animalTypeLine: animalRaw ? truncateLabel(animalRaw, 36) : '',
    animalLineHasArabic: hasArabicText(animalRaw),
    sampleCode: sampleId,
  };
};

/**
 * Label content for Zebra native ASCII ZPL (English UI).
 * Sample/test stay English ASCII; animal line is type + name in Arabic (as stored).
 * Arabic UI uses graphic ZPL instead (see zebraLabelImage.js).
 */
export const buildZebraThermalLabelContent = (sample) => (
  buildLabelContentCore(sample, { englishOnly: true })
);

/** HTML / browser preview — may use Arabic test labels when UI is Arabic. */
export const buildThermalLabelContent = (sample, { isArabic = false } = {}) => (
  buildLabelContentCore(sample, { isArabic })
);
