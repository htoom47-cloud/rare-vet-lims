/** Panel grouping + display text for barcode labels (50×25 mm). */
import {
  displaySampleId,
  encodeCode128C,
} from './barcodeScan';
import { animalTypeLabel } from '../constants/animalTypes';

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
  MICRO: 'Parasitology',
  PARAS: 'Parasitology',
  HORM: 'Hormones',
  ELISA: 'ELISA',
  SERO: 'Serology',
  PCR: 'PCR',
  CULT: 'Culture',
  OTHER: 'Lab',
};

export const panelFriendlyName = (panelKey, isArabic = false) => {
  const key = String(panelKey || 'OTHER').toUpperCase();
  if (isArabic) return panelDisplayName(key, true);
  return PANEL_FRIENDLY_EN[key] || panelCode(key);
};

/** Join panel names for label test line — e.g. "CBC + Chemistry". */
export const formatTestsForLabel = (sample, { isArabic = false } = {}) => {
  const tests = sample?.tests?.filter(Boolean) || [];
  if (!tests.length) {
    return panelFriendlyName(sample?.panelKey, isArabic);
  }
  const keys = sortPanelKeys([...new Set(tests.map((t) => resolvePanelKey(t)))]);
  return keys.map((k) => panelFriendlyName(k, isArabic)).join(' + ');
};

/** Full thermal label text blocks (Zebra + HTML preview) — matches barcode-engine.service.js */
export const buildThermalLabelContent = (sample, { isArabic = false } = {}) => {
  const id = displaySampleId(sample?.sample_code || sample?.barcode);
  const samplePrefix = isArabic ? 'رقم العينة' : 'Sample ID';
  const customerPrefix = isArabic ? 'العميل' : 'Client';
  const animalPrefix = isArabic ? 'الحيوان' : 'Animal';
  const typePrefix = isArabic ? 'النوع' : 'Type';
  const datePrefix = isArabic ? 'التاريخ' : 'Date';
  const testPrefix = isArabic ? 'الفحص' : 'Test';

  const customerName = String(sample?.customer_name_ar || sample?.customer_name || '').trim();
  const animalName = String(sample?.animal_name || sample?.name_tag || '').trim();
  const animalType = animalTypeLabel(sample?.animal_type, isArabic);  const testsSummary = formatTestsForLabel(sample, { isArabic });

  let sampleDate = '';
  if (sample?.collection_date) {
    const d = new Date(sample.collection_date);
    if (!Number.isNaN(d.getTime())) {
      sampleDate = d.toLocaleDateString(isArabic ? 'ar-SA' : 'en-GB', {
        day: '2-digit', month: '2-digit', year: '2-digit',
      });
    }
  }

  const animalLine = animalName && animalType
    ? `${animalPrefix}: ${animalName} · ${typePrefix}: ${animalType}`
    : animalName
      ? `${animalPrefix}: ${animalName}`
      : animalType
        ? `${typePrefix}: ${animalType}`
        : '';

  return {
    barcode: id,
    barcodeDigits: id,
    barcodeEncode: encodeCode128C(id),
    sampleLine: truncateLabel(`${samplePrefix}: ${id}`, 36),
    customerLine: customerName ? truncateLabel(`${customerPrefix}: ${customerName}`, 36) : '',
    animalLine: animalLine ? truncateLabel(animalLine, 36) : '',
    dateLine: sampleDate ? truncateLabel(`${datePrefix}: ${sampleDate}`, 36) : '',
    testLine: truncateLabel(`${testPrefix}: ${testsSummary}`, 36),
    testsSummary,
    sampleCode: id,
    animalName,
    customerName,
  };
};
