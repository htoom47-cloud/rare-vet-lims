const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const env = require('../config/env');
const { generateQR } = require('./barcode');
const { readImageBuffer } = require('../config/storage');

const ARABIC_FONT_PATH = path.join(__dirname, '../../assets/fonts/NotoSansArabic-Regular.ttf');
const LOGO_PATH = path.join(__dirname, '../../assets/logo.png');
const HAS_ARABIC_FONT = fs.existsSync(ARABIC_FONT_PATH);
const HAS_LOGO = fs.existsSync(LOGO_PATH);

const MARGIN = 28;
const PAGE_W = 595;
const PAGE_H = 842;
const TX = MARGIN;
const TW = PAGE_W - MARGIN * 2;
const PAGE_BOTTOM = PAGE_H - 36;

const BRAND = {
  brown: '#4A3728', gold: '#C5A059', goldLight: '#E8D5B5', goldPale: '#F5EDE0',
  cream: '#FDFAF3', border: '#D4C4A8', muted: '#6b7280', white: '#ffffff',
};

const PANEL_COLORS = ['#3182CE', '#38A169', '#DD6B20', '#805AD5', '#C5A059'];
const FLAG_COLORS = {
  HIGH: '#dc2626', CRIT_HIGH: '#991b1b', NORMAL: '#16a34a', LOW: '#2563eb', CRIT_LOW: '#1d4ed8',
  POS: '#dc2626', NEG: '#16a34a',
};
const FLAG = {
  en: { NORMAL: 'Normal', HIGH: 'High', LOW: 'Low', CRIT_HIGH: 'Crit.H', CRIT_LOW: 'Crit.L', POS: 'Positive', NEG: 'Negative' },
  ar: { NORMAL: 'معتدل', HIGH: 'مرتفع', LOW: 'منخفض', CRIT_HIGH: 'حرج', CRIT_LOW: 'حرج', POS: 'إيجابي', NEG: 'سلبي' },
};

const PATIENT_FIELDS = [
  { en: 'Report No', ar: 'رقم التقرير', key: 'reportNumber' },
  { en: 'Sample ID', ar: 'رقم العينة', key: 'sampleCode' },
  { en: 'Date', ar: 'التاريخ', key: 'dateStr' },
  { en: 'Client', ar: 'العميل', key: 'customerName' },
  { en: 'Animal ID', ar: 'رقم الحيوان', key: 'animalCode' },
  { en: 'Species', ar: 'النوع', key: 'species' },
  { en: 'Name', ar: 'الاسم', key: 'animalName' },
  { en: 'Gender', ar: 'الجنس', key: 'gender' },
];

const ANIMAL_TYPES = {
  camel: { en: 'Camel', ar: 'إبل' }, horse: { en: 'Horse', ar: 'حصان' },
  sheep: { en: 'Sheep', ar: 'غنم' }, goat: { en: 'Goat', ar: 'ماعز' },
  bird: { en: 'Bird', ar: 'طير' }, cat: { en: 'Cat', ar: 'قط' }, dog: { en: 'Dog', ar: 'كلب' },
};
const GENDERS = {
  male: { en: 'Male', ar: 'ذكر' }, female: { en: 'Female', ar: 'أنثى' }, unknown: { en: 'Unknown', ar: 'غير محدد' },
};

const { drawArBox, registerPdfFonts } = require('./pdf-arabic');

const registerFonts = (doc) => {
  registerPdfFonts(doc);
  if (HAS_ARABIC_FONT) doc.registerFont('Arabic', ARABIC_FONT_PATH);
  doc.registerFont('Latin', 'Helvetica');
  doc.registerFont('Latin-Bold', 'Helvetica-Bold');
};

const clean = (t) => String(t ?? '')
  .replace(/•/g, '-').replace(/—/g, '-').replace(/\u2013/g, '-').replace(/\u00A0/g, ' ')
  .replace(/μ/g, 'u').replace(/µ/g, 'u').replace(/³/g, '3').replace(/⁶/g, '6').replace(/⁹/g, '9');

const hasAr = (t) => /[\u0600-\u06FF]/.test(String(t || ''));

const setLatin = (doc, bold = false) => doc.font(bold ? 'Latin-Bold' : 'Latin');

const ensureSpace = (doc, h) => {
  if (doc.y + h > PAGE_BOTTOM) { doc.addPage(); doc.y = MARGIN; }
};

const cellLatin = (doc, text, x, y, w, h, opts = {}) => {
  const { size = 6.5, color = BRAND.brown, bold = false, align = 'left' } = opts;
  setLatin(doc, bold);
  doc.fontSize(size).fillColor(color);
  doc.text(clean(text), x, y, { width: w, height: h, align, lineBreak: false, ellipsis: true });
};

const cellArabic = (doc, text, x, y, w, h, opts = {}) => {
  const { size = 6.5, color = BRAND.brown, bold = false, align = 'right' } = opts;
  drawArBox(doc, clean(text), x, y, w, { size, color, bold, align, fromTop: true });
};

const strokeCell = (doc, x, y, w, h, fill) => {
  if (fill) doc.rect(x, y, w, h).fill(fill);
  doc.rect(x, y, w, h).lineWidth(0.4).strokeColor(BRAND.border).stroke();
};

/** English left half + Arabic right half — never mixed in one font */
const bilingualBar = (doc, x, y, w, h, textEn, textAr, bg, opts = {}) => {
  const { enColor = '#fff', arColor = '#fff', size = 7 } = opts;
  doc.rect(x, y, w, h).fill(bg);
  doc.rect(x, y, w, h).stroke(BRAND.border);
  const half = w / 2;
  cellLatin(doc, textEn, x + 4, y + (h - size) / 2 - 1, half - 6, h, { size, color: enColor, bold: true });
  cellArabic(doc, textAr, x + half, y + (h - size) / 2 - 1, half - 4, h, { size, color: arColor, bold: true, align: 'right' });
};

const flowLatin = (doc, text, width, opts = {}) => {
  if (!text) return;
  setLatin(doc);
  doc.fontSize(opts.size || 6.5).fillColor(opts.color || BRAND.brown);
  doc.text(clean(text), TX + 4, doc.y, { width, align: 'left', lineGap: 0.5 });
};

const flowArabic = (doc, text, width, opts = {}) => {
  if (!text) return;
  const size = opts.size || 6.5;
  const lines = String(text).split('\n');
  for (const line of lines) {
    if (!line.trim()) { doc.y += size * 0.5; continue; }
    drawArBox(doc, clean(line), TX + 4, doc.y, width, {
      size, color: opts.color || BRAND.brown, align: 'right', fromTop: true,
    });
    doc.y += size + 4;
  }
};

const drawHeader = (doc) => {
  const top = 10;
  const headerH = 72;
  doc.rect(0, 0, PAGE_W, 2).fill(BRAND.gold);
  doc.rect(0, 2, PAGE_W, headerH).fill(BRAND.cream);
  if (HAS_LOGO) doc.image(LOGO_PATH, TX, top + 4, { width: 40, height: 40 });

  const textX = TX + 48;
  const textW = PAGE_W - textX - MARGIN;
  const half = textW / 2;
  const labAr = env.lab.nameAr || 'مركز رعاية النوادر البيطري';
  const labEn = env.lab.name || 'Rare Animals Veterinary Care Center';

  // السطر 1: إنجليزي يسار | عربي يمين — بدون تداخل
  cellLatin(doc, labEn, textX, top + 4, half - 6, 16, { size: 10, bold: true, align: 'left' });
  cellArabic(doc, labAr, textX + half, top + 4, half - 4, 16, { size: 10, bold: true, align: 'right' });

  // السطر 2: وصف المختبر
  cellLatin(doc, env.lab.subtitle, textX, top + 22, textW, 9, { size: 6.5, color: BRAND.muted, align: 'center' });
  cellArabic(doc, env.lab.subtitleAr, textX, top + 32, textW, 9, { size: 6.5, color: BRAND.gold, align: 'center' });

  // السطر 3: التواصل
  cellLatin(doc, `${env.lab.phone}  |  ${env.lab.email}`, textX, top + 44, textW, 9, { size: 6, color: BRAND.muted, align: 'center' });

  doc.rect(0, headerH + 2, PAGE_W, 1).fill(BRAND.goldLight);
  doc.y = headerH + 10;
};

const drawTitleBanner = (doc) => {
  const y = doc.y;
  bilingualBar(doc, TX, y, TW, 18, 'Laboratory Results Report', 'تقرير نتائج المختبر', BRAND.brown, { size: 9 });
  doc.y = y + 22;
};

const drawPatientValue = (doc, x, y, w, h, val, bg) => {
  strokeCell(doc, x, y, w, h, bg);
  if (val && typeof val === 'object') {
    const half = w / 2;
    cellLatin(doc, val.en || '-', x + 4, y + 3, half - 6, h - 4, { size: 6.5, bold: true, align: 'left' });
    cellArabic(doc, val.ar || '-', x + half, y + 3, half - 4, h - 4, { size: 6.5, bold: true, align: 'right' });
  } else {
    const str = String(val ?? '-');
    if (hasAr(str)) {
      cellArabic(doc, str, x + 4, y + 3, w - 8, h - 4, { size: 6.5, bold: true, align: 'center' });
    } else {
      cellLatin(doc, str, x + 4, y + 3, w - 8, h - 4, { size: 6.5, bold: true, align: 'center' });
    }
  }
};

const drawPatientTable = (doc, data) => {
  const labelW = 108;
  const valueW = TW - labelW * 2;
  const rowH = 15;
  const y0 = doc.y;

  bilingualBar(doc, TX, y0, TW, 16, 'Patient Information', 'بيانات التقرير والحالة', BRAND.goldPale, {
    enColor: BRAND.brown, arColor: BRAND.brown, size: 7.5,
  });

  let y = y0 + 16;
  PATIENT_FIELDS.forEach((f, i) => {
    ensureSpace(doc, rowH);
    if (doc.y > y) y = doc.y;
    const bg = i % 2 === 0 ? BRAND.cream : BRAND.white;
    const val = data[f.key];

    strokeCell(doc, TX, y, labelW, rowH, bg);
    cellLatin(doc, f.en, TX + 3, y + 4, labelW - 6, rowH - 5, { size: 6.5, color: BRAND.muted, bold: true });

    drawPatientValue(doc, TX + labelW, y, valueW, rowH, val, bg);

    strokeCell(doc, TX + labelW + valueW, y, labelW, rowH, BRAND.goldPale);
    cellArabic(doc, f.ar, TX + labelW + valueW + 3, y + 4, labelW - 6, rowH - 5, { size: 6.5, color: BRAND.muted, bold: true });

    y += rowH;
  });
  doc.y = y + 4;
};

// Layout: EN (left) | RESULT + REF + UNITS + STATUS (center) | AR test name (right)
const COLS = [135, 58, 98, 58, 55, 135];
const COL = { TEST_EN: 0, RESULT: 1, REF: 2, UNIT: 3, STATUS_EN: 4, TEST_AR: 5 };
const colXs = () => { const xs = []; let x = TX; COLS.forEach((w) => { xs.push(x); x += w; }); return xs; };

const drawResultsTable = (doc, results) => {
  const xs = colXs();
  const rowH = 14;
  const headH = 18;
  let y = doc.y;

  ensureSpace(doc, headH + 20);

  // Header row
  strokeCell(doc, xs[COL.TEST_EN], y, COLS[COL.TEST_EN], headH, BRAND.brown);
  cellLatin(doc, 'TEST', xs[COL.TEST_EN] + 3, y + 5, COLS[COL.TEST_EN] - 6, 10, { size: 6.5, color: BRAND.goldPale, bold: true, align: 'left' });

  [
    { i: COL.RESULT, en: 'RESULT', ar: 'النتيجة' },
    { i: COL.REF, en: 'REF RANGE', ar: 'المرجع' },
    { i: COL.UNIT, en: 'UNITS', ar: 'الوحدة' },
  ].forEach(({ i, en, ar }) => {
    strokeCell(doc, xs[i], y, COLS[i], headH, BRAND.brown);
    cellLatin(doc, en, xs[i] + 1, y + 2, COLS[i] - 2, 8, { size: 5.5, color: BRAND.goldPale, bold: true, align: 'center' });
    cellArabic(doc, ar, xs[i] + 1, y + 10, COLS[i] - 2, 8, { size: 5.5, color: BRAND.goldPale, bold: true, align: 'center' });
  });

  strokeCell(doc, xs[COL.STATUS_EN], y, COLS[COL.STATUS_EN], headH, BRAND.brown);
  cellLatin(doc, 'STATUS', xs[COL.STATUS_EN] + 1, y + 5, COLS[COL.STATUS_EN] - 2, 10, { size: 6, color: BRAND.goldPale, bold: true, align: 'center' });

  strokeCell(doc, xs[COL.TEST_AR], y, COLS[COL.TEST_AR], headH, BRAND.brown);
  cellArabic(doc, 'الفحص', xs[COL.TEST_AR] + 3, y + 5, COLS[COL.TEST_AR] - 6, 10, { size: 6.5, color: BRAND.goldPale, bold: true, align: 'right' });

  y += headH;

  const groups = [];
  const map = new Map();
  results.forEach((r) => {
    const key = r.testNameEn || 'Results';
    if (!map.has(key)) {
      map.set(key, { nameEn: r.testNameEn || key, nameAr: r.testNameAr || key, items: [] });
      groups.push(map.get(key));
    }
    map.get(key).items.push(r);
  });

  groups.forEach((group, gi) => {
    ensureSpace(doc, rowH + 2);
    if (doc.y > y) y = doc.y;
    bilingualBar(doc, TX, y, TW, rowH, group.nameEn, group.nameAr, PANEL_COLORS[gi % PANEL_COLORS.length], { size: 6.5 });
    y += rowH;

    group.items.forEach((row, ri) => {
      ensureSpace(doc, rowH);
      if (doc.y > y) y = doc.y;
      const bg = ri % 2 === 0 ? BRAND.cream : BRAND.white;
      const fc = FLAG_COLORS[row.flag] || BRAND.brown;

      strokeCell(doc, xs[COL.TEST_EN], y, COLS[COL.TEST_EN], rowH, bg);
      cellLatin(doc, row.nameEn || '-', xs[COL.TEST_EN] + 3, y + 3, COLS[COL.TEST_EN] - 6, rowH - 4, { size: 6, align: 'left' });

      strokeCell(doc, xs[COL.RESULT], y, COLS[COL.RESULT], rowH, bg);
      const resultStr = String(row.value ?? '-');
      if (hasAr(resultStr)) {
        cellArabic(doc, resultStr, xs[COL.RESULT] + 1, y + 3, COLS[COL.RESULT] - 2, rowH - 4, { size: 6.5, color: fc, bold: true, align: 'center' });
      } else {
        cellLatin(doc, resultStr, xs[COL.RESULT] + 1, y + 3, COLS[COL.RESULT] - 2, rowH - 4, { size: 6.5, color: fc, bold: true, align: 'center' });
      }

      strokeCell(doc, xs[COL.REF], y, COLS[COL.REF], rowH, bg);
      cellLatin(doc, row.reference, xs[COL.REF] + 1, y + 3, COLS[COL.REF] - 2, rowH - 4, { size: 6, color: BRAND.muted, align: 'center' });

      strokeCell(doc, xs[COL.UNIT], y, COLS[COL.UNIT], rowH, bg);
      cellLatin(doc, row.unit || '-', xs[COL.UNIT] + 1, y + 3, COLS[COL.UNIT] - 2, rowH - 4, { size: 5.5, color: BRAND.muted, align: 'center' });

      strokeCell(doc, xs[COL.STATUS_EN], y, COLS[COL.STATUS_EN], rowH, bg);
      cellLatin(doc, FLAG.en[row.flag] || '-', xs[COL.STATUS_EN] + 1, y + 3, COLS[COL.STATUS_EN] - 2, rowH - 4, { size: 6, color: fc, bold: true, align: 'center' });

      strokeCell(doc, xs[COL.TEST_AR], y, COLS[COL.TEST_AR], rowH, bg);
      cellArabic(doc, row.nameAr || '-', xs[COL.TEST_AR] + 3, y + 3, COLS[COL.TEST_AR] - 6, rowH - 4, { size: 6, align: 'right' });

      y += rowH;
    });
  });
  doc.y = y + 4;
};

const drawMicroscopeImages = async (doc, attachments) => {
  if (!attachments?.length) return;

  const images = [];
  for (const a of attachments) {
    const buffer = await readImageBuffer(a.file_url);
    if (buffer?.length) {
      images.push({ ...a, source: buffer, isPath: false });
    }
  }

  if (!images.length) return;

  ensureSpace(doc, 80);
  let y = doc.y;
  bilingualBar(doc, TX, y, TW, 14, 'Microscope Images', 'صور المجهر', BRAND.gold, { size: 7 });
  y += 18;

  const maxW = TW;
  const maxH = 280;

  for (const img of images) {
    let meta;
    try {
      meta = doc.openImage(img.source);
    } catch {
      continue;
    }

    let drawW = maxW;
    let drawH = drawW * (meta.height / meta.width);
    if (drawH > maxH) {
      drawH = maxH;
      drawW = drawH * (meta.width / meta.height);
    }

    ensureSpace(doc, drawH + 24);
    y = Math.max(y, doc.y);
    const x = TX + (TW - drawW) / 2;

    doc.image(img.source, x, y, { width: drawW, height: drawH });

    const caption = img.caption || img.test_name_ar || img.test_name || '';
    if (caption) {
      cellLatin(doc, caption, TX, y + drawH + 2, TW, 12, { size: 6, color: BRAND.muted, align: 'center' });
      y += drawH + 16;
    } else {
      y += drawH + 8;
    }
  }

  doc.y = y + 4;
};

const drawNotes = (doc, treatment) => {
  const treat = (treatment || '').trim();
  if (!treat) return;

  ensureSpace(doc, 30);
  const y = doc.y;
  bilingualBar(doc, TX, y, TW, 14, 'Recommendations', 'التوصيات العلاجية', BRAND.gold, { size: 7 });
  doc.y = y + 16;
  if (hasAr(treat)) flowArabic(doc, treat, TW - 8);
  else flowLatin(doc, treat, TW - 8);
  doc.y += 4;
};

const drawCheck = (doc, x, y, size = 10) => {
  setLatin(doc, true);
  doc.fontSize(size).fillColor('#16a34a');
  doc.text('\u2713', x, y, { lineBreak: false });
};

const drawApprovalCell = (doc, x, y, w, h, titleEn, titleAr, approval) => {
  const headerH = 14;
  strokeCell(doc, x, y, w, h, BRAND.cream);
  bilingualBar(doc, x, y, w, headerH, titleEn, titleAr, BRAND.brown, { size: 5.5 });

  const bodyY = y + headerH + 5;
  if (approval?.approved && approval.name) {
    drawCheck(doc, x + 6, bodyY, 11);
    const nameX = x + 20;
    const nameW = w - 26;
    if (hasAr(approval.name)) cellArabic(doc, approval.name, nameX, bodyY, nameW, 12, { size: 7, align: 'right' });
    else cellLatin(doc, approval.name, nameX, bodyY, nameW, 12, { size: 7 });
    if (approval.approvedAt) {
      const stamp = formatApprovalStamp(approval.approvedAt);
      cellLatin(doc, stamp, nameX, bodyY + 12, nameW, 8, { size: 5.5, color: BRAND.muted, align: 'right' });
    }
  } else {
    doc.moveTo(x + 6, y + h - 6).lineTo(x + w - 6, y + h - 6).strokeColor(BRAND.gold).lineWidth(0.6).stroke();
  }
};

const drawApprovals = (doc, reportData) => {
  ensureSpace(doc, 48);
  const y = doc.y;
  const half = TW / 2;
  const rowH = 42;

  drawApprovalCell(doc, TX, y, half, rowH, 'Lab Specialist Approval', 'موافقة أخصائي المختبر', reportData.labApproval);
  drawApprovalCell(doc, TX + half, y, half, rowH, 'Veterinarian Approval', 'موافقة الطبيب البيطري', reportData.vetApproval);
  doc.y = y + rowH + 6;
};

const drawFooter = async (doc, reportData) => {
  ensureSpace(doc, 44);
  const y = doc.y;

  const qrData = await generateQR({
    reportNumber: reportData.reportNumber,
    sampleCode: reportData.sampleCode,
    verificationCode: reportData.verificationCode,
  });
  const qrBuffer = Buffer.from(qrData.replace(/^data:image\/png;base64,/, ''), 'base64');

  doc.moveTo(TX, y).lineTo(TX + TW, y).strokeColor(BRAND.border).stroke();
  doc.image(qrBuffer, TX, y + 4, { width: 38 });
  cellLatin(doc, 'Scan to verify', TX + 44, y + 6, 95, 8, { size: 5.5, color: BRAND.muted });
  cellArabic(doc, 'امسح للتحقق', TX + 44, y + 14, 95, 8, { size: 5.5, color: BRAND.muted, align: 'right' });
  cellLatin(doc, reportData.verificationCode, TX + 44, y + 22, 95, 8, { size: 5.5, color: '#9ca3af' });

  const labEn = env.lab.name || 'Rare Animals Veterinary Care Center';
  const labAr = env.lab.nameAr || 'مركز رعاية النوادر البيطري';
  const issuedY = y + 32;
  cellLatin(doc, `Issued by ${labEn}`, TX, issuedY, TW / 2 - 4, 8, { size: 5.5, color: '#9ca3af', align: 'center' });
  cellArabic(doc, `صادر من ${labAr}`, TX + TW / 2 + 4, issuedY, TW / 2 - 4, 8, { size: 5.5, color: '#9ca3af', align: 'center' });
  doc.y = y + 44;
};

const formatShortDate = (date) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

const formatApprovalStamp = (date) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${formatShortDate(d)}  ${time}`;
};

const generateReportPDF = async (reportData, outputDir, options = {}) => {
  const filename = options.filename || `report-${reportData.reportNumber}-${uuidv4().slice(0, 8)}.pdf`;
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, filename);

  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);
      registerFonts(doc);
      doc.y = MARGIN;

      drawHeader(doc);
      drawTitleBanner(doc);
      drawPatientTable(doc, {
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
      });

      drawResultsTable(doc, reportData.results);
      await drawMicroscopeImages(doc, reportData.attachments);
      drawNotes(doc, reportData.treatmentRecommendations);
      drawApprovals(doc, reportData);
      await drawFooter(doc, reportData);

      doc.end();
      stream.on('finish', () => resolve({ filePath, filename, url: `/uploads/reports/${filename}` }));
      stream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = { generateReportPDF };
