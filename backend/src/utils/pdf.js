const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const env = require('../config/env');
const { generateQR } = require('./barcode');

const ARABIC_FONT_PATH = path.join(__dirname, '../../assets/fonts/NotoSansArabic-Regular.ttf');
const LOGO_PATH = path.join(__dirname, '../../assets/logo.png');
const HAS_ARABIC_FONT = fs.existsSync(ARABIC_FONT_PATH);
const HAS_LOGO = fs.existsSync(LOGO_PATH);

const BRAND = '#0d9488';
const BRAND_DARK = '#0f766e';

const FLAG_COLORS = {
  HIGH: '#dc2626',
  CRIT_HIGH: '#991b1b',
  NORMAL: '#16a34a',
  LOW: '#2563eb',
  CRIT_LOW: '#1d4ed8',
};

const FLAG_LABELS = {
  en: { NORMAL: 'Normal', HIGH: 'High', LOW: 'Low', CRIT_HIGH: 'Crit High', CRIT_LOW: 'Crit Low' },
  ar: { NORMAL: 'معتدل', HIGH: 'مرتفع', LOW: 'منخفض', CRIT_HIGH: 'مرتفع حرج', CRIT_LOW: 'منخفض حرج' },
};

const LABELS = {
  en: {
    reportTitle: 'Laboratory Results Report',
    labSubtitle: 'Veterinary Medical & Research Laboratory',
    reportNo: 'Report No', sampleId: 'Sample ID', date: 'Date', client: 'Client',
    animalInfo: 'Patient Information', animalId: 'Animal ID', type: 'Species', name: 'Name', gender: 'Gender',
    testResults: 'Laboratory Results',
    headers: ['Parameter', 'Result', 'Unit', 'Reference', 'Status'],
    aiSection: 'Laboratory Interpretation (AI Generated)',
    treatmentSection: 'Treatment Recommendations (Veterinarian)',
    aiBadge: 'AI',
    scanVerify: 'Scan to verify authenticity',
    specialistSignature: 'Veterinarian Signature',
    issuedBy: 'Issued by',
    emptyTreatment: 'No treatment recommendations recorded.',
    emptyAi: 'No AI interpretation available.',
  },
  ar: {
    reportTitle: 'تقرير نتائج المختبر',
    labSubtitle: 'مختبر طبي بحثي بيطري',
    reportNo: 'رقم التقرير', sampleId: 'رقم العينة', date: 'التاريخ', client: 'العميل',
    animalInfo: 'بيانات الحالة', animalId: 'رقم الحيوان', type: 'النوع', name: 'الاسم', gender: 'الجنس',
    testResults: 'نتائج الفحوصات المخبرية',
    headers: ['الفحص', 'النتيجة', 'الوحدة', 'المدى المرجعي', 'الحالة'],
    aiSection: 'الوصف والتفسير المخبري (تسجيل إلكتروني — ذكاء اصطناعي)',
    treatmentSection: 'التوصيات العلاجية (الطبيب البيطري — إدخال يدوي)',
    aiBadge: 'ذكاء اصطناعي',
    scanVerify: 'امسح للتحقق من صحة التقرير',
    specialistSignature: 'توقيع الطبيب البيطري',
    issuedBy: 'صادر من',
    emptyTreatment: 'لم تُسجَّل توصيات علاجية بعد.',
    emptyAi: 'لا يوجد تفسير إلكتروني.',
  },
};

const ANIMAL_TYPES = {
  camel: { en: 'Camel', ar: 'إبل' }, horse: { en: 'Horse', ar: 'حصان' },
  sheep: { en: 'Sheep', ar: 'غنم' }, goat: { en: 'Goat', ar: 'ماعز' },
  bird: { en: 'Bird', ar: 'طير' }, cat: { en: 'Cat', ar: 'قط' }, dog: { en: 'Dog', ar: 'كلب' },
};

const GENDERS = {
  male: { en: 'Male', ar: 'ذكر' }, female: { en: 'Female', ar: 'أنثى' }, unknown: { en: 'Unknown', ar: 'غير محدد' },
};

const registerFonts = (doc) => {
  if (HAS_ARABIC_FONT) doc.registerFont('Arabic', ARABIC_FONT_PATH);
  doc.registerFont('Latin', 'Helvetica');
  doc.registerFont('Latin-Bold', 'Helvetica-Bold');
};

const prepareArabic = (text) => {
  if (!text) return '';
  try {
    // eslint-disable-next-line global-require
    const arabicReshaper = require('arabic-reshaper');
    return arabicReshaper.reshape(String(text)).split(/\s+/).reverse().join(' ');
  } catch {
    return String(text);
  }
};

const isLatinOnly = (text) => /^[\x00-\x7F\s.,:;|+\-/()°µ³⁶⁹\n\r\t]+$/.test(String(text || ''));
const hasArabicChars = (text) => /[\u0600-\u06FF]/.test(String(text || ''));

const setLatin = (doc, bold = false) => doc.font(bold ? 'Latin-Bold' : 'Latin');
const setArabic = (doc) => { if (HAS_ARABIC_FONT) doc.font('Arabic'); else doc.font('Latin'); };

const drawTextSmart = (doc, text, x, y, width, { arabicMode = false, color = '#333', bold = false, align = 'left', size = 10 } = {}) => {
  doc.fontSize(size).fillColor(color);
  const value = String(text ?? '-');
  if (arabicMode && !isLatinOnly(value)) {
    setArabic(doc);
    doc.text(prepareArabic(value), x, y, { width, align: align === 'right' ? 'right' : 'right' });
  } else {
    setLatin(doc, bold);
    doc.text(value, x, y, { width, align });
  }
};

const drawHeader = (doc, isArabic) => {
  const top = 35;
  doc.rect(0, 0, 595, 95).fill(BRAND);

  doc.roundedRect(42, top - 8, 78, 78, 10).fill('#ffffff');
  if (HAS_LOGO) {
    doc.image(LOGO_PATH, 48, top - 2, { width: 66, height: 66 });
  } else {
    doc.fillColor(BRAND_DARK).fontSize(22).text('+', 72, top + 20);
  }

  const centerX = 130;
  const centerW = 335;
  const labNameAr = env.lab.nameAr || 'مركز رعاية النوادر البيطري';

  if (isArabic) {
    drawTextSmart(doc, labNameAr, centerX, top + 4, centerW, { arabicMode: true, color: '#ffffff', bold: true, align: 'center', size: 18 });
    setLatin(doc, true);
    doc.fontSize(11).fillColor('#e6fffa').text('Al-Nawadir Veterinary Care Center', centerX, top + 30, { width: centerW, align: 'center' });
    drawTextSmart(doc, LABELS.ar.labSubtitle, centerX, top + 46, centerW, { arabicMode: true, color: '#ccfbf1', align: 'center', size: 9 });
  } else {
    setLatin(doc, true);
    doc.fontSize(18).fillColor('#ffffff').text(env.lab.name || 'Al-Nawadir Veterinary Care Center', centerX, top + 8, { width: centerW, align: 'center' });
    drawTextSmart(doc, labNameAr, centerX, top + 30, centerW, { arabicMode: true, color: '#e6fffa', align: 'center', size: 11 });
    setLatin(doc);
    doc.fontSize(9).fillColor('#ccfbf1').text(LABELS.en.labSubtitle, centerX, top + 48, { width: centerW, align: 'center' });
  }

  setLatin(doc);
  doc.fontSize(8).fillColor('#f0fdfa')
    .text(`${env.lab.phone}  |  ${env.lab.email}`, centerX, top + 66, { width: centerW, align: 'center' });

  doc.y = 108;
};

const drawInfoCard = (doc, title, rows, isArabic) => {
  const cardY = doc.y;
  const cardH = 18 + rows.length * 16 + 10;
  doc.roundedRect(45, cardY, 505, cardH, 6).lineWidth(1).strokeColor('#d1d5db').stroke();
  doc.rect(45, cardY, 505, 22).fill('#f0fdfa');
  drawTextSmart(doc, title, 55, cardY + 6, 485, { arabicMode: isArabic, color: BRAND_DARK, bold: true, size: 11 });

  let y = cardY + 28;
  rows.forEach(([label, value]) => {
    if (isArabic) {
      drawTextSmart(doc, label, 55, y, 140, { arabicMode: true, color: '#6b7280', size: 9 });
      const v = String(value ?? '-');
      if (hasArabicChars(v)) drawTextSmart(doc, v, 200, y, 340, { arabicMode: true, color: '#111', size: 9 });
      else { setLatin(doc); doc.fontSize(9).fillColor('#111').text(v, 200, y, { width: 340 }); }
    } else {
      setLatin(doc);
      doc.fontSize(9).fillColor('#6b7280').text(`${label}:`, 55, y, { width: 120, continued: true });
      doc.fillColor('#111').text(` ${value ?? '-'}`, { width: 360 });
    }
    y += 16;
  });
  doc.y = cardY + cardH + 10;
};

const drawSectionBox = (doc, title, badge, content, isArabic, accentColor, emptyText) => {
  const startY = doc.y;
  const body = (content && String(content).trim()) ? String(content) : emptyText;
  const textWidth = 475;
  setLatin(doc);
  doc.fontSize(9);
  const bodyHeight = doc.heightOfString(body, { width: textWidth });
  const boxH = Math.max(56, bodyHeight + 38);

  doc.roundedRect(45, startY, 505, boxH, 6).fill('#fafafa');
  doc.rect(45, startY, 505, 24).fill(accentColor);
  drawTextSmart(doc, title, 55, startY + 7, 380, { arabicMode: isArabic, color: '#ffffff', bold: true, size: 10 });

  if (badge) {
    setLatin(doc, true);
    doc.fontSize(7);
    const badgeW = doc.widthOfString(badge) + 12;
    const badgeX = 505 - badgeW - 10;
    doc.roundedRect(badgeX, startY + 5, badgeW, 14, 3).fill('#ffffff');
    doc.fillColor(accentColor).text(badge, badgeX + 6, startY + 8, { width: badgeW - 12 });
  }

  drawTextSmart(doc, body, 55, startY + 30, textWidth, { arabicMode: isArabic, color: '#374151', size: 9 });
  doc.y = startY + boxH + 12;
};

const resultColor = (flag) => FLAG_COLORS[flag] || '#333333';
const formatDate = (date) => new Date(date).toLocaleDateString('en-GB');

const generateReportPDF = async (reportData, outputDir, options = {}) => {
  const filename = options.filename || `report-${reportData.reportNumber}-${uuidv4().slice(0, 8)}.pdf`;
  const filePath = path.join(outputDir, filename);

  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);
      registerFonts(doc);

      const isArabic = reportData.language === 'ar';
      const labels = isArabic ? LABELS.ar : LABELS.en;
      const flagLabels = isArabic ? FLAG_LABELS.ar : FLAG_LABELS.en;

      drawHeader(doc, isArabic);

      doc.roundedRect(45, doc.y, 505, 28, 4).fill(BRAND);
      drawTextSmart(doc, labels.reportTitle, 55, doc.y + 8, 485, { arabicMode: isArabic, color: '#ffffff', bold: true, size: 14, align: 'center' });
      doc.y += 36;

      const animalType = ANIMAL_TYPES[reportData.animalType]?.[isArabic ? 'ar' : 'en'] || reportData.animalType;
      const animalGender = GENDERS[reportData.animalGender]?.[isArabic ? 'ar' : 'en'] || reportData.animalGender || '-';

      drawInfoCard(doc, labels.reportNo, [
        [labels.reportNo, reportData.reportNumber],
        [labels.sampleId, reportData.sampleCode],
        [labels.date, formatDate(reportData.date)],
        [labels.client, reportData.customerName || '-'],
      ], isArabic);

      drawInfoCard(doc, labels.animalInfo, [
        [labels.animalId, reportData.animalCode],
        [labels.type, animalType],
        [labels.name, reportData.animalName || '-'],
        [labels.gender, animalGender],
      ], isArabic);

      drawTextSmart(doc, labels.testResults, 45, doc.y, 505, { arabicMode: isArabic, color: BRAND_DARK, bold: true, size: 12 });
      doc.moveDown(0.4);

      const tableTop = doc.y;
      const colWidths = [145, 75, 55, 105, 75];
      const colX = [45, 190, 265, 320, 425];

      labels.headers.forEach((h, i) => {
        doc.rect(colX[i], tableTop, colWidths[i], 24).fill(BRAND_DARK);
        drawTextSmart(doc, h, colX[i] + 4, tableTop + 7, colWidths[i] - 8, { arabicMode: isArabic, color: '#ffffff', size: 8 });
      });

      let rowY = tableTop + 24;
      reportData.results.forEach((row, idx) => {
        const bg = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
        const color = resultColor(row.flag);
        doc.rect(45, rowY, 505, 22).fill(bg);

        const flagText = flagLabels[row.flag] || row.flag || '-';
        const cells = [
          { text: row.name, arabic: isArabic, color: '#1f2937' },
          { text: row.value, arabic: false, color, bold: true },
          { text: row.unit || '-', arabic: false, color: '#4b5563' },
          { text: row.reference || '-', arabic: false, color: '#4b5563' },
          { text: flagText, arabic: isArabic, color, bold: true },
        ];

        cells.forEach((cell, i) => {
          drawTextSmart(doc, cell.text, colX[i] + 4, rowY + 6, colWidths[i] - 8, {
            arabicMode: cell.arabic, color: cell.color, bold: cell.bold, size: 8,
          });
        });
        rowY += 22;
      });
      doc.y = rowY + 14;

      drawSectionBox(
        doc, labels.aiSection, labels.aiBadge,
        reportData.aiInterpretation, isArabic, '#0369a1',
        labels.emptyAi
      );

      drawSectionBox(
        doc, labels.treatmentSection, null,
        reportData.treatmentRecommendations, isArabic, '#047857',
        labels.emptyTreatment
      );

      const footerY = doc.y;
      const qrData = await generateQR({
        reportNumber: reportData.reportNumber,
        sampleCode: reportData.sampleCode,
        verificationCode: reportData.verificationCode,
      });
      const qrBuffer = Buffer.from(qrData.replace(/^data:image\/png;base64,/, ''), 'base64');
      doc.image(qrBuffer, 45, footerY, { width: 70 });

      drawTextSmart(doc, labels.scanVerify, 125, footerY + 24, 180, { arabicMode: isArabic, color: '#6b7280', size: 8 });
      setLatin(doc);
      doc.fontSize(7).fillColor('#9ca3af').text(reportData.verificationCode, 125, footerY + 38, { width: 180 });

      doc.rect(330, footerY + 30, 200, 1).strokeColor('#9ca3af').stroke();
      drawTextSmart(doc, labels.specialistSignature, 330, footerY + 8, 200, { arabicMode: isArabic, color: '#374151', size: 9 });
      if (reportData.specialistName) {
        drawTextSmart(doc, reportData.specialistName, 330, footerY + 36, 200, { arabicMode: isArabic, color: '#111', size: 9 });
      }

      const labName = isArabic ? (env.lab.nameAr || 'مركز رعاية النوادر البيطري') : env.lab.name;
      drawTextSmart(doc, `${labels.issuedBy} ${labName}`, 45, footerY + 78, 505, { arabicMode: isArabic, color: '#9ca3af', size: 7, align: 'center' });

      doc.end();
      stream.on('finish', () => resolve({ filePath, filename, url: `/uploads/reports/${filename}` }));
      stream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = { generateReportPDF };
