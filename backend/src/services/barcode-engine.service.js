/**
 * Barcode Engine — Code128 sample ID in barcode; human text English-only on ZPL.
 *
 * Rules:
 * - barcodeValue = unified sample digits (Norma / USB scanner compatible)
 * - ZPL text lines = English ASCII only (Zebra ^A0N / ^CI0)
 * - ZPL ^BC ^FD contains digits only (Code128-C)
 */
const {
  displaySampleId,
  encodeCode128C,
  normalizeSampleScanId,
  extractDigits,
} = require('../utils/barcode-scan');

const BARCODE_TYPE = 'Code128';

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

const ANIMAL_TYPES = {
  camel: { en: 'Camel', ar: 'إبل' },
  sheep: { en: 'Sheep', ar: 'غنم' },
  horse: { en: 'Horse', ar: 'خيل' },
  goat: { en: 'Goat', ar: 'ماعز' },
  other: { en: 'Other', ar: 'أخرى' },
  bird: { en: 'Other', ar: 'أخرى' },
  cat: { en: 'Other', ar: 'أخرى' },
  dog: { en: 'Other', ar: 'أخرى' },
};

const PANEL_LABELS = {
  CBC: { ar: 'تعداد الدم', en: 'CBC' },
  CHEM: { ar: 'كيمياء الدم', en: 'Chemistry' },
  MICRO: { ar: 'طفيليات', en: 'Parasitology' },
  PARAS: { ar: 'طفيليات', en: 'Parasitology' },
  HORM: { ar: 'هرمونات', en: 'Hormones' },
  ELISA: { ar: 'ELISA', en: 'ELISA' },
  SERO: { ar: 'أمصال', en: 'Serology' },
  PCR: { ar: 'PCR', en: 'PCR' },
  CULT: { ar: 'مزارع', en: 'Culture' },
  OTHER: { ar: 'فحص مخبري', en: 'Lab' },
};

const DEFAULT_PRINTER = {
  dpi: 203,
  labelWidthMm: 50,
  labelHeightMm: 25,
  darkness: 35,
  speed: 3,
  media: 'direct',
};

const LABEL_WIDTH = 400;
const LABEL_HEIGHT = 200;
const MIN_QUIET_ZONE = 10;

const LAYOUT = {
  barcodeY: 2,
  barcodeHeight: 52,
  digitsY: 56,
  customerY: 76,
  animalY: 86,
  dateY: 110,
  testY: 134,
};

const zplEscape = (value) => String(value ?? '')
  .replace(/\\/g, '\\\\')
  .replace(/\^/g, '\\^')
  .replace(/~/g, '\\~');

const truncateLabel = (text, max = 34) => {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(1, max - 3))}...`;
};

const formatSampleDate = (value, isArabic) => {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(isArabic ? 'ar-SA' : 'en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
};

const animalTypeLabel = (type, isArabic) => {
  const entry = ANIMAL_TYPES[String(type || '').toLowerCase()];
  return entry ? (isArabic ? entry.ar : entry.en) : (type || '');
};

const resolvePanelKey = (test) => {
  const cat = String(test?.category_code || '').toUpperCase();
  const code = String(test?.test_code || test?.code || '').toUpperCase();
  if (cat === 'CBC' || /^CBC/.test(code)) return 'CBC';
  if (cat === 'CHEM' || cat === 'BIOCHEM' || /^CHEM/.test(code)) return 'CHEM';
  if (cat === 'MICRO' || cat === 'PARAS' || /^PARAS/.test(code)) return 'MICRO';
  if (cat && cat !== 'OTHER') return cat;
  if (code) return code.split('-')[0];
  return 'OTHER';
};

const formatTestsForLabel = (sample, isArabic) => {
  const tests = sample?.tests?.filter(Boolean) || [];
  if (!tests.length) {
    const key = String(sample?.panelKey || 'OTHER').toUpperCase();
    const entry = PANEL_LABELS[key] || PANEL_LABELS.OTHER;
    return isArabic ? entry.ar : entry.en;
  }
  const keys = [...new Set(tests.map((t) => resolvePanelKey(t)))];
  return keys.map((k) => {
    const entry = PANEL_LABELS[k] || PANEL_LABELS.OTHER;
    return isArabic ? entry.ar : entry.en;
  }).join(' + ');
};

const labels = (isArabic) => ({
  sampleId: isArabic ? 'رقم العينة' : 'Sample ID',
  customer: isArabic ? 'العميل' : 'Client',
  animal: isArabic ? 'الحيوان' : 'Animal',
  type: isArabic ? 'النوع' : 'Type',
  date: isArabic ? 'التاريخ' : 'Date',
  test: isArabic ? 'الفحص' : 'Test',
});

/**
 * Build canonical barcode payload from sample row.
 */
const buildBarcodePayload = (sample = {}, context = {}) => {
  const isArabic = context.isArabic ?? context.language === 'ar';
  const L = labels(isArabic);

  const rawId = sample.sample_code || sample.barcode || sample.sample_id;
  const barcodeValue = displaySampleId(rawId) || '';
  const barcodeEncode = encodeCode128C(barcodeValue);

  const customerName = String(
    sample.customer_name_ar || sample.customer_name || sample.client_name || ''
  ).trim();
  const animalName = String(sample.animal_name || sample.name_tag || '').trim();
  const animalType = animalTypeLabel(sample.animal_type, isArabic);
  const sampleDate = formatSampleDate(sample.collection_date || sample.date, isArabic);
  const testsSummary = formatTestsForLabel(sample, isArabic);

  const humanReadable = {
    sampleId: barcodeValue,
    customerName,
    animalName,
    animalType,
    sampleDate,
    testsSummary,
  };

  const textLines = [
    { key: 'sampleId', text: truncateLabel(`${L.sampleId}: ${barcodeValue}`) },
    customerName && { key: 'customer', text: truncateLabel(`${L.customer}: ${customerName}`) },
    (animalName || animalType) && {
      key: 'animal',
      text: truncateLabel(
        animalName && animalType
          ? `${L.animal}: ${animalName} · ${L.type}: ${animalType}`
          : animalName
            ? `${L.animal}: ${animalName}`
            : `${L.type}: ${animalType}`
      ),
    },
    sampleDate && { key: 'date', text: truncateLabel(`${L.date}: ${sampleDate}`) },
    testsSummary && { key: 'test', text: truncateLabel(`${L.test}: ${testsSummary}`) },
  ].filter(Boolean);

  return {
    barcodeType: BARCODE_TYPE,
    barcodeValue,
    barcodeEncode,
    normaSampleId: normalizeSampleScanId(barcodeValue) || barcodeValue,
    humanReadable,
    textLines,
    meta: {
      animal_type: sample.animal_type,
      animal_code: sample.animal_code,
      collection_date: sample.collection_date || sample.date,
      tests: sample.tests || [],
    },
  };
};

const validateBarcodePayload = (payload = {}) => {
  const errors = [];

  if (!payload.barcodeValue) {
    errors.push('barcodeValue is required');
  } else if (ARABIC_RE.test(payload.barcodeValue)) {
    errors.push('barcodeValue must not contain Arabic text');
  } else if (/[^\dA-Za-z-]/.test(payload.barcodeValue) && !/^(SMP|BC)-/i.test(payload.barcodeValue)) {
    const digits = extractDigits(payload.barcodeValue);
    if (!digits || digits !== payload.barcodeValue) {
      errors.push('barcodeValue must be sample digits only');
    }
  }

  if (payload.barcodeEncode && payload.barcodeValue) {
    const expected = encodeCode128C(payload.barcodeValue);
    if (payload.barcodeEncode !== expected) {
      errors.push(`barcodeEncode mismatch: expected ${expected}`);
    }
  }

  if (payload.barcodeType && payload.barcodeType !== BARCODE_TYPE) {
    errors.push(`barcodeType must be ${BARCODE_TYPE}`);
  }

  for (const line of payload.textLines || []) {
    if (line?.key === 'sampleId' && ARABIC_RE.test(String(line.text).replace(/^[^:]*:\s*/, ''))) {
      // prefix may be Arabic; value part after colon for sampleId should be digits
      const val = String(line.text).split(':').pop().trim();
      if (ARABIC_RE.test(val)) errors.push('sampleId human text value must not be Arabic-only corruption');
    }
  }

  return { valid: errors.length === 0, errors };
};

const normalizePrinterOptions = (options = {}) => {
  const merged = { ...DEFAULT_PRINTER, ...options };
  const widthDots = Math.round((merged.labelWidthMm / 25.4) * merged.dpi);
  const heightDots = Math.round((merged.labelHeightMm / 25.4) * merged.dpi);
  return {
    ...merged,
    labelWidthDots: options.labelWidthDots ?? widthDots,
    labelHeightDots: options.labelHeightDots ?? heightDots,
    darkness: Math.min(30, Math.max(0, Number(merged.darkness) || DEFAULT_PRINTER.darkness)),
    speed: Math.min(14, Math.max(1, Number(merged.speed) || DEFAULT_PRINTER.speed)),
    isArabic: options.isArabic ?? options.language === 'ar',
  };
};

const code128CModules = (digits) => {
  const pairs = String(digits).length / 2;
  return 11 + pairs * 11 + 11 + 13;
};

const zplHeader = (opts) => {
  const w = opts.labelWidthDots || LABEL_WIDTH;
  const h = opts.labelHeightDots || LABEL_HEIGHT;
  const isArabic = opts.isArabic ?? opts.language === 'ar';
  return [
    '^XA',
    '^FX LIMS Barcode Engine v1',
    isArabic ? '^CI28' : '^CI0',
    '^MTD',
    `^MD${opts.darkness ?? DEFAULT_PRINTER.darkness}`,
    '^MNW',
    `^PR${opts.speed ?? DEFAULT_PRINTER.speed}`,
    `^PW${w}`,
    `^LL${h}`,
    '^LH0,0',
    '^LT0',
    '^LS0',
    '^FWN',
    '^PON',
  ];
};

const field = (zpl) => `^FWN${zpl}`;

const FONT_DIGITS = '^A0N,28,26';
const FONT_LINE = '^A0N,22,20';
const FONT_TEST = '^A0N,22,22';

const textLine = (y, value, width, font = FONT_LINE) => (
  field(`^FO0,${y}^FB${width},1,0,C,0${font}^FD${zplEscape(value)}^FS`)
);

const barcodeField = (payload, opts) => {
  const digits = payload.barcodeEncode || encodeCode128C(payload.barcodeValue);
  const moduleWidth = 3;
  const barHeight = LAYOUT.barcodeHeight;
  const w = code128CModules(digits) * moduleWidth;
  const labelW = opts.labelWidthDots || LABEL_WIDTH;
  const x = Math.max(MIN_QUIET_ZONE, Math.floor((labelW - w) / 2));
  const rightQuiet = labelW - (x + w);
  return {
    zpl: field(`^FO${x},${LAYOUT.barcodeY}^BY${moduleWidth},3,${barHeight}^BCN,${barHeight},N,N,N^FD>;>8${digits}^FS`),
    x,
    width: w,
    rightQuiet,
    digits,
  };
};

const asciiLabelText = (text) => {
  const s = String(text || '').trim();
  if (!s || ARABIC_RE.test(s)) return '';
  return s;
};

/** English or Arabic text lines for ZPL — Arabic uses ^CI28 when isArabic=true. */
const buildZplTextLines = (payload, isArabic = false) => {
  const animalName = String(payload.humanReadable?.animalName || '').trim();
  const animalCode = String(payload.meta?.animal_code || '').trim();
  const animalType = animalTypeLabel(payload.meta?.animal_type, isArabic);
  const sampleDate = formatSampleDate(payload.meta?.collection_date, isArabic);
  const testsSummary = formatTestsForLabel(
    { tests: payload.meta?.tests || [] },
    isArabic
  );

  const lines = [];
  if (isArabic && animalName) {
    const bit = animalCode ? `${animalName} · ${animalCode}` : animalName;
    lines.push({ key: 'animal', text: truncateLabel(bit) });
  } else if (animalType) {
    const animalBit = animalCode
      ? `Type: ${animalType} · ${animalCode}`
      : `Type: ${animalType}`;
    lines.push({ key: 'animal', text: truncateLabel(animalBit) });
  } else if (animalCode) {
    lines.push({ key: 'animal', text: truncateLabel(`ID: ${animalCode}`) });
  }
  if (sampleDate) {
    lines.push({ key: 'date', text: truncateLabel(`${isArabic ? 'التاريخ' : 'Date'}: ${sampleDate}`) });
  }
  if (testsSummary) {
    lines.push({ key: 'test', text: truncateLabel(`${isArabic ? 'الفحص' : 'Test'}: ${testsSummary}`) });
  }
  return lines;
};

/**
 * Build ZPL for Zebra 50×25 mm direct thermal label.
 */
const buildZplLabel = (payload, options = {}) => {
  const validation = validateBarcodePayload(payload);
  if (!validation.valid) {
    const err = new Error(validation.errors.join('; '));
    err.code = 'INVALID_BARCODE_PAYLOAD';
    throw err;
  }

  const opts = normalizePrinterOptions(options);
  const labelW = opts.labelWidthDots || LABEL_WIDTH;
  const lines = [...zplHeader(opts)];

  const bc = barcodeField(payload, opts);
  lines.push(bc.zpl);

  const sampleDigits = payload.barcodeValue || payload.humanReadable?.sampleId || '';
  lines.push(textLine(LAYOUT.digitsY, sampleDigits, labelW, FONT_DIGITS));

  const zplLines = buildZplTextLines(payload, opts.isArabic);
  const yByKey = { animal: LAYOUT.animalY, date: LAYOUT.dateY, test: LAYOUT.testY };
  const fontByKey = { animal: FONT_LINE, date: FONT_LINE, test: FONT_TEST };
  for (const line of zplLines) {
    lines.push(textLine(yByKey[line.key], line.text, labelW, fontByKey[line.key] || FONT_LINE));
  }

  lines.push('^XZ');
  const zpl = lines.join('\n');

  const quiet = validateZplQuietZone(zpl, opts);
  if (!quiet.valid) {
    const err = new Error(quiet.errors.join('; '));
    err.code = 'INVALID_ZPL_QUIET_ZONE';
    throw err;
  }

  return zpl;
};

const validateZplQuietZone = (zpl, options = {}) => {
  const errors = [];
  const opts = normalizePrinterOptions(options);
  const labelW = opts.labelWidthDots || LABEL_WIDTH;
  const src = String(zpl || '');

  if (!src.includes('^XA') || !src.includes('^XZ')) {
    errors.push('ZPL must contain ^XA and ^XZ');
  }

  const textFds = src.match(/\^FD([\s\S]*?)\^FS/g) || [];
  const isArabic = opts.isArabic ?? opts.language === 'ar';
  if (!isArabic) {
    for (const block of textFds) {
      const fdMatch = block.match(/\^FD([\s\S]*?)\^FS/);
      const fdVal = fdMatch ? fdMatch[1] : '';
      if (ARABIC_RE.test(fdVal) && !String(fdVal).startsWith('>;>8')) {
        errors.push('Arabic text found in ZPL ^FD field');
      }
    }
  }

  const bcBlocks = src.match(/\^FO(\d+),\d+\^BY[\s\S]*?\^BC[\s\S]*?\^FS/g) || [];
  for (const block of bcBlocks) {
    const xMatch = block.match(/\^FO(\d+),/);
    const x = xMatch ? Number(xMatch[1]) : 0;
    if (x < MIN_QUIET_ZONE) {
      errors.push(`Left quiet zone too small: ^FO x=${x}, need >= ${MIN_QUIET_ZONE}`);
    }

    const fdMatch = block.match(/\^FD([\s\S]*?)\^FS/);
    const fdVal = fdMatch ? fdMatch[1] : '';
    if (ARABIC_RE.test(fdVal)) {
      errors.push('Arabic text found inside barcode ^FD field');
    }
    const digitsOnly = fdVal.replace(/^>;>8/, '').replace(/[^\d]/g, '');
    if (fdVal.includes('^FD') && !fdMatch) {
      errors.push('Malformed barcode ^FD');
    }
    if (fdVal && !/^>;>8\d+$/.test(fdVal.trim())) {
      errors.push(`Barcode ^FD must be Code128-C digits only, got: ${fdVal.slice(0, 40)}`);
    }

    const byMatch = block.match(/\^BY(\d+)/);
    const moduleW = byMatch ? Number(byMatch[1]) : 3;
    const fdDigits = fdVal.replace(/^>;>8/, '');
    const estW = code128CModules(fdDigits) * moduleW;
    const rightQuiet = labelW - (x + estW);
    if (rightQuiet < MIN_QUIET_ZONE) {
      errors.push(`Right quiet zone too small: ${rightQuiet} dots, need >= ${MIN_QUIET_ZONE}`);
    }
  }

  const pwMatch = src.match(/\^PW(\d+)/);
  if (pwMatch) {
    const pw = Number(pwMatch[1]);
    if (pw < 200 || pw > 600) {
      errors.push(`Label width ^PW${pw} may clip barcode on 50mm media`);
    }
  }

  return { valid: errors.length === 0, errors, leftQuietMin: MIN_QUIET_ZONE, rightQuietMin: MIN_QUIET_ZONE };
};

module.exports = {
  BARCODE_TYPE,
  ANIMAL_TYPES,
  PANEL_LABELS,
  MIN_QUIET_ZONE,
  LABEL_WIDTH,
  LABEL_HEIGHT,
  buildBarcodePayload,
  validateBarcodePayload,
  buildZplLabel,
  validateZplQuietZone,
  normalizePrinterOptions,
  truncateLabel,
  formatTestsForLabel,
  animalTypeLabel,
};
