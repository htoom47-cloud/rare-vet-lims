const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const env = require('../config/env');
const { generateQR } = require('./barcode');

const ARABIC_FONT_PATH = path.join(__dirname, '../../assets/fonts/NotoSansArabic-Regular.ttf');
const HAS_ARABIC_FONT = fs.existsSync(ARABIC_FONT_PATH);

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
    reportTitle: 'Laboratory Report',
    reportNo: 'Report No',
    sampleId: 'Sample ID',
    date: 'Date',
    client: 'Client',
    animalInfo: 'Animal Information',
    animalId: 'Animal ID',
    type: 'Type',
    name: 'Name',
    gender: 'Gender',
    testResults: 'Test Results',
    headers: ['Test', 'Result', 'Unit', 'Reference', 'Status'],
    doctorNotes: 'Doctor Notes',
    scanVerify: 'Scan to verify report',
    specialistSignature: 'Specialist Signature',
    issuedBy: 'Report issued by',
  },
  ar: {
    reportTitle: 'تقرير مختبر',
    reportNo: 'رقم التقرير',
    sampleId: 'رقم العينة',
    date: 'التاريخ',
    client: 'العميل',
    animalInfo: 'معلومات الحيوان',
    animalId: 'رقم الحيوان',
    type: 'النوع',
    name: 'الاسم',
    gender: 'الجنس',
    testResults: 'نتائج الفحوصات',
    headers: ['الفحص', 'النتيجة', 'الوحدة', 'المدى المرجعي', 'الحالة'],
    doctorNotes: 'ملاحظات الطبيب',
    scanVerify: 'امسح للتحقق من التقرير',
    specialistSignature: 'توقيع المختص',
    issuedBy: 'هذا التقرير صادر من',
  },
};

const ANIMAL_TYPES = {
  camel: { en: 'Camel', ar: 'إبل' },
  horse: { en: 'Horse', ar: 'حصان' },
  sheep: { en: 'Sheep', ar: 'غنم' },
  goat: { en: 'Goat', ar: 'ماعز' },
  bird: { en: 'Bird', ar: 'طير' },
  cat: { en: 'Cat', ar: 'قط' },
  dog: { en: 'Dog', ar: 'كلب' },
};

const GENDERS = {
  male: { en: 'Male', ar: 'ذكر' },
  female: { en: 'Female', ar: 'أنثى' },
  unknown: { en: 'Unknown', ar: 'غير محدد' },
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
    const reshaped = arabicReshaper.reshape(String(text));
    return reshaped.split(/\s+/).reverse().join(' ');
  } catch {
    return String(text);
  }
};

const isLatinOnly = (text) => /^[\x00-\x7F\s.,:;|+\-/()]+$/.test(String(text || ''));
const hasArabicChars = (text) => /[\u0600-\u06FF]/.test(String(text || ''));

const setLatin = (doc, bold = false) => doc.font(bold ? 'Latin-Bold' : 'Latin');
const setArabic = (doc) => { if (HAS_ARABIC_FONT) doc.font('Arabic'); else doc.font('Latin'); };

const drawTextSmart = (doc, text, x, y, width, { arabicMode = false, color = '#333', bold = false } = {}) => {
  doc.fillColor(color);
  const value = String(text ?? '-');
  if (arabicMode && !isLatinOnly(value)) {
    setArabic(doc);
    doc.text(prepareArabic(value), x, y, { width, align: 'right' });
  } else {
    setLatin(doc, bold);
    doc.text(value, x, y, { width });
  }
};

const drawField = (doc, label, value, x, y, width, arabicMode) => {
  const displayValue = String(value ?? '-');
  if (arabicMode) {
    doc.fillColor('#333');
    const valueText = hasArabicChars(displayValue) ? prepareArabic(displayValue) : displayValue;
    if (hasArabicChars(displayValue)) setArabic(doc);
    else setLatin(doc);
    const valueWidth = Math.min(width * 0.5, doc.widthOfString(valueText) + 8);
    doc.text(valueText, x, y, { width: valueWidth, align: 'left' });
    setArabic(doc);
    doc.text(` :${prepareArabic(label)}`, x + valueWidth, y, { width: width - valueWidth, align: 'right' });
    return;
  }
  setLatin(doc);
  doc.fillColor('#333').text(`${label}: ${displayValue}`, x, y, { width });
};

const resultColor = (flag) => FLAG_COLORS[flag] || '#333333';

const formatDate = (date) => new Date(date).toLocaleDateString('en-GB');

const generateReportPDF = async (reportData, outputDir, options = {}) => {
  const filename = options.filename
    || `report-${reportData.reportNumber}-${uuidv4().slice(0, 8)}.pdf`;
  const filePath = path.join(outputDir, filename);

  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);
      registerFonts(doc);

      const isArabic = reportData.language === 'ar';
      const labels = isArabic ? LABELS.ar : LABELS.en;
      const flagLabels = isArabic ? FLAG_LABELS.ar : FLAG_LABELS.en;

      setLatin(doc, true);
      doc.fontSize(20).fillColor('#0d9488').text(env.lab.name, { align: 'center' });

      if (isArabic && env.lab.nameAr) {
        doc.fontSize(14).fillColor('#333');
        drawTextSmart(doc, env.lab.nameAr, 50, doc.y, 495, { arabicMode: true });
        doc.moveDown(0.3);
      }

      setLatin(doc);
      doc.fontSize(10).fillColor('#666')
        .text(`${env.lab.address} | ${env.lab.phone} | ${env.lab.email}`, { align: 'center' });
      doc.moveDown();

      doc.strokeColor('#0d9488').lineWidth(2).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown();

      doc.fontSize(16).fillColor('#111');
      drawTextSmart(doc, labels.reportTitle, 50, doc.y, 495, { arabicMode: isArabic, bold: true });
      doc.moveDown();

      const infoY = doc.y;
      doc.fontSize(10);
      if (isArabic) {
        drawField(doc, labels.reportNo, reportData.reportNumber, 50, infoY, 220, true);
        drawField(doc, labels.sampleId, reportData.sampleCode, 300, infoY, 220, true);
        drawField(doc, labels.date, formatDate(reportData.date), 50, infoY + 16, 220, true);
        drawField(doc, labels.client, reportData.customerName || '-', 300, infoY + 16, 220, true);
      } else {
        setLatin(doc);
        doc.fillColor('#333');
        doc.text(`${labels.reportNo}: ${reportData.reportNumber}`, 50, infoY);
        doc.text(`${labels.sampleId}: ${reportData.sampleCode}`, 300, infoY);
        doc.text(`${labels.date}: ${formatDate(reportData.date)}`, 50, infoY + 16);
        doc.text(`${labels.client}: ${reportData.customerName || '-'}`, 300, infoY + 16);
      }
      doc.y = infoY + 36;

      const animalType = ANIMAL_TYPES[reportData.animalType]?.[isArabic ? 'ar' : 'en'] || reportData.animalType;
      const animalGender = GENDERS[reportData.animalGender]?.[isArabic ? 'ar' : 'en'] || reportData.animalGender || '-';

      doc.fontSize(12).fillColor('#0d9488');
      drawTextSmart(doc, labels.animalInfo, 50, doc.y, 495, { arabicMode: isArabic });
      doc.moveDown(0.3);

      doc.fontSize(10).fillColor('#333');
      if (isArabic) {
        drawField(doc, labels.animalId, reportData.animalCode, 50, doc.y, 220, true);
        drawField(doc, labels.type, animalType, 300, doc.y, 220, true);
        doc.y += 16;
        drawField(doc, labels.name, reportData.animalName || '-', 50, doc.y, 220, true);
        drawField(doc, labels.gender, animalGender, 300, doc.y, 220, true);
        doc.y += 16;
      } else {
        setLatin(doc);
        doc.text(`${labels.animalId}: ${reportData.animalCode} | ${labels.type}: ${animalType}`);
        doc.text(`${labels.name}: ${reportData.animalName || '-'} | ${labels.gender}: ${animalGender}`);
      }
      doc.moveDown();

      doc.fontSize(12).fillColor('#0d9488');
      drawTextSmart(doc, labels.testResults, 50, doc.y, 495, { arabicMode: isArabic });
      doc.moveDown(0.5);

      const tableTop = doc.y;
      const colWidths = [140, 80, 60, 100, 80];
      const colX = [50, 190, 270, 330, 430];

      doc.fontSize(9);
      labels.headers.forEach((h, i) => {
        doc.rect(colX[i], tableTop, colWidths[i], 22).fill('#0d9488');
        drawTextSmart(doc, h, colX[i] + 4, tableTop + 6, colWidths[i] - 8, {
          arabicMode: isArabic,
          color: '#ffffff',
        });
      });

      let rowY = tableTop + 22;
      reportData.results.forEach((row, idx) => {
        const bg = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
        const color = resultColor(row.flag);
        doc.rect(50, rowY, 460, 20).fill(bg);

        const flagText = flagLabels[row.flag] || row.flag || '-';
        const cells = [
          { text: row.name, arabic: isArabic, color: '#333333', bold: false },
          { text: row.value, arabic: false, color, bold: true },
          { text: row.unit || '-', arabic: false, color: '#333333', bold: false },
          { text: row.reference || '-', arabic: false, color: '#333333', bold: false },
          { text: flagText, arabic: isArabic, color, bold: true },
        ];

        cells.forEach((cell, i) => {
          drawTextSmart(doc, cell.text, colX[i] + 4, rowY + 5, colWidths[i] - 8, {
            arabicMode: cell.arabic,
            color: cell.color,
            bold: cell.bold,
          });
        });

        if (row.flag && row.flag !== 'NORMAL') {
          doc.rect(colX[1], rowY + 3, colWidths[1] - 6, 14)
            .lineWidth(0.8)
            .strokeColor(color)
            .stroke();
        }

        rowY += 20;
      });

      doc.y = rowY + 16;

      if (reportData.doctorNotes) {
        doc.fontSize(11).fillColor('#0d9488');
        drawTextSmart(doc, labels.doctorNotes, 50, doc.y, 495, { arabicMode: isArabic });
        doc.moveDown(0.3);
        doc.fontSize(10);
        drawTextSmart(doc, reportData.doctorNotes, 50, doc.y, 495, { arabicMode: isArabic });
        doc.moveDown();
      }

      const qrData = await generateQR({
        reportNumber: reportData.reportNumber,
        sampleCode: reportData.sampleCode,
        verificationCode: reportData.verificationCode,
      });
      const qrBase64 = qrData.replace(/^data:image\/png;base64,/, '');
      const qrBuffer = Buffer.from(qrBase64, 'base64');
      doc.image(qrBuffer, 50, doc.y, { width: 80 });

      doc.fontSize(8).fillColor('#666');
      drawTextSmart(doc, labels.scanVerify, 140, doc.y + 28, 200, { arabicMode: isArabic });

      doc.fontSize(10).fillColor('#333');
      drawTextSmart(doc, labels.specialistSignature, 350, doc.y, 180, { arabicMode: isArabic });
      if (reportData.specialistName) {
        drawTextSmart(doc, reportData.specialistName, 350, doc.y + 14, 180, { arabicMode: isArabic });
      }

      doc.moveDown(4);
      doc.fontSize(8).fillColor('#999');
      const footer = isArabic && env.lab.nameAr
        ? `${labels.issuedBy} ${env.lab.nameAr}`
        : `${labels.issuedBy} ${env.lab.name}`;
      drawTextSmart(doc, footer, 50, doc.y, 495, { arabicMode: isArabic });

      doc.end();

      stream.on('finish', () => {
        resolve({ filePath, filename, url: `/uploads/reports/${filename}` });
      });
      stream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = { generateReportPDF };
