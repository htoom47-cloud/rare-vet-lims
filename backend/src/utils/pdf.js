const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const env = require('../config/env');
const { generateQR } = require('./barcode');

const ARABIC_FONT_PATH = path.join(__dirname, '../assets/fonts/NotoSansArabic-Regular.ttf');
const HAS_ARABIC_FONT = fs.existsSync(ARABIC_FONT_PATH);

const FLAG_LABELS = {
  en: { NORMAL: 'NORMAL', HIGH: 'HIGH', LOW: 'LOW', CRIT_HIGH: 'CRIT HIGH', CRIT_LOW: 'CRIT LOW' },
  ar: { NORMAL: 'طبيعي', HIGH: 'مرتفع', LOW: 'منخفض', CRIT_HIGH: 'حرج مرتفع', CRIT_LOW: 'حرج منخفض' },
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

const setupFonts = (doc, useArabic) => {
  if (useArabic && HAS_ARABIC_FONT) {
    doc.registerFont('Arabic', ARABIC_FONT_PATH);
    doc.font('Arabic');
    return;
  }
  doc.font('Helvetica');
};

const generateReportPDF = async (reportData, outputDir, options = {}) => {
  const filename = options.filename
    || `report-${reportData.reportNumber}-${uuidv4().slice(0, 8)}.pdf`;
  const filePath = path.join(outputDir, filename);

  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      const isArabic = reportData.language === 'ar';
      const useArabicFont = isArabic && HAS_ARABIC_FONT;
      const labels = isArabic ? LABELS.ar : LABELS.en;
      const flagLabels = isArabic ? FLAG_LABELS.ar : FLAG_LABELS.en;

      setupFonts(doc, useArabicFont);

      doc.fontSize(20).fillColor('#0d9488').text(env.lab.name, { align: 'center' });
      if (isArabic && env.lab.nameAr) {
        setupFonts(doc, useArabicFont);
        doc.fontSize(14).fillColor('#333').text(env.lab.nameAr, { align: 'center' });
      }
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#666')
        .text(`${env.lab.address} | ${env.lab.phone} | ${env.lab.email}`, { align: 'center' });
      doc.moveDown();

      doc.strokeColor('#0d9488').lineWidth(2)
        .moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown();

      setupFonts(doc, useArabicFont);
      doc.fontSize(16).fillColor('#111').text(labels.reportTitle, { align: 'center' });
      doc.moveDown();

      const infoY = doc.y;
      setupFonts(doc, useArabicFont);
      doc.fontSize(10).fillColor('#333');
      doc.text(`${labels.reportNo}: ${reportData.reportNumber}`, 50, infoY);
      doc.text(`${labels.sampleId}: ${reportData.sampleCode}`, 300, infoY);
      doc.text(`${labels.date}: ${new Date(reportData.date).toLocaleDateString(isArabic ? 'ar-SA' : 'en-US')}`, 50, infoY + 15);
      doc.text(`${labels.client}: ${reportData.customerName || '-'}`, 300, infoY + 15);
      doc.moveDown(2);

      const animalType = ANIMAL_TYPES[reportData.animalType]?.[isArabic ? 'ar' : 'en'] || reportData.animalType;
      const animalGender = GENDERS[reportData.animalGender]?.[isArabic ? 'ar' : 'en'] || reportData.animalGender || '-';

      setupFonts(doc, useArabicFont);
      doc.fontSize(12).fillColor('#0d9488').text(labels.animalInfo);
      doc.fontSize(10).fillColor('#333');
      doc.text(`${labels.animalId}: ${reportData.animalCode} | ${labels.type}: ${animalType}`);
      doc.text(`${labels.name}: ${reportData.animalName || '-'} | ${labels.gender}: ${animalGender}`);
      doc.moveDown();

      setupFonts(doc, useArabicFont);
      doc.fontSize(12).fillColor('#0d9488').text(labels.testResults);
      doc.moveDown(0.5);

      const tableTop = doc.y;
      const colWidths = [140, 80, 60, 100, 80];

      doc.fontSize(9).fillColor('#fff');
      let x = 50;
      labels.headers.forEach((h, i) => {
        setupFonts(doc, useArabicFont);
        doc.rect(x, tableTop, colWidths[i], 20).fill('#0d9488');
        doc.fillColor('#fff').text(h, x + 5, tableTop + 5, { width: colWidths[i] - 10 });
        x += colWidths[i];
      });

      let rowY = tableTop + 20;
      reportData.results.forEach((row, idx) => {
        const bg = idx % 2 === 0 ? '#f8fafc' : '#fff';
        x = 50;
        doc.rect(50, rowY, 460, 18).fill(bg);
        doc.fillColor('#333');
        const flagText = flagLabels[row.flag] || row.flag || '-';
        const values = [row.name, row.value, row.unit || '-', row.reference || '-', flagText];
        values.forEach((v, i) => {
          setupFonts(doc, useArabicFont && i !== 4 && i !== 2);
          if (row.isCritical && i === 4) doc.fillColor('#dc2626');
          else doc.fillColor('#333');
          doc.text(String(v), x + 5, rowY + 4, { width: colWidths[i] - 10 });
          x += colWidths[i];
        });
        rowY += 18;
      });

      doc.y = rowY + 20;

      if (reportData.doctorNotes) {
        setupFonts(doc, useArabicFont);
        doc.fontSize(11).fillColor('#0d9488').text(labels.doctorNotes);
        doc.fontSize(10).fillColor('#333').text(reportData.doctorNotes);
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
      setupFonts(doc, useArabicFont);
      doc.fontSize(8).fillColor('#666')
        .text(labels.scanVerify, 140, doc.y + 30);

      setupFonts(doc, useArabicFont);
      doc.fontSize(10).fillColor('#333')
        .text(labels.specialistSignature, 350, doc.y);
      if (reportData.specialistName) {
        doc.text(reportData.specialistName, 350, doc.y + 15);
      }

      doc.moveDown(4);
      setupFonts(doc, useArabicFont);
      doc.fontSize(8).fillColor('#999')
        .text(`${labels.issuedBy} ${isArabic && env.lab.nameAr ? env.lab.nameAr : env.lab.name}`, { align: 'center' });

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
