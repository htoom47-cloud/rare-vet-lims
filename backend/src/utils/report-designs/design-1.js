const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const env = require('../../config/env');
const { LAB_NAME_EN, LAB_NAME_AR } = require('../../constants/brand');
const { generateQR } = require('../barcode');
const { readImageBuffer } = require('../../config/storage');
const { HAS_LOGO, REPORT_LOGO_SIZE, getBrandLogoBuffer } = require('../pdf-logo');

const ARABIC_FONT_PATH = path.join(__dirname, '../../../assets/fonts/NotoSansArabic-Regular.ttf');
const LOGO_PATH = path.join(__dirname, '../../../assets/logo.png');
const HAS_ARABIC_FONT = fs.existsSync(ARABIC_FONT_PATH);

const MARGIN = 22;
const PAGE_W = 595;
const PAGE_H = 842;
const TX = MARGIN;
const TW = PAGE_W - MARGIN * 2;
const FOOTER_H = 20;
const PAGE_BOTTOM = PAGE_H - FOOTER_H - 6;

const BRAND = {
  brown: '#4A3728', brownMid: '#5B3A29', gold: '#C5A059', goldLight: '#E8D5B5', goldPale: '#F5EDE0',
  cream: '#FDFAF3', border: '#D4C4A8', muted: '#6b7280', white: '#ffffff', headerBg: '#F7F5F2',
};

/** Unified panel palette — brand tones only */
const PANEL_COLORS = ['#5B3A29', '#6B4423', '#5B3A29', '#6B4423', '#5B3A29'];
const FLAG_COLORS = {
  HIGH: '#dc2626', CRIT_HIGH: '#991b1b', NORMAL: '#16a34a', LOW: '#2563eb', CRIT_LOW: '#1d4ed8',
  POS: '#dc2626', NEG: '#16a34a',
};
const FLAG_SYMBOL = {
  NORMAL: '', HIGH: '\u2191', LOW: '\u2193', CRIT_HIGH: '\u2191\u2191', CRIT_LOW: '\u2193\u2193',
  POS: '+', NEG: '\u2212',
};

const PATIENT_PAIRS = [
  [
    { en: 'Report No', ar: 'رقم التقرير', key: 'reportNumber' },
    { en: 'Sample ID', ar: 'رقم العينة', key: 'sampleCode' },
  ],
  [
    { en: 'Date', ar: 'التاريخ', key: 'dateStr' },
    { en: 'Client', ar: 'العميل', key: 'customerName' },
  ],
  [
    { en: 'Animal ID', ar: 'رقم الحيوان', key: 'animalCode' },
    { en: 'Species', ar: 'النوع', key: 'species' },
  ],
  [
    { en: 'Name', ar: 'الاسم', key: 'animalName' },
    { en: 'Gender', ar: 'الجنس', key: 'gender' },
  ],
];

const { ANIMAL_TYPE_LABELS } = require('../../constants/animal-types');
const GENDERS = {
  male: { en: 'Male', ar: 'ذكر' }, female: { en: 'Female', ar: 'أنثى' }, unknown: { en: 'Unknown', ar: 'غير محدد' },
};

const { drawArBox, registerPdfFonts } = require('../pdf-arabic');

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

const pinDocY = (doc, y) => { doc.y = y; };

/** Paginate by content Y — avoids spurious breaks when raster Arabic advances doc.y */
const ensureSpaceY = (doc, y, needH, onNewPage) => {
  if (y + needH <= PAGE_BOTTOM) return y;
  doc.addPage();
  return onNewPage ? onNewPage() : MARGIN + 4;
};

const ensureSpace = (doc, h) => {
  if (doc.y + h > PAGE_BOTTOM) { doc.addPage(); doc.y = MARGIN + 4; }
};

const cellLatin = (doc, text, x, y, w, h, opts = {}) => {
  const { size = 6.5, color = BRAND.brown, bold = false, align = 'left' } = opts;
  const savedY = doc.y;
  setLatin(doc, bold);
  doc.fontSize(size).fillColor(color);
  doc.text(clean(text), x, y, { width: w, height: h, align, lineBreak: false, ellipsis: true });
  doc.y = savedY;
};

const cellArabic = (doc, text, x, y, w, h, opts = {}) => {
  const { size = 6.5, color = BRAND.brown, bold = false, align = 'right' } = opts;
  const savedY = doc.y;
  drawArBox(doc, clean(text), x, y, w, { size, color, bold, align, fromTop: true });
  doc.y = savedY;
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

const drawHeader = (doc, reportData, logoBuf) => {
  const top = 6;
  const headerH = 58;
  const logoSize = REPORT_LOGO_SIZE;
  doc.rect(0, 0, PAGE_W, 3).fill(BRAND.gold);
  doc.rect(0, 3, PAGE_W, headerH).fill(BRAND.headerBg);
  if (logoBuf) {
    try { doc.image(logoBuf, TX, top + 4, { width: logoSize, height: logoSize }); } catch { /* */ }
  } else if (HAS_LOGO) {
    try { doc.image(LOGO_PATH, TX, top + 4, { width: logoSize, height: logoSize }); } catch { /* */ }
  }

  const textX = TX + logoSize + 8;
  const textW = PAGE_W - textX - MARGIN - 40;
  const half = textW / 2;
  const labAr = env.lab.nameAr || LAB_NAME_AR;
  const labEn = env.lab.name || LAB_NAME_EN;

  cellLatin(doc, labEn, textX, top + 4, half - 6, 14, { size: 9.5, bold: true, align: 'left' });
  cellArabic(doc, labAr, textX + half, top + 4, half - 4, 14, { size: 9.5, bold: true, align: 'right' });

  cellLatin(doc, env.lab.subtitle, textX, top + 20, textW, 8, { size: 6, color: BRAND.muted, align: 'center' });
  cellArabic(doc, env.lab.subtitleAr, textX, top + 28, textW, 8, { size: 6, color: BRAND.gold, align: 'center' });

  cellLatin(doc, `${env.lab.phone}  |  ${env.lab.email}`, textX, top + 40, textW, 8, { size: 5.5, color: BRAND.muted, align: 'center' });

  if (reportData?.reportNumber) {
    cellLatin(doc, reportData.reportNumber, PAGE_W - MARGIN - 38, top + 6, 36, 10, {
      size: 6, bold: true, color: BRAND.brownMid, align: 'right',
    });
  }

  doc.rect(0, headerH + 3, PAGE_W, 1).fill(BRAND.goldLight);
  doc.y = headerH + 8;
};

const drawTitleBanner = (doc, reportData = {}) => {
  const y = doc.y;
  bilingualBar(doc, TX, y, TW, 14, 'Laboratory Results Report', 'تقرير نتائج المختبر', BRAND.brownMid, { size: 8 });
  const badge = reportData.isFinal !== false ? 'FINAL' : 'PRELIM';
  const badgeAr = reportData.isFinal !== false ? 'نهائي' : 'مبدئي';
  const badgeW = 52;
  const badgeX = TX + TW - badgeW - 4;
  doc.rect(badgeX, y + 2, badgeW, 10).fill(reportData.isFinal !== false ? '#16a34a' : '#d97706');
  cellLatin(doc, badge, badgeX + 2, y + 3, badgeW / 2 - 2, 8, { size: 5.5, color: '#fff', bold: true, align: 'center' });
  cellArabic(doc, badgeAr, badgeX + badgeW / 2, y + 3, badgeW / 2 - 2, 8, { size: 5.5, color: '#fff', bold: true, align: 'center' });
  doc.y = y + 16;
};

const drawContinuationHeader = (doc, reportData) => {
  const y = MARGIN;
  doc.rect(TX, y, TW, 13).fill(BRAND.headerBg).stroke(BRAND.border);
  cellLatin(doc, env.lab.name || LAB_NAME_EN, TX + 4, y + 2, TW / 2 - 8, 10, {
    size: 6.5, bold: true, color: BRAND.brownMid,
  });
  cellLatin(doc, reportData.reportNumber || '', TX + TW / 2, y + 2, TW / 2 - 4, 10, {
    size: 6.5, color: BRAND.muted, align: 'right',
  });
  return y + 15;
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
  const rowH = 12;
  const bannerH = 12;
  const halfW = TW / 2;
  const labelW = 52;
  const arLabelW = 52;
  const valueW = halfW - labelW - arLabelW;
  const y0 = doc.y;

  bilingualBar(doc, TX, y0, TW, bannerH, 'Patient Information', 'بيانات التقرير والحالة', BRAND.goldPale, {
    enColor: BRAND.brown, arColor: BRAND.brown, size: 6.5,
  });

  let y = y0 + bannerH;
  PATIENT_PAIRS.forEach((pair, ri) => {
    ensureSpace(doc, rowH);
    if (doc.y > y) y = doc.y;
    const bg = ri % 2 === 0 ? BRAND.cream : BRAND.white;

    pair.forEach((f, col) => {
      const x0 = TX + col * halfW;
      const val = data[f.key];

      strokeCell(doc, x0, y, labelW, rowH, bg);
      cellLatin(doc, f.en, x0 + 2, y + 2, labelW - 4, rowH - 3, { size: 5.5, color: BRAND.muted, bold: true });

      drawPatientValue(doc, x0 + labelW, y, valueW, rowH, val, bg);

      strokeCell(doc, x0 + labelW + valueW, y, arLabelW, rowH, BRAND.goldPale);
      cellArabic(doc, f.ar, x0 + labelW + valueW + 2, y + 2, arLabelW - 4, rowH - 3, { size: 5.5, color: BRAND.muted, bold: true });
    });
    y += rowH;
  });
  doc.y = y + 2;
};

// Layout: EN (left) | RESULT + REF + UNITS + FLAG (center) | AR test name (right)
const COLS = [132, 56, 96, 54, 38, 138];
const COL = { TEST_EN: 0, RESULT: 1, REF: 2, UNIT: 3, STATUS_EN: 4, TEST_AR: 5 };
const colXs = () => { const xs = []; let x = TX; COLS.forEach((w) => { xs.push(x); x += w; }); return xs; };

const drawResultsTableHeader = (doc, y) => {
  const xs = colXs();
  const headH = 14;

  strokeCell(doc, xs[COL.TEST_EN], y, COLS[COL.TEST_EN], headH, BRAND.brownMid);
  cellLatin(doc, 'TEST', xs[COL.TEST_EN] + 3, y + 3, COLS[COL.TEST_EN] - 6, headH, { size: 6, color: BRAND.goldPale, bold: true, align: 'left' });

  [
    { i: COL.RESULT, en: 'RESULT', ar: 'النتيجة' },
    { i: COL.REF, en: 'REFERENCE', ar: 'المرجع' },
    { i: COL.UNIT, en: 'UNIT', ar: 'الوحدة' },
  ].forEach(({ i, en, ar }) => {
    strokeCell(doc, xs[i], y, COLS[i], headH, BRAND.brownMid);
    cellLatin(doc, en, xs[i] + 1, y + 2, COLS[i] - 2, 7, { size: 5, color: BRAND.goldPale, bold: true, align: 'center' });
    cellArabic(doc, ar, xs[i] + 1, y + 7, COLS[i] - 2, 7, { size: 4.5, color: BRAND.goldLight, bold: true, align: 'center' });
  });

  strokeCell(doc, xs[COL.STATUS_EN], y, COLS[COL.STATUS_EN], headH, BRAND.brownMid);
  cellLatin(doc, 'FLG', xs[COL.STATUS_EN] + 1, y + 4, COLS[COL.STATUS_EN] - 2, headH, { size: 5, color: BRAND.goldPale, bold: true, align: 'center' });

  strokeCell(doc, xs[COL.TEST_AR], y, COLS[COL.TEST_AR], headH, BRAND.brownMid);
  cellArabic(doc, 'الفحص', xs[COL.TEST_AR] + 3, y + 3, COLS[COL.TEST_AR] - 6, headH, { size: 6, color: BRAND.goldPale, bold: true, align: 'right' });

  return y + headH;
};

const drawResultsTable = (doc, results, reportData = {}) => {
  const xs = colXs();
  const rowH = 11;
  const headH = 14;
  let y = doc.y;
  let pageBefore = doc.bufferedPageRange().count;

  const onResultsNewPage = () => {
    let ny = drawContinuationHeader(doc, reportData);
    ny = drawResultsTableHeader(doc, ny);
    pinDocY(doc, ny);
    return ny;
  };

  y = ensureSpaceY(doc, y, headH + 8, onResultsNewPage);
  y = drawResultsTableHeader(doc, y);
  pinDocY(doc, y);

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
    y = ensureSpaceY(doc, y, rowH + 2, onResultsNewPage);
    if (doc.bufferedPageRange().count > pageBefore) {
      pageBefore = doc.bufferedPageRange().count;
    }
    bilingualBar(doc, TX, y, TW, rowH, group.nameEn, group.nameAr, PANEL_COLORS[gi % PANEL_COLORS.length], { size: 6 });
    y += rowH;
    pinDocY(doc, y);

    group.items.forEach((row, ri) => {
      y = ensureSpaceY(doc, y, rowH, onResultsNewPage);
      if (doc.bufferedPageRange().count > pageBefore) {
        pageBefore = doc.bufferedPageRange().count;
      }
      const bg = ri % 2 === 0 ? BRAND.cream : BRAND.white;
      const fc = FLAG_COLORS[row.flag] || BRAND.brown;
      const flagSym = FLAG_SYMBOL[row.flag] || '';

      strokeCell(doc, xs[COL.TEST_EN], y, COLS[COL.TEST_EN], rowH, bg);
      cellLatin(doc, row.nameEn || '-', xs[COL.TEST_EN] + 3, y + 2, COLS[COL.TEST_EN] - 6, rowH - 3, { size: 5.5, align: 'left' });

      strokeCell(doc, xs[COL.RESULT], y, COLS[COL.RESULT], rowH, bg);
      const resultStr = String(row.value ?? '-');
      if (hasAr(resultStr)) {
        cellArabic(doc, resultStr, xs[COL.RESULT] + 1, y + 2, COLS[COL.RESULT] - 2, rowH - 3, { size: 6, color: fc, bold: true, align: 'center' });
      } else {
        cellLatin(doc, resultStr, xs[COL.RESULT] + 1, y + 2, COLS[COL.RESULT] - 2, rowH - 3, { size: 6, color: fc, bold: true, align: 'center' });
      }

      strokeCell(doc, xs[COL.REF], y, COLS[COL.REF], rowH, bg);
      cellLatin(doc, row.reference, xs[COL.REF] + 1, y + 2, COLS[COL.REF] - 2, rowH - 3, { size: 5.5, color: BRAND.muted, align: 'center' });

      strokeCell(doc, xs[COL.UNIT], y, COLS[COL.UNIT], rowH, bg);
      cellLatin(doc, row.unit || '-', xs[COL.UNIT] + 1, y + 2, COLS[COL.UNIT] - 2, rowH - 3, { size: 5, color: BRAND.muted, align: 'center' });

      strokeCell(doc, xs[COL.STATUS_EN], y, COLS[COL.STATUS_EN], rowH, bg);
      if (flagSym) {
        cellLatin(doc, flagSym, xs[COL.STATUS_EN] + 1, y + 2, COLS[COL.STATUS_EN] - 2, rowH - 3, { size: 7, color: fc, bold: true, align: 'center' });
      }

      strokeCell(doc, xs[COL.TEST_AR], y, COLS[COL.TEST_AR], rowH, bg);
      cellArabic(doc, row.nameAr || '-', xs[COL.TEST_AR] + 3, y + 2, COLS[COL.TEST_AR] - 6, rowH - 3, { size: 5.5, align: 'right' });

      y += rowH;
      pinDocY(doc, y);
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

  ensureSpace(doc, 60);
  let y = doc.y;
  bilingualBar(doc, TX, y, TW, 11, 'Microscope Images', 'صور المجهر', BRAND.gold, { size: 6.5 });
  y += 13;

  const IMG_GAP = 6;
  const perRow = 2;
  const cellW = (TW - (perRow - 1) * IMG_GAP) / perRow;
  const maxH = 120;

  let col = 0;
  let rowY = y;
  let rowMaxH = 0;

  for (const img of images) {
    let meta;
    try {
      meta = doc.openImage(img.source);
    } catch {
      continue;
    }

    let drawW = cellW;
    let drawH = drawW * (meta.height / meta.width);
    if (drawH > maxH) {
      drawH = maxH;
      drawW = drawH * (meta.width / meta.height);
    }

    const caption = img.caption || img.test_name_ar || img.test_name || '';
    const blockH = drawH + (caption ? 12 : 4);

    if (col === 0) {
      ensureSpace(doc, blockH + 8);
      rowY = Math.max(rowY, doc.y);
    }

    const x = TX + col * (cellW + IMG_GAP) + (cellW - drawW) / 2;
    doc.rect(x - 1, rowY - 1, drawW + 2, drawH + 2).lineWidth(0.5).strokeColor(BRAND.border).stroke();
    const savedY = doc.y;
    doc.image(img.source, x, rowY, { width: drawW, height: drawH });
    doc.y = savedY;

    if (caption) {
      cellLatin(doc, caption, TX + col * (cellW + IMG_GAP), rowY + drawH + 1, cellW, 10, { size: 5.5, color: BRAND.muted, align: 'center' });
    }

    rowMaxH = Math.max(rowMaxH, blockH);
    col += 1;
    if (col >= perRow) {
      col = 0;
      rowY += rowMaxH + 4;
      rowMaxH = 0;
    }
  }

  if (col > 0) rowY += rowMaxH;
  doc.y = rowY + 2;
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
  const headerH = 11;
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
  ensureSpace(doc, 36);
  const y = doc.y;
  const half = TW / 2;
  const rowH = 32;

  drawApprovalCell(doc, TX, y, half, rowH, 'Lab Specialist Approval', 'موافقة أخصائي المختبر', reportData.labApproval);
  drawApprovalCell(doc, TX + half, y, half, rowH, 'Veterinarian Approval', 'موافقة الطبيب البيطري', reportData.vetApproval);
  doc.y = y + rowH + 6;
};

const drawFooter = async (doc, reportData) => {
  ensureSpace(doc, 40);
  const y = doc.y;

  const qrData = await generateQR({
    reportNumber: reportData.reportNumber,
    sampleCode: reportData.sampleCode,
    verificationCode: reportData.verificationCode,
  });
  const qrBuffer = Buffer.from(qrData.replace(/^data:image\/png;base64,/, ''), 'base64');

  doc.moveTo(TX, y).lineTo(TX + TW, y).lineWidth(0.6).strokeColor(BRAND.gold).stroke();

  const savedY = doc.y;
  doc.image(qrBuffer, TX, y + 4, { width: 34 });
  doc.y = savedY;

  cellLatin(doc, 'Scan QR to verify authenticity', TX + 40, y + 5, 100, 7, { size: 5, color: BRAND.muted });
  cellArabic(doc, 'امسح للتحقق من صحة التقرير', TX + 40, y + 12, 100, 7, { size: 5, color: BRAND.muted, align: 'right' });
  cellLatin(doc, reportData.verificationCode, TX + 40, y + 19, 100, 7, { size: 5, color: '#9ca3af' });

  const labEn = env.lab.name || LAB_NAME_EN;
  const labAr = env.lab.nameAr || LAB_NAME_AR;
  cellLatin(doc, `Issued by ${labEn}`, TX + TW / 2 + 4, y + 8, TW / 2 - 8, 7, { size: 5, color: '#9ca3af', align: 'left' });
  cellArabic(doc, `صادر من ${labAr}`, TX + TW / 2 + 4, y + 16, TW / 2 - 8, 7, { size: 5, color: '#9ca3af', align: 'left' });
  cellLatin(doc, 'Confidential — For veterinary use only', TX + TW / 2 + 4, y + 24, TW / 2 - 8, 7, { size: 4.5, color: '#b8a088', align: 'left' });

  doc.y = y + 38;
};

const stampPageFooters = (doc, reportData) => {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    const fy = PAGE_H - FOOTER_H + 2;
    doc.moveTo(TX, fy).lineTo(TX + TW, fy).lineWidth(0.35).strokeColor(BRAND.border).stroke();
    cellLatin(doc, reportData.reportNumber || '', TX, fy + 3, TW / 3, 8, { size: 5, color: BRAND.muted });
    cellLatin(doc, `Page ${i + 1} / ${range.count}`, TX + TW / 3, fy + 3, TW / 3, 8, {
      size: 5, color: BRAND.muted, align: 'center',
    });
    cellArabic(doc, `${i + 1} / ${range.count}`, TX + (TW * 2) / 3, fy + 3, TW / 3, 8, {
      size: 5, color: BRAND.muted, align: 'right',
    });
  }
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

const { shouldUseSinglePageLayout } = require('./layout-mode');
const { generateSinglePagePDF } = require('./design-1-single-page');

const generateStandardPDF = async (reportData, outputDir, options = {}) => {
  const filename = options.filename || `report-${reportData.reportNumber}-${uuidv4().slice(0, 8)}.pdf`;
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, filename);
  const logoBuf = HAS_LOGO ? await getBrandLogoBuffer(BRAND.brownMid) : null;

  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true, bufferPages: true });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);
      registerFonts(doc);
      doc.y = MARGIN;

      drawHeader(doc, reportData, logoBuf);
      drawTitleBanner(doc, reportData);
      drawPatientTable(doc, {
        reportNumber: reportData.reportNumber,
        sampleCode: reportData.sampleCode,
        dateStr: formatShortDate(reportData.date),
        customerName: reportData.customerName || '-',
        animalCode: reportData.animalCode,
        animalName: reportData.animalName || '-',
        species: {
          en: ANIMAL_TYPE_LABELS[reportData.animalType]?.en || reportData.animalType,
          ar: ANIMAL_TYPE_LABELS[reportData.animalType]?.ar || reportData.animalType,
        },
        gender: {
          en: GENDERS[reportData.animalGender]?.en || '-',
          ar: GENDERS[reportData.animalGender]?.ar || '-',
        },
      });

      drawResultsTable(doc, reportData.results, reportData);
      await drawMicroscopeImages(doc, reportData.attachments);
      drawNotes(doc, reportData.treatmentRecommendations);
      drawApprovals(doc, reportData);
      await drawFooter(doc, reportData);
      stampPageFooters(doc, reportData);

      doc.end();
      stream.on('finish', () => resolve({ filePath, filename, url: `/uploads/reports/${filename}` }));
      stream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
};

const generateReportPDF = async (reportData, outputDir, options = {}) => {
  if (shouldUseSinglePageLayout(reportData)) {
    return generateSinglePagePDF(reportData, outputDir, options);
  }
  return generateStandardPDF(reportData, outputDir, options);
};

module.exports = {
  designId: 1,
  designName: 'Compact Professional Bilingual',
  generateReportPDF,
};
