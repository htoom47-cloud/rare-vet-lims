/**
 * Design 2 — Premium IDEXX/Antech-style laboratory report (final polish).
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const env = require('../../config/env');
const { LAB_NAME_EN, LAB_NAME_AR } = require('../../constants/brand');
const { generateQR, generateCode128 } = require('../barcode');
const { drawArBox, registerPdfFonts } = require('../pdf-arabic');
const { HAS_LOGO, getBrandLogoBuffer } = require('../pdf-logo');
const { readImageBuffer } = require('../../config/storage');
const { isAbnormalFlag } = require('./layout-mode');
const {
  buildResultCounts,
  buildClinicalSummary,
} = require('./design-2-clinical');
const { calcChangePct, shouldShowTrend } = require('./design-2-sparkline');

const FONTS_DIR = path.join(__dirname, '../../../assets/fonts');
const pickFont = (names) => names.map((n) => path.join(FONTS_DIR, n)).find((p) => fs.existsSync(p));

const FONT = {
  ar: pickFont(['IBMPlexSansArabic-Regular.ttf', 'Cairo-Regular.ttf', 'NotoSansArabic-Regular.ttf']),
  arB: pickFont(['IBMPlexSansArabic-Bold.ttf', 'Cairo-Bold.ttf', 'NotoSansArabic-Bold.ttf']),
  en: pickFont(['Inter-Regular.ttf', 'SourceSans3-Regular.ttf', 'SourceSansPro-Regular.ttf']),
  enB: pickFont(['Inter-Bold.ttf', 'SourceSans3-Bold.ttf', 'SourceSansPro-Bold.ttf']),
  enM: pickFont(['Inter-Medium.ttf', 'SourceSans3-Medium.ttf', 'SourceSansPro-Medium.ttf']),
  enSB: pickFont(['Inter-SemiBold.ttf', 'SourceSans3-SemiBold.ttf', 'SourceSansPro-SemiBold.ttf']),
};

/** Typography scale (pt) — balanced IDEXX/Antech-style medium sizing */
const FS = {
  titleMain: 21,
  titleSub: 14,
  sectionHead: 14.5,
  colHeader: 14.5,
  testCode: 14,
  testName: 14,
  result: 15,
  resultAbn: 15,
  ref: 13,
  unit: 13,
  patientVal: 13.5,
  patientLbl: 12.5,
  body: 12.5,
  summary: 12,
  badge: 10,
  small: 9.5,
  footer: 10,
  disclaimer: 9,
};

const ROW = {
  pad: 5,
  header: 21,
  normal: 25,
  trend: 36,
};

const PAGE_W = 595;
const PAGE_H = 842;
const M = 20;
const TX = M;
const TW = PAGE_W - M * 2;
const FOOTER_H = 42;
const PAGE_BOTTOM = PAGE_H - FOOTER_H - 2;
const SIG_BLOCK_H = 76;

const BRAND = {
  primary: '#4A3728',
  slate: '#64748B',
  slateDark: '#475569',
  slateLight: '#F1F5F9',
  accent: '#C5A059',
  accentPale: '#FAF8F5',
  white: '#FFFFFF',
  zebraA: '#FFFFFF',
  zebraB: '#EDF2F7',
  border: '#CBD5E1',
  borderStrong: '#94A3B8',
  muted: '#64748B',
  text: '#222222',
  ink: '#222222',
  high: '#B91C1C',
  low: '#1D4ED8',
  normal: '#15803D',
  normalBg: '#F0FDF4',
  highBg: '#FEF2F2',
  lowBg: '#EFF6FF',
};

const TABLE_BORDER_W = 0.58;
const ANIMAL_TYPES = {
  camel: { en: 'Camel', ar: 'إبل' }, horse: { en: 'Horse', ar: 'حصان' },
  sheep: { en: 'Sheep', ar: 'غنم' }, goat: { en: 'Goat', ar: 'ماعز' },
  bird: { en: 'Bird', ar: 'طير' }, cat: { en: 'Cat', ar: 'قط' }, dog: { en: 'Dog', ar: 'كلب' },
};
const GENDERS = {
  male: { en: 'Male', ar: 'ذكر' }, female: { en: 'Female', ar: 'أنثى' }, unknown: { en: 'Unknown', ar: 'غير محدد' },
};

const registerFonts = (doc) => {
  registerPdfFonts(doc);
  if (FONT.ar) {
    doc.registerFont('Ar', FONT.ar);
    doc.registerFont('ArB', FONT.arB || FONT.ar);
  }
  const enReg = FONT.en && fs.existsSync(FONT.en) ? FONT.en : null;
  const enBold = FONT.enB && fs.existsSync(FONT.enB) ? FONT.enB : null;
  const enMed = FONT.enM && fs.existsSync(FONT.enM) ? FONT.enM : enReg;
  const enSB = FONT.enSB && fs.existsSync(FONT.enSB) ? FONT.enSB : (FONT.enB && fs.existsSync(FONT.enB) ? FONT.enB : enReg);
  if (enReg) {
    doc.registerFont('En', enReg);
    doc.registerFont('EnM', enMed || enReg);
    doc.registerFont('EnSB', enSB || enMed || enReg);
    doc.registerFont('EnB', enBold || enReg);
  } else {
    doc.registerFont('En', 'Helvetica');
    doc.registerFont('EnM', 'Helvetica');
    doc.registerFont('EnSB', 'Helvetica-Bold');
    doc.registerFont('EnB', 'Helvetica-Bold');
  }
};

const clean = (t) => String(t ?? '')
  .replace(/μ/g, 'u').replace(/µ/g, 'u').replace(/³/g, '3')
  .replace(/\u2013/g, '-').replace(/\u2014/g, '-');
const hasAr = (t) => /[\u0600-\u06FF]/.test(String(t || ''));

const setEn = (doc, weight = 'regular') => {
  if (weight === 'bold' || weight === 700) doc.font('EnB');
  else if (weight === 'semibold' || weight === 600) doc.font('EnSB');
  else if (weight === 'medium' || weight === 500) doc.font('EnM');
  else doc.font('En');
};

const textW = (doc, text, size, weight = 'regular') => {
  setEn(doc, weight);
  doc.fontSize(size);
  return doc.widthOfString(clean(text));
};

const cellEn = (doc, text, x, y, w, opts = {}) => {
  const { size = FS.body, color = BRAND.ink, weight = 'regular', align = 'left', h = 18 } = opts;
  const saved = doc.y;
  setEn(doc, weight);
  doc.fontSize(size).fillColor(color);
  doc.text(clean(text), x, y, { width: w, height: h, align, lineBreak: false, ellipsis: true });
  doc.y = saved;
};

const cellAr = (doc, text, x, y, w, opts = {}) => {
  const saved = doc.y;
  drawArBox(doc, clean(text), x, y, w, {
    size: opts.size || FS.body,
    color: opts.color || BRAND.ink,
    bold: opts.weight === 'bold' || opts.weight === 'semibold' || opts.weight === 600 || opts.weight === 700,
    align: opts.align || 'right',
    fromTop: true,
  });
  doc.y = saved;
};

const cellBi = (doc, en, ar, x, y, w, opts = {}) => {
  cellEn(doc, en, x, y, w / 2 - 2, { ...opts, align: 'left' });
  cellAr(doc, ar, x + w / 2, y, w / 2 - 2, { ...opts, align: 'right', weight: opts.weight });
};

const roundRect = (doc, x, y, w, h, r, fill, stroke) => {
  doc.roundedRect(x, y, w, h, r);
  if (fill) doc.fill(fill);
  if (stroke) doc.roundedRect(x, y, w, h, r).lineWidth(TABLE_BORDER_W).strokeColor(stroke).stroke();
};

const strokeCell = (doc, x, y, w, h, fill) => {
  if (fill) doc.rect(x, y, w, h).fill(fill);
  doc.rect(x, y, w, h).lineWidth(TABLE_BORDER_W).strokeColor(BRAND.borderStrong).stroke();
};

const formatDate = (date) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatDateTime = (date) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '-';
  return `${formatDate(d)}  ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
};

const formatRef = (row) => {
  if (row.minValue != null && row.maxValue != null) {
    const fmt = (n) => {
      const num = Number(n);
      if (Number.isNaN(num)) return String(n);
      return Number.isInteger(num) ? String(num) : num.toFixed(2).replace(/\.?0+$/, '');
    };
    return `${fmt(row.minValue)} \u2013 ${fmt(row.maxValue)}`;
  }
  return row.reference && row.reference !== '-' ? row.reference.replace(/\s*-\s*/g, ' \u2013 ') : '-';
};

const flagMeta = (flag) => {
  if (flag === 'HIGH' || flag === 'CRIT_HIGH' || flag === 'POS') {
    return { sym: '\u2191', tag: 'HIGH', color: BRAND.high };
  }
  if (flag === 'LOW' || flag === 'CRIT_LOW') {
    return { sym: '\u2193', tag: 'LOW', color: BRAND.low };
  }
  return { sym: '', tag: '', color: BRAND.text };
};

const resolveInstruments = (results) => {
  const set = new Set((results || []).map((r) => r.instrument).filter(Boolean));
  return [...set].join(' / ') || 'Laboratory Analyzer';
};

const drawWatermark = (doc, logoBuf) => {
  if (!logoBuf) return;
  doc.save();
  doc.opacity(0.04);
  const size = 290;
  try { doc.image(logoBuf, (PAGE_W - size) / 2, (PAGE_H - size) / 2, { width: size, height: size }); } catch { /* */ }
  doc.restore();
};

const ensureSpace = (doc, y, need, logoBuf, onNewPage) => {
  if (y + need <= PAGE_BOTTOM) return y;
  doc.addPage();
  drawWatermark(doc, logoBuf);
  return onNewPage ? onNewPage() : M + 4;
};

const drawHeader = (doc, data, barcodeBuffer, logoBuf) => {
  const h = 48;
  doc.rect(0, 0, PAGE_W, 2).fill(BRAND.accent);
  doc.rect(0, 2, PAGE_W, h).fill(BRAND.accentPale);

  const logoSize = 30;
  let lx = TX;
  if (logoBuf) {
    try { doc.image(logoBuf, lx, 5, { width: logoSize, height: logoSize }); } catch { /* */ }
    lx += logoSize + 6;
  }
  if (barcodeBuffer) {
    try { doc.image(barcodeBuffer, lx, 10, { width: 92, height: 18 }); } catch { /* */ }
  }

  const titleX = logoBuf ? TX + 132 : TX + 100;
  const titleW = TW - (titleX - TX) - 148;
  cellEn(doc, env.lab.name || LAB_NAME_EN, titleX, 6, titleW, { size: FS.titleMain, weight: 'bold', color: BRAND.primary });
  cellAr(doc, env.lab.nameAr || LAB_NAME_AR, titleX, 24, titleW, { size: FS.titleMain - 1, weight: 'bold', color: BRAND.primary, align: 'left' });
  cellBi(doc, 'Laboratory Results Report', 'تقرير نتائج المختبر', titleX, 36, titleW, { size: FS.titleSub, weight: 'semibold', color: BRAND.slateDark });

  const cardW = 68;
  const cx = TX + TW - cardW * 2 - 2;
  roundRect(doc, cx, 4, cardW, 18, 2, BRAND.white, BRAND.border);
  cellEn(doc, 'Report', cx + 4, 5, cardW - 8, { size: FS.small, color: BRAND.muted });
  cellEn(doc, data.reportNumber || '-', cx + 4, 11, cardW - 8, { size: FS.body, weight: 'bold', color: BRAND.primary });

  roundRect(doc, cx + cardW + 2, 4, cardW, 18, 2, BRAND.white, BRAND.border);
  cellEn(doc, 'Sample', cx + cardW + 5, 5, cardW - 8, { size: FS.small, color: BRAND.muted });
  cellEn(doc, data.sampleCode || '-', cx + cardW + 5, 11, cardW - 8, { size: FS.body, weight: 'bold', color: BRAND.primary });

  const badgeY = 26;
  roundRect(doc, cx + cardW + 2, badgeY, cardW, 12, 5, BRAND.slateDark, null);
  cellEn(doc, (data.panelName || 'Panel').slice(0, 14), cx + cardW + 4, badgeY + 1, cardW - 4, { size: FS.small, weight: 'bold', color: BRAND.white, align: 'center' });
  roundRect(doc, cx, badgeY, cardW, 12, 5, data.isFinal !== false ? BRAND.normal : '#D97706', null);
  cellEn(doc, data.isFinal !== false ? 'FINAL' : 'PRELIM', cx + 3, badgeY + 1, cardW - 6, { size: FS.small, weight: 'bold', color: BRAND.white, align: 'center' });

  doc.rect(TX, h + 2, TW, 0.5).fill(BRAND.borderStrong);
  return h + 4;
};

const drawPatientCard = (doc, data, y0) => {
  const isAr = data.language === 'ar';
  const species = ANIMAL_TYPES[data.animalType] || { en: data.animalType || '-', ar: data.animalType || '-' };
  const gender = GENDERS[data.animalGender] || GENDERS.unknown;
  const cardH = 76;
  roundRect(doc, TX, y0, TW, cardH, 3, BRAND.white, BRAND.border);
  doc.rect(TX, y0, 3, cardH).fill(BRAND.accent);
  cellBi(doc, 'Patient Information', 'بيانات المريض', TX + 8, y0 + 4, TW - 16, { size: FS.sectionHead, weight: 'semibold', color: BRAND.primary });

  const fields = [
    { en: 'Owner', ar: 'المالك', val: data.customerName || '-' },
    { en: 'Mobile', ar: 'الجوال', val: data.customerMobile || '-' },
    { en: 'Animal', ar: 'الحيوان', val: data.animalName || '-' },
    { en: 'Species', ar: 'النوع', val: isAr ? species.ar : species.en },
    { en: 'Breed', ar: 'السلالة', val: data.animalBreed || '-' },
    { en: 'Gender', ar: 'الجنس', val: isAr ? gender.ar : gender.en },
    { en: 'Age', ar: 'العمر', val: data.animalAge || '-' },
    { en: 'Sample', ar: 'العينة', val: data.sampleCode || '-' },
    { en: 'Collected', ar: 'السحب', val: formatDate(data.collectionDate || data.date) },
    { en: 'Issued', ar: 'الإصدار', val: formatDate(data.issuedDate || data.date) },
  ];
  const colW = TW / 2;
  const lblW = isAr ? 58 : 50;
  const valX = isAr ? 62 : 52;
  fields.forEach((f, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const ly = y0 + 18 + row * 11;
    const x = TX + 8 + col * colW;
    if (isAr) cellAr(doc, `${f.ar}:`, x, ly, lblW, { size: FS.patientLbl, color: BRAND.muted, align: 'right' });
    else cellEn(doc, `${f.en}:`, x, ly, lblW, { size: FS.patientLbl, color: BRAND.muted });
    if (hasAr(f.val)) cellAr(doc, f.val, x + valX, ly, colW - valX - 6, { size: FS.patientVal, weight: 'medium', color: BRAND.ink });
    else cellEn(doc, f.val, x + valX, ly, colW - valX - 6, { size: FS.patientVal, weight: 'medium', color: BRAND.ink });
  });
  return y0 + cardH + 4;
};

const drawResultOverview = (doc, y, counts, lang = 'ar') => {
  const isAr = lang === 'ar';
  const h = 26;
  roundRect(doc, TX, y, TW, h, 3, BRAND.slateLight, BRAND.border);
  if (isAr) {
    cellAr(doc, 'ملخص النتائج', TX + 8, y + 3, 120, { size: FS.sectionHead, weight: 'semibold', color: BRAND.slateDark, align: 'right' });
  } else {
    cellEn(doc, 'Result Overview', TX + 8, y + 3, 120, { size: FS.sectionHead, weight: 'semibold', color: BRAND.slateDark });
  }
  const boxW = 72;
  const gap = 6;
  const startX = TX + TW - (boxW * 3 + gap * 2) - 6;
  [
    { label: 'HIGH', labelAr: 'مرتفع', n: counts.high, bg: BRAND.highBg, color: BRAND.high },
    { label: 'LOW', labelAr: 'منخفض', n: counts.low, bg: BRAND.lowBg, color: BRAND.low },
    { label: 'NORMAL', labelAr: 'طبيعي', n: counts.normal, bg: BRAND.normalBg, color: BRAND.normal },
  ].forEach((b, i) => {
    const x = startX + i * (boxW + gap);
    const text = isAr ? `${b.labelAr}: ${b.n}` : `${b.label}: ${b.n}`;
    roundRect(doc, x, y + 3, boxW, 18, 2, b.bg, b.color);
    if (isAr) {
      cellAr(doc, text, x + 4, y + 6, boxW - 8, { size: FS.body, weight: 'bold', color: b.color, align: 'center' });
    } else {
      cellEn(doc, text, x + 4, y + 6, boxW - 8, { size: FS.body, weight: 'bold', color: b.color, align: 'center' });
    }
  });
  return y + h + 4;
};

const COL_W = [0.34, 0.30, 0.11, 0.25];
const CELL_PAD_X = 6;
const colXs = () => { const xs = []; let x = TX; COL_W.forEach((p) => { xs.push(x); x += Math.floor(TW * p); }); return xs; };
const colWidths = () => COL_W.map((p) => Math.floor(TW * p));

const drawRefBadge = (doc, x, y, w, h, text) => {
  const ref = clean(text);
  const bw = Math.min(w - 8, Math.max(44, ref.length * 5.5 + 10));
  const bx = x + (w - bw) / 2;
  roundRect(doc, bx, y + 2, bw, h - 4, 2, '#F1F5F9', BRAND.borderStrong);
  cellEn(doc, ref, bx + 3, y + 3, bw - 6, { size: FS.ref, color: BRAND.ink, align: 'center' });
};

const drawTableHeader = (doc, y, lang) => {
  const xs = colXs();
  const ws = colWidths();
  const h = ROW.header;
  const headers = lang === 'ar'
    ? ['اسم الفحص', 'النتيجة', 'الوحدة', 'المجال المرجعي']
    : ['Test', 'Result', 'Unit', 'Reference Range'];
  headers.forEach((label, i) => {
    doc.rect(xs[i], y, ws[i], h).fill(BRAND.slateDark);
    doc.rect(xs[i], y, ws[i], h).lineWidth(TABLE_BORDER_W).strokeColor(BRAND.borderStrong).stroke();
    const pad = CELL_PAD_X;
    if (hasAr(label)) cellAr(doc, label, xs[i] + pad, y + 4, ws[i] - pad * 2, { size: FS.colHeader, weight: 'bold', color: BRAND.white, align: 'center' });
    else cellEn(doc, label, xs[i] + pad, y + 4, ws[i] - pad * 2, { size: FS.colHeader, weight: 'bold', color: BRAND.white, align: 'center' });
  });
  return y + h;
};

const drawTestName = (doc, row, x, y, w, lang, rowH) => {
  const code = row.code || row.nameEn || '-';
  const subEn = row.nameEn && row.nameEn !== code ? row.nameEn : '';
  const subAr = row.nameAr || '';
  const pad = CELL_PAD_X;

  if (lang === 'ar' && subAr) {
    cellAr(doc, subAr, x + pad, y + 3, w - pad * 2, { size: FS.testCode, weight: 'medium', color: BRAND.ink, align: 'right' });
    cellEn(doc, `(${code})`, x + pad, y + 14, w - pad * 2, { size: FS.small, color: BRAND.muted, align: 'right' });
    return;
  }

  const hasSub = !!subEn;
  const codeY = hasSub ? y + 3 : y + (rowH - FS.testCode) / 2;
  cellEn(doc, code, x + pad, codeY, w - pad * 2, { size: FS.testCode, weight: 'medium', color: BRAND.ink });
  if (hasSub) {
    cellEn(doc, subEn, x + pad, y + 14, w - pad * 2, { size: FS.testName, weight: 'medium', color: BRAND.ink });
  }
};

/** Value + " ↑ HIGH" — color only on value and flag text, not whole row */
const drawResultValue = (doc, x, y, w, row) => {
  const valStr = String(row.value ?? '-');
  const fm = flagMeta(row.flag);
  const abnormal = isAbnormalFlag(row.flag);
  const size = abnormal ? FS.resultAbn : FS.result;
  const valWeight = abnormal ? 'bold' : 'semibold';

  if (!abnormal || !fm.tag) {
    cellEn(doc, valStr, x + CELL_PAD_X, y, w - CELL_PAD_X * 2, { size, color: BRAND.ink, weight: valWeight, align: 'center' });
    return;
  }

  const flagPart = `${fm.sym} ${fm.tag}`;
  const gap = '  ';
  const totalW = textW(doc, valStr, size, 'bold') + textW(doc, gap, size, 'regular') + textW(doc, flagPart, size, 'bold');
  let cx = x + (w - totalW) / 2;

  setEn(doc, 'bold');
  doc.fontSize(size).fillColor(fm.color);
  doc.text(valStr, cx, y, { lineBreak: false });
  cx += textW(doc, valStr, size, 'bold');

  setEn(doc, 'regular');
  doc.fillColor(BRAND.ink);
  doc.text(gap, cx, y, { lineBreak: false });
  cx += textW(doc, gap, size, 'regular');

  setEn(doc, 'bold');
  doc.fillColor(fm.color);
  doc.text(flagPart, cx, y, { lineBreak: false });
};

const drawPrevBadge = (doc, x, y, w, prev, pct) => {
  const arrow = pct != null ? (pct > 0 ? '\u2191' : pct < 0 ? '\u2193' : '\u2192') : '';
  const pctStr = pct != null ? `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%` : '-';
  const label = `Prev ${prev}  ${pctStr}  ${arrow}`;
  const bw = Math.min(w - 8, Math.max(88, label.length * 4.8 + 12));
  const bx = x + (w - bw) / 2;
  roundRect(doc, bx, y, bw, 12, 2, '#F1F5F9', BRAND.border);
  cellEn(doc, label, bx + 3, y + 1, bw - 6, { size: FS.badge, color: BRAND.slateDark, align: 'center' });
};

const drawResultRow = (doc, row, y, ri, lang, trendData) => {
  const xs = colXs();
  const ws = colWidths();
  const hasTrend = trendData?.previous != null && shouldShowTrend(row.code);
  const rowH = hasTrend ? ROW.trend : ROW.normal;
  const bg = ri % 2 === 0 ? BRAND.zebraA : BRAND.zebraB;

  for (let i = 0; i < 4; i += 1) strokeCell(doc, xs[i], y, ws[i], rowH, bg);

  drawTestName(doc, row, xs[0], y, ws[0], lang, rowH);
  const resultY = hasTrend ? y + ROW.pad : y + (rowH - FS.result) / 2;
  drawResultValue(doc, xs[1], resultY, ws[1], row);

  if (hasTrend) {
    const pct = calcChangePct(row.numericValue ?? row.value, trendData.previous);
    drawPrevBadge(doc, xs[1], y + 18, ws[1], trendData.previous, pct);
  }

  cellEn(doc, row.unit || '-', xs[2] + CELL_PAD_X, y + (rowH - FS.unit) / 2, ws[2] - CELL_PAD_X * 2, { size: FS.unit, color: BRAND.slateDark, align: 'center' });
  drawRefBadge(doc, xs[3], y, ws[3], rowH, formatRef(row));

  return y + rowH;
};

const drawResultsTable = (doc, results, reportData, startY) => {
  const lang = reportData.language || 'ar';
  const logoBuf = reportData._logoBuf;
  let y = drawTableHeader(doc, startY, lang);
  const previousByCode = reportData.previousByCode || {};

  results.forEach((row, ri) => {
    const trendData = {
      previous: previousByCode[row.code]?.numericValue ?? previousByCode[row.code]?.value,
    };
    const rowH = trendData.previous != null && shouldShowTrend(row.code) ? ROW.trend : ROW.normal;
    y = ensureSpace(doc, y, rowH, logoBuf, () => drawTableHeader(doc, M + 4, lang));
    y = drawResultRow(doc, row, y, ri, lang, trendData);
  });

  doc.rect(TX, startY, TW, y - startY).lineWidth(TABLE_BORDER_W + 0.08).strokeColor(BRAND.borderStrong).stroke();
  return y + 4;
};

const drawCheckBox = (doc, x, y, color) => {
  doc.rect(x, y + 2, 5, 5).lineWidth(0.45).strokeColor(color || BRAND.borderStrong).stroke();
  doc.rect(x + 1.2, y + 3.2, 2.6, 2.6).fill(color || BRAND.slateDark);
};

const drawClinicalSummaryCard = (doc, y, items, lang, logoBuf) => {
  if (!items.length) return y;
  const twoCol = items.length > 4;
  const cols = twoCol ? 2 : 1;
  const perCol = Math.ceil(items.length / cols);
  const lineH = 13;
  const h = 18 + perCol * lineH + 6;
  y = ensureSpace(doc, y, h, logoBuf, () => M + 4);

  roundRect(doc, TX, y, TW, h, 3, BRAND.white, BRAND.border);
  doc.rect(TX, y, TW, 17).fill(BRAND.slateDark);
  cellBi(doc, 'Clinical Summary', 'ملخص سريري', TX + 8, y + 3, TW - 16, { size: FS.sectionHead, weight: 'semibold', color: BRAND.white });

  const colW = (TW - 16) / cols;
  items.forEach((item, idx) => {
    const col = twoCol ? idx % 2 : 0;
    const row = twoCol ? Math.floor(idx / 2) : idx;
    const ix = TX + 8 + col * colW;
    const iy = y + 20 + row * lineH;
    const iconColor = item.icon === 'high' ? BRAND.high : item.icon === 'low' ? BRAND.low : BRAND.slateDark;
    drawCheckBox(doc, ix, iy, iconColor);
    const textX = ix + 9;
    if (hasAr(item.text)) cellAr(doc, item.text, textX, iy, colW - 14, { size: FS.summary, color: BRAND.ink, align: 'right' });
    else cellEn(doc, item.text, textX, iy, colW - 14, { size: FS.summary, weight: 'medium', color: BRAND.ink });
  });
  return y + h + 4;
};

const interpCardHeight = (body, isList) => {
  const lines = isList ? (body || []) : [body].filter(Boolean);
  if (!lines.length) return 0;
  const lineH = isList ? 11 : 12;
  return 18 + lines.length * lineH + 5;
};

const drawInterpCardAt = (doc, x, y, w, titleEn, titleAr, body, isList) => {
  const lines = isList ? (body || []) : [body].filter(Boolean);
  if (!lines.length) return 0;
  const lineH = isList ? 11 : 12;
  const h = 18 + lines.length * lineH + 5;
  roundRect(doc, x, y, w, h, 3, '#FAFAFA', BRAND.border);
  cellEn(doc, titleEn, x + 6, y + 4, w / 2 - 8, { size: FS.sectionHead, weight: 'semibold', color: BRAND.primary });
  cellAr(doc, titleAr, x + w / 2, y + 4, w / 2 - 8, { size: FS.sectionHead, weight: 'semibold', color: BRAND.primary, align: 'right' });
  let by = y + 17;
  lines.forEach((line) => {
    const t = isList ? `\u25AA  ${line}` : line;
    if (hasAr(t)) cellAr(doc, t, x + 6, by, w - 12, { size: FS.summary, color: BRAND.ink, align: 'right' });
    else cellEn(doc, t, x + 6, by, w - 12, { size: FS.summary, weight: 'medium', color: BRAND.ink });
    by += lineH;
  });
  return h;
};

const drawTreatmentRecommendations = (doc, y, text, logoBuf) => {
  const manual = String(text || '').trim();
  if (!manual) return y;
  const h = interpCardHeight(manual, false);
  y = ensureSpace(doc, y, h + 4, logoBuf, () => M + 4);
  drawInterpCardAt(doc, TX, y, TW, 'Treatment Recommendations', 'التوصيات العلاجية', manual, false);
  return y + h + 4;
};

const drawLabSeal = (doc, cx, cy, r) => {
  const d = r * 2;
  roundRect(doc, cx - r, cy - r, d, d, r, null, BRAND.accent);
  roundRect(doc, cx - r + 2, cy - r + 2, d - 4, d - 4, r - 2, BRAND.accentPale, BRAND.accent);
  cellEn(doc, 'RARE VET', cx - r + 3, cy - 6, d - 6, { size: FS.small, weight: 'bold', color: BRAND.primary, align: 'center' });
  cellEn(doc, 'VERIFIED', cx - r + 3, cy + 1, d - 6, { size: FS.small, weight: 'bold', color: BRAND.accent, align: 'center' });
  cellAr(doc, 'معتمد', cx - r + 3, cy + 7, d - 6, { size: FS.small, color: BRAND.primary, align: 'center' });
};

const drawESignature = (doc, x, y, w, name) => {
  if (!name || name === '________________') {
    doc.moveTo(x + 8, y + 14).lineTo(x + w - 8, y + 14).lineWidth(0.5).strokeColor(BRAND.borderStrong).stroke();
    return;
  }
  const sigSize = FS.body;
  if (hasAr(name)) cellAr(doc, name, x + 6, y + 2, w - 12, { size: sigSize, weight: 'bold', color: BRAND.primary, align: 'center' });
  else {
    const nw = textW(doc, name, sigSize, 'bold');
    const nx = x + (w - Math.min(nw, w - 12)) / 2;
    cellEn(doc, name, nx, y + 2, w - 12, { size: sigSize, weight: 'bold', color: BRAND.primary, align: 'left' });
  }
  doc.moveTo(x + 8, y + 16).lineTo(x + w - 8, y + 16).lineWidth(0.5).strokeColor(BRAND.borderStrong).stroke();
  cellEn(doc, 'E-Signed', x + 6, y + 19, w - 12, { size: FS.small, color: BRAND.muted, align: 'center' });
};

const drawSignatures = (doc, y, reportData, qrBuffer) => {
  const h = SIG_BLOCK_H;
  if (y + h > PAGE_BOTTOM) {
    doc.addPage();
    drawWatermark(doc, reportData._logoBuf);
    y = M + 4;
  }

  roundRect(doc, TX, y, TW, h, 3, BRAND.white, BRAND.border);
  const third = TW / 3;
  const midY = y + 28;

  const drawSigBlock = (x, w, approval, titleEn, titleAr) => {
    cellEn(doc, titleEn, x + 6, y + 5, w - 12, { size: FS.body, weight: 'semibold', color: BRAND.slateDark });
    cellAr(doc, titleAr, x + 6, y + 5, w - 12, { size: FS.body, weight: 'semibold', color: BRAND.slateDark, align: 'right' });
    cellEn(doc, approval?.title || titleEn, x + 6, y + 14, w - 12, { size: FS.patientLbl, color: BRAND.muted });
    const lic = approval?.license || env.lab.licenseNumber || '-';
    cellEn(doc, `Lic. ${lic}`, x + 6, y + 21, w - 12, { size: FS.small, color: BRAND.muted });
    const name = approval?.approved ? (approval.name || '-') : '________________';
    drawESignature(doc, x, midY - 6, w, name);
  };

  drawSigBlock(TX, third, {
    ...reportData.labApproval,
    license: reportData.labApproval?.license || env.lab.licenseNumber,
    title: 'Laboratory Specialist',
  }, 'Laboratory Specialist', 'أخصائي المختبر');

  const midX = TX + third;
  const midCenter = midX + third / 2;
  if (qrBuffer) {
    try { doc.image(qrBuffer, midCenter - 38, midY - 18, { width: 36, height: 36 }); } catch { /* */ }
  }
  drawLabSeal(doc, midCenter + 4, midY, 15);
  cellEn(doc, 'Verify Report', midX + 4, y + h - 13, third - 8, { size: FS.small, color: BRAND.muted, align: 'center' });
  cellAr(doc, 'تحقق من التقرير', midX + 4, y + h - 7, third - 8, { size: FS.small, color: BRAND.muted, align: 'center' });

  drawSigBlock(TX + third * 2, third, {
    ...reportData.vetApproval,
    title: 'Veterinarian',
  }, 'Veterinarian', 'الطبيب البيطري');

  const metaY = y + h + 3;
  roundRect(doc, TX, metaY, TW, 16, 2, BRAND.slateLight, BRAND.border);
  const instrument = reportData.instrument || resolveInstruments(reportData.results);
  const issued = formatDateTime(reportData.issuedDate || reportData.date);
  cellBi(
    doc,
    `Issued: ${issued}   |   Instrument: ${instrument}`,
    `تاريخ الإصدار: ${issued}   |   الجهاز: ${instrument}`,
    TX + 8, metaY + 3, TW - 16, { size: FS.body, weight: 'medium', color: BRAND.slateDark }
  );
  return metaY + 20;
};

const stampFooter = (doc) => {
  const range = doc.bufferedPageRange();
  const website = env.lab.website || env.appUrl || 'https://lims.rarevetcare.com';
  const phone = env.lab.phone || '';
  const email = env.lab.email || '';
  const disclaimerEn = 'This report was generated electronically and does not require a manual signature.';
  const disclaimerAr = 'هذا التقرير تم إنشاؤه إلكترونياً ولا يحتاج إلى توقيع يدوي.';

  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    const fy = PAGE_H - FOOTER_H;
    doc.rect(TX, fy, TW, 0.6).fill(BRAND.accent);

    const seg1 = phone ? `${phone}   |   ` : '';
    const seg2 = email ? `${email}   |   ` : '';
    const seg1w = textW(doc, seg1, FS.footer, 'regular');
    const seg2w = textW(doc, seg2, FS.footer, 'regular');
    const webW = textW(doc, website, FS.footer, 'regular');
    const totalW = seg1w + seg2w + webW;
    let fx = TX + (TW - totalW) / 2;
    const fyText = fy + 5;

    if (phone) {
      cellEn(doc, `${phone}   |   `, fx, fyText, seg1w + 4, { size: FS.footer, color: BRAND.slateDark, align: 'left' });
      fx += seg1w;
    }
    if (email) {
      cellEn(doc, `${email}   |   `, fx, fyText, seg2w + 4, { size: FS.footer, color: BRAND.slateDark, align: 'left' });
      try { doc.link(fx, fyText, seg2w, 10, `mailto:${email}`); } catch { /* */ }
      fx += seg2w;
    }
    cellEn(doc, website, fx, fyText, webW + 4, { size: FS.footer, color: BRAND.low, align: 'left' });
    try { doc.link(fx, fyText, webW, 10, website); } catch { /* */ }

    cellEn(doc, env.lab.address || '', TX, fy + 14, TW, { size: FS.disclaimer, color: BRAND.muted, align: 'center' });
    roundRect(doc, TX + 28, fy + 21, TW - 56, 14, 2, '#FAFAFA', BRAND.border);
    cellBi(doc, disclaimerEn, disclaimerAr, TX + 32, fy + 23, TW - 64, { size: FS.disclaimer, color: BRAND.slateDark });

    if (range.count > 1) {
      cellEn(doc, `Page ${i + 1} / ${range.count}`, TX + TW - 56, fy + 34, 52, { size: FS.small, color: BRAND.muted, align: 'right' });
    }
  }
};

const resolvePanelName = (results) => {
  const names = [...new Set((results || []).map((r) => r.testNameEn || r.testNameAr).filter(Boolean))];
  if (names.length === 1) return names[0];
  if (names.some((n) => /cbc|blood count|hematology/i.test(n))) return 'CBC / Hematology';
  return names[0] || 'Laboratory Panel';
};

const drawAttachments = async (doc, y, attachments, logoBuf) => {
  if (!attachments?.length) return y;
  let hasImg = false;
  for (const a of attachments) {
    const buffer = await readImageBuffer(a.file_url);
    if (buffer?.length) { hasImg = true; break; }
  }
  if (!hasImg) return y;
  y = ensureSpace(doc, y, 22, logoBuf, () => M + 4);
  roundRect(doc, TX, y, TW, 16, 2, BRAND.slateDark, null);
  cellBi(doc, 'Microscope Images', 'صور المجهر', TX + 8, y + 3, TW - 16, { size: FS.sectionHead, weight: 'semibold', color: BRAND.white });
  return y + 18;
};

const generateReportPDF = async (reportData, outputDir, options = {}) => {
  const filename = options.filename || `report-${reportData.reportNumber}-${uuidv4().slice(0, 8)}.pdf`;
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, filename);

  const qrData = await generateQR({
    reportNumber: reportData.reportNumber,
    sampleCode: reportData.sampleCode,
    verificationCode: reportData.verificationCode,
  });
  const qrBuffer = Buffer.from(qrData.replace(/^data:image\/png;base64,/, ''), 'base64');

  let barcodeBuffer = null;
  const bcText = reportData.barcode || reportData.sampleCode;
  if (bcText) {
    try {
      const bc = await generateCode128(bcText);
      barcodeBuffer = Buffer.from(bc.replace(/^data:image\/png;base64,/, ''), 'base64');
    } catch { /* */ }
  }

  const logoBuf = HAS_LOGO ? await getBrandLogoBuffer(BRAND.primary) : null;
  reportData.panelName = reportData.panelName || resolvePanelName(reportData.results);
  reportData.instrument = reportData.instrument || resolveInstruments(reportData.results);

  const lang = reportData.language || 'ar';
  const counts = buildResultCounts(reportData.results || []);
  const summaryItems = buildClinicalSummary(reportData.results || [], lang);

  return new Promise((resolve, reject) => {
    (async () => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true, bufferPages: true });
        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);
        registerFonts(doc);

        drawWatermark(doc, logoBuf);
        let y = drawHeader(doc, { ...reportData, panelName: reportData.panelName }, barcodeBuffer, logoBuf);
        y = drawPatientCard(doc, reportData, y);
        y = drawResultOverview(doc, y, counts, lang);
        y = drawResultsTable(doc, reportData.results || [], { ...reportData, _logoBuf: logoBuf }, y);
        y = drawClinicalSummaryCard(doc, y, summaryItems, lang, logoBuf);
        y = drawTreatmentRecommendations(doc, y, reportData.treatmentRecommendations, logoBuf);
        y = await drawAttachments(doc, y, reportData.attachments || [], logoBuf);
        y = drawSignatures(doc, y, reportData, qrBuffer);
        stampFooter(doc);

        doc.end();
        stream.on('finish', () => resolve({ filePath, filename, url: `/uploads/reports/${filename}` }));
        stream.on('error', reject);
      } catch (err) {
        reject(err);
      }
    })();
  });
};

module.exports = {
  designId: 2,
  designName: 'Premium World-Class Medical Report',
  generateReportPDF,
};
