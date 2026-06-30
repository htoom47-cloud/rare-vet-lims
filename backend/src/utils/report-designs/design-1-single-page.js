/**
 * Single A4 page layout — CBC and routine panels (≤34 rows, no images).
 * Frozen as part of report design #1 single-page mode.
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const env = require('../../config/env');
const { LAB_NAME_EN, LAB_NAME_AR } = require('../../constants/brand');
const { generateQR } = require('../barcode');
const { drawArBox, registerPdfFonts } = require('../pdf-arabic');
const { isAbnormalFlag } = require('./layout-mode');
const { HAS_LOGO, REPORT_LOGO_SIZE_COMPACT, getBrandLogoBuffer } = require('../pdf-logo');

const ARABIC_FONT_PATH = path.join(__dirname, '../../../assets/fonts/NotoSansArabic-Regular.ttf');
const LOGO_PATH = path.join(__dirname, '../../../assets/logo.png');
const HAS_ARABIC_FONT = fs.existsSync(ARABIC_FONT_PATH);

const PAGE_W = 595;
const PAGE_H = 842;
const M = 14;
const FOOTER_H = 11;
const TX = M;
const TW = PAGE_W - M * 2;
const PAGE_BOTTOM = PAGE_H - FOOTER_H - 3;

const BRAND = {
  brown: '#4A3728', brownMid: '#5B3A29', gold: '#C5A059', goldLight: '#E8D5B5',
  cream: '#FDFAF3', border: '#D4C4A8', muted: '#6b7280', white: '#ffffff', headerBg: '#F7F5F2',
};

const FLAG_COLORS = {
  HIGH: '#dc2626', CRIT_HIGH: '#991b1b', NORMAL: '#16a34a', LOW: '#2563eb', CRIT_LOW: '#1d4ed8',
  POS: '#dc2626', NEG: '#16a34a',
};
const FLAG_SYMBOL = {
  NORMAL: '', HIGH: '\u2191', LOW: '\u2193', CRIT_HIGH: '\u2191\u2191', CRIT_LOW: '\u2193\u2193',
  POS: '+', NEG: '\u2212',
};

const ANIMAL_TYPES = {
  camel: { en: 'Camel', ar: 'إبل' }, horse: { en: 'Horse', ar: 'حصان' },
  sheep: { en: 'Sheep', ar: 'غنم' }, goat: { en: 'Goat', ar: 'ماعز' },
  bird: { en: 'Bird', ar: 'طير' }, cat: { en: 'Cat', ar: 'قط' }, dog: { en: 'Dog', ar: 'كلب' },
};
const GENDERS = {
  male: { en: 'M', ar: 'ذ' }, female: { en: 'F', ar: 'أ' }, unknown: { en: '-', ar: '-' },
};

const registerFonts = (doc) => {
  registerPdfFonts(doc);
  if (HAS_ARABIC_FONT) doc.registerFont('Arabic', ARABIC_FONT_PATH);
  doc.registerFont('Latin', 'Helvetica');
  doc.registerFont('Latin-Bold', 'Helvetica-Bold');
};

const clean = (t) => String(t ?? '')
  .replace(/μ/g, 'u').replace(/µ/g, 'u').replace(/³/g, '3');

const hasAr = (t) => /[\u0600-\u06FF]/.test(String(t || ''));

const pinY = (doc, y) => { doc.y = y; };

const cellEn = (doc, text, x, y, w, opts = {}) => {
  const { size = 6, color = BRAND.brown, bold = false, align = 'left' } = opts;
  const saved = doc.y;
  doc.font(bold ? 'Latin-Bold' : 'Latin').fontSize(size).fillColor(color);
  doc.text(clean(text), x, y, { width: w, align, lineBreak: false, ellipsis: true });
  doc.y = saved;
};

const cellAr = (doc, text, x, y, w, opts = {}) => {
  const saved = doc.y;
  drawArBox(doc, clean(text), x, y, w, {
    size: opts.size || 6, color: opts.color || BRAND.brown,
    bold: opts.bold || false, align: opts.align || 'right', fromTop: true,
  });
  doc.y = saved;
};

const strokeBox = (doc, x, y, w, h, fill) => {
  if (fill) doc.rect(x, y, w, h).fill(fill);
  doc.rect(x, y, w, h).lineWidth(0.35).strokeColor(BRAND.border).stroke();
};

const formatShortDate = (date) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

const drawHeader = (doc, reportData, qrBuffer, logoBuf) => {
  const headerH = 40;
  const logoSize = REPORT_LOGO_SIZE_COMPACT;
  doc.rect(0, 0, PAGE_W, 2).fill(BRAND.gold);
  doc.rect(0, 2, PAGE_W, headerH).fill(BRAND.headerBg);

  if (logoBuf) {
    try { doc.image(logoBuf, TX, 5, { width: logoSize, height: logoSize }); } catch { /* */ }
  } else if (HAS_LOGO) {
    try { doc.image(LOGO_PATH, TX, 5, { width: logoSize, height: logoSize }); } catch { /* */ }
  }

  const textX = TX + logoSize + 6;
  const textW = TW - 78;
  const labEn = env.lab.name || LAB_NAME_EN;
  const labAr = env.lab.nameAr || LAB_NAME_AR;

  cellEn(doc, labEn, textX, 5, textW / 2 - 4, { size: 8.5, bold: true });
  cellAr(doc, labAr, textX + textW / 2, 5, textW / 2 - 4, { size: 8.5, bold: true, align: 'right' });
  cellEn(doc, 'Laboratory Results Report  |  تقرير نتائج المختبر', textX, 17, textW, {
    size: 6, color: BRAND.brownMid, bold: true, align: 'center',
  });
  cellEn(doc, `${env.lab.phone}  ·  ${reportData.reportNumber}`, textX, 27, textW, {
    size: 5.5, color: BRAND.muted, align: 'center',
  });

  const badge = reportData.isFinal !== false ? 'FINAL' : 'PRELIM';
  const badgeW = 40;
  cellEn(doc, badge, TX + TW - badgeW, 6, badgeW, {
    size: 5.5, bold: true, color: reportData.isFinal !== false ? '#16a34a' : '#d97706', align: 'right',
  });

  if (qrBuffer) {
    const saved = doc.y;
    doc.image(qrBuffer, TX + TW - 30, 18, { width: 26, height: 26 });
    doc.y = saved;
  }

  doc.rect(0, headerH + 2, PAGE_W, 0.5).fill(BRAND.goldLight);
  return headerH + 5;
};

const drawPatientStrip = (doc, data, y0) => {
  const rowH = 9;
  const cols = 4;
  const colW = TW / cols;
  const species = data.species;
  const gender = data.gender;
  const rows = [
    [
      { en: 'Report', ar: 'التقرير', val: data.reportNumber },
      { en: 'Sample', ar: 'العينة', val: data.sampleCode },
      { en: 'Date', ar: 'التاريخ', val: data.dateStr },
      { en: 'Client', ar: 'العميل', val: data.customerName },
    ],
    [
      { en: 'Animal', ar: 'الحيوان', val: data.animalCode },
      { en: 'Species', ar: 'النوع', val: species ? `${species.en}` : '-' },
      { en: 'Name', ar: 'الاسم', val: data.animalName },
      { en: 'Gender', ar: 'الجنس', val: gender ? gender.en : '-' },
    ],
  ];

  let y = y0;
  rows.forEach((row, ri) => {
    row.forEach((f, ci) => {
      const x = TX + ci * colW;
      const bg = ri % 2 === 0 ? BRAND.cream : BRAND.white;
      strokeBox(doc, x, y, colW, rowH, bg);
      cellEn(doc, `${f.en}:`, x + 2, y + 1, 28, rowH - 2, { size: 4.5, color: BRAND.muted, bold: true });
      const val = String(f.val ?? '-');
      if (hasAr(val)) cellAr(doc, val, x + 30, y + 1, colW - 32, rowH - 2, { size: 5.5, bold: true });
      else cellEn(doc, val, x + 30, y + 1, colW - 32, rowH - 2, { size: 5.5, bold: true });
    });
    y += rowH;
  });
  return y + 2;
};

const COLS = [128, 54, 88, 48, 32, 132];
const COL = { TEST_EN: 0, RESULT: 1, REF: 2, UNIT: 3, FLAG: 4, TEST_AR: 5 };
const colXs = () => { const xs = []; let x = TX; COLS.forEach((w) => { xs.push(x); x += w; }); return xs; };

const drawResultsTable = (doc, results) => {
  const xs = colXs();
  const rowH = 10;
  const headH = 11;
  let y = doc.y;

  const drawHead = () => {
    strokeBox(doc, xs[COL.TEST_EN], y, COLS[COL.TEST_EN], headH, BRAND.brownMid);
    cellEn(doc, 'TEST', xs[COL.TEST_EN] + 2, y + 2, COLS[COL.TEST_EN] - 4, { size: 5.5, color: BRAND.goldLight, bold: true });
    [
      { i: COL.RESULT, t: 'RESULT' },
      { i: COL.REF, t: 'REF' },
      { i: COL.UNIT, t: 'UNIT' },
      { i: COL.FLAG, t: '' },
    ].forEach(({ i, t }) => {
      strokeBox(doc, xs[i], y, COLS[i], headH, BRAND.brownMid);
      if (t) cellEn(doc, t, xs[i] + 1, y + 2, COLS[i] - 2, { size: 5, color: BRAND.goldLight, bold: true, align: 'center' });
    });
    strokeBox(doc, xs[COL.TEST_AR], y, COLS[COL.TEST_AR], headH, BRAND.brownMid);
    cellAr(doc, 'الفحص', xs[COL.TEST_AR] + 2, y + 2, COLS[COL.TEST_AR] - 4, { size: 5.5, color: BRAND.goldLight, bold: true, align: 'right' });
    y += headH;
    pinY(doc, y);
  };

  drawHead();

  results.forEach((row, ri) => {
    if (y + rowH > PAGE_BOTTOM - 48) {
      doc.addPage();
      y = M + 2;
      drawHead();
    }
    const bg = ri % 2 === 0 ? BRAND.cream : BRAND.white;
    const fc = FLAG_COLORS[row.flag] || BRAND.brown;
    const flagSym = FLAG_SYMBOL[row.flag] || '';

    strokeBox(doc, xs[COL.TEST_EN], y, COLS[COL.TEST_EN], rowH, bg);
    cellEn(doc, row.nameEn || '-', xs[COL.TEST_EN] + 2, y + 2, COLS[COL.TEST_EN] - 4, rowH - 3, { size: 5.5 });

    strokeBox(doc, xs[COL.RESULT], y, COLS[COL.RESULT], rowH, bg);
    const resultStr = String(row.value ?? '-');
    if (hasAr(resultStr)) cellAr(doc, resultStr, xs[COL.RESULT] + 1, y + 2, COLS[COL.RESULT] - 2, rowH - 3, { size: 6, color: fc, bold: true, align: 'center' });
    else cellEn(doc, resultStr, xs[COL.RESULT] + 1, y + 2, COLS[COL.RESULT] - 2, rowH - 3, { size: 6, color: fc, bold: true, align: 'center' });

    strokeBox(doc, xs[COL.REF], y, COLS[COL.REF], rowH, bg);
    cellEn(doc, row.reference, xs[COL.REF] + 1, y + 2, COLS[COL.REF] - 2, rowH - 3, { size: 5, color: BRAND.muted, align: 'center' });

    strokeBox(doc, xs[COL.UNIT], y, COLS[COL.UNIT], rowH, bg);
    cellEn(doc, row.unit || '-', xs[COL.UNIT] + 1, y + 2, COLS[COL.UNIT] - 2, rowH - 3, { size: 5, color: BRAND.muted, align: 'center' });

    strokeBox(doc, xs[COL.FLAG], y, COLS[COL.FLAG], rowH, bg);
    if (flagSym) cellEn(doc, flagSym, xs[COL.FLAG] + 1, y + 2, COLS[COL.FLAG] - 2, rowH - 3, { size: 7, color: fc, bold: true, align: 'center' });

    strokeBox(doc, xs[COL.TEST_AR], y, COLS[COL.TEST_AR], rowH, bg);
    cellAr(doc, row.nameAr || '-', xs[COL.TEST_AR] + 2, y + 2, COLS[COL.TEST_AR] - 4, rowH - 3, { size: 5.5, align: 'right' });

    y += rowH;
    pinY(doc, y);
  });

  doc.y = y + 1;
  return y;
};

const drawAbnormalSummary = (doc, y, results) => {
  const abnormal = results.filter((r) => isAbnormalFlag(r.flag));
  if (!abnormal.length) return y;

  const h = 12;
  const items = abnormal.map((r) => {
    const sym = FLAG_SYMBOL[r.flag] || '';
    return `${r.nameEn || r.nameAr}: ${r.value}${sym}`;
  }).join('   ·   ');

  doc.rect(TX, y, TW, h).fill('#fef2f2');
  doc.rect(TX, y, TW, h).lineWidth(0.4).strokeColor('#fecaca').stroke();
  cellEn(doc, 'Abnormal / غير طبيعي:', TX + 3, y + 1, 62, { size: 5, bold: true, color: '#991b1b' });
  cellEn(doc, items, TX + 66, y + 1, TW - 70, { size: 5, color: '#b91c1c' });
  pinY(doc, y + h + 1);
  return y + h + 1;
};

const drawNotesInline = (doc, y, text) => {
  const treat = String(text || '').trim();
  if (!treat) return y;
  const h = 11;
  doc.rect(TX, y, TW, h).fill(BRAND.cream).stroke(BRAND.border);
  if (hasAr(treat)) cellAr(doc, treat, TX + 3, y + 2, TW - 6, { size: 5.5, align: 'right' });
  else cellEn(doc, treat, TX + 3, y + 2, TW - 6, { size: 5.5 });
  return y + h + 1;
};

const drawApprovalsInline = (doc, y, reportData) => {
  const h = 18;
  const half = TW / 2;
  strokeBox(doc, TX, y, TW, h, BRAND.cream);

  const drawSig = (x, w, labelEn, labelAr, approval) => {
    cellEn(doc, labelEn, x + 3, y + 2, w / 2 - 4, { size: 4.5, color: BRAND.muted, bold: true });
    cellAr(doc, labelAr, x + w / 2, y + 2, w / 2 - 4, { size: 4.5, color: BRAND.muted, bold: true, align: 'right' });
    const name = approval?.approved ? approval.name : '________________';
    if (approval?.approved && hasAr(name)) cellAr(doc, name, x + 3, y + 9, w - 6, { size: 6, bold: true, align: 'right' });
    else cellEn(doc, name, x + 3, y + 9, w - 6, { size: 6, bold: true });
  };

  drawSig(TX, half, 'Lab Specialist', 'أخصائي المختبر', reportData.labApproval);
  drawSig(TX + half, half, 'Veterinarian', 'الطبيب البيطري', reportData.vetApproval);
  return y + h + 2;
};

const stampFooter = (doc, reportData) => {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    const fy = PAGE_H - FOOTER_H;
    doc.moveTo(TX, fy).lineTo(TX + TW, fy).lineWidth(0.3).strokeColor(BRAND.border).stroke();
    cellEn(doc, reportData.reportNumber || '', TX, fy + 2, TW / 3, { size: 4.5, color: BRAND.muted });
    cellEn(doc, `Page ${i + 1}/${range.count}`, TX + TW / 3, fy + 2, TW / 3, { size: 4.5, color: BRAND.muted, align: 'center' });
    cellEn(doc, 'Confidential — veterinary use only', TX + (TW * 2) / 3, fy + 2, TW / 3, { size: 4.5, color: '#b8a088', align: 'right' });
  }
};

const generateSinglePagePDF = async (reportData, outputDir, options = {}) => {
  const filename = options.filename || `report-${reportData.reportNumber}-${uuidv4().slice(0, 8)}.pdf`;
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, filename);

  const qrData = await generateQR({
    reportNumber: reportData.reportNumber,
    sampleCode: reportData.sampleCode,
    verificationCode: reportData.verificationCode,
  });
  const qrBuffer = Buffer.from(qrData.replace(/^data:image\/png;base64,/, ''), 'base64');
  const logoBuf = HAS_LOGO ? await getBrandLogoBuffer(BRAND.brownMid) : null;

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true, bufferPages: true });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);
      registerFonts(doc);

      let y = drawHeader(doc, reportData, qrBuffer, logoBuf);
      y = drawPatientStrip(doc, {
        reportNumber: reportData.reportNumber,
        sampleCode: reportData.sampleCode,
        dateStr: formatShortDate(reportData.date),
        customerName: reportData.customerName || '-',
        animalCode: reportData.animalCode,
        animalName: reportData.animalName || '-',
        species: {
          en: ANIMAL_TYPES[reportData.animalType]?.en || reportData.animalType,
          ar: ANIMAL_TYPES[reportData.animalType]?.ar || reportData.animalType,
        },
        gender: {
          en: GENDERS[reportData.animalGender]?.en || '-',
          ar: GENDERS[reportData.animalGender]?.ar || '-',
        },
      }, y);
      doc.y = y;

      const tableEndY = drawResultsTable(doc, reportData.results || []);
      y = drawAbnormalSummary(doc, tableEndY + 1, reportData.results || []);
      y = drawNotesInline(doc, y, reportData.treatmentRecommendations);
      y = drawApprovalsInline(doc, y, reportData);
      pinY(doc, y);

      stampFooter(doc, reportData);
      doc.end();
      stream.on('finish', () => resolve({ filePath, filename, url: `/uploads/reports/${filename}` }));
      stream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = { generateSinglePagePDF };
