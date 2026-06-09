const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const env = require('../config/env');
const { generateQR } = require('./barcode');

const generateReportPDF = async (reportData, outputDir) => {
  const filename = `report-${reportData.reportNumber}-${uuidv4().slice(0, 8)}.pdf`;
  const filePath = path.join(outputDir, filename);

  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      const isArabic = reportData.language === 'ar';

      // Header
      doc.fontSize(20).fillColor('#0d9488').text(env.lab.name, { align: 'center' });
      if (isArabic) {
        doc.fontSize(14).fillColor('#333').text(env.lab.nameAr, { align: 'center' });
      }
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#666')
        .text(`${env.lab.address} | ${env.lab.phone} | ${env.lab.email}`, { align: 'center' });
      doc.moveDown();

      doc.strokeColor('#0d9488').lineWidth(2)
        .moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown();

      doc.fontSize(16).fillColor('#111').text(isArabic ? 'تقرير مختبر' : 'Laboratory Report', { align: 'center' });
      doc.moveDown();

      // Report info
      const infoY = doc.y;
      doc.fontSize(10).fillColor('#333');
      doc.text(`${isArabic ? 'رقم التقرير' : 'Report No'}: ${reportData.reportNumber}`, 50, infoY);
      doc.text(`${isArabic ? 'رقم العينة' : 'Sample ID'}: ${reportData.sampleCode}`, 300, infoY);
      doc.text(`${isArabic ? 'التاريخ' : 'Date'}: ${new Date(reportData.date).toLocaleDateString()}`, 50, infoY + 15);
      doc.text(`${isArabic ? 'العميل' : 'Client'}: ${reportData.customerName}`, 300, infoY + 15);
      doc.moveDown(2);

      // Animal info
      doc.fontSize(12).fillColor('#0d9488').text(isArabic ? 'معلومات الحيوان' : 'Animal Information');
      doc.fontSize(10).fillColor('#333');
      doc.text(`${isArabic ? 'رقم الحيوان' : 'Animal ID'}: ${reportData.animalCode} | ${isArabic ? 'النوع' : 'Type'}: ${reportData.animalType}`);
      doc.text(`${isArabic ? 'الاسم' : 'Name'}: ${reportData.animalName || '-'} | ${isArabic ? 'الجنس' : 'Gender'}: ${reportData.animalGender || '-'}`);
      doc.moveDown();

      // Results table
      doc.fontSize(12).fillColor('#0d9488').text(isArabic ? 'نتائج الفحوصات' : 'Test Results');
      doc.moveDown(0.5);

      const tableTop = doc.y;
      const colWidths = [140, 80, 60, 100, 80];
      const headers = isArabic
        ? ['الفحص', 'النتيجة', 'الوحدة', 'المدى المرجعي', 'الحالة']
        : ['Test', 'Result', 'Unit', 'Reference', 'Flag'];

      doc.fontSize(9).fillColor('#fff');
      let x = 50;
      headers.forEach((h, i) => {
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
        const values = [row.name, row.value, row.unit || '-', row.reference || '-', row.flag || ''];
        values.forEach((v, i) => {
          if (row.isCritical && i === 4) doc.fillColor('#dc2626');
          doc.text(String(v), x + 5, rowY + 4, { width: colWidths[i] - 10 });
          x += colWidths[i];
        });
        rowY += 18;
      });

      doc.y = rowY + 20;

      // Doctor notes
      if (reportData.doctorNotes) {
        doc.fontSize(11).fillColor('#0d9488').text(isArabic ? 'ملاحظات الطبيب' : 'Doctor Notes');
        doc.fontSize(10).fillColor('#333').text(reportData.doctorNotes);
        doc.moveDown();
      }

      // QR verification
      const qrData = await generateQR({
        reportNumber: reportData.reportNumber,
        sampleCode: reportData.sampleCode,
        verificationCode: reportData.verificationCode,
      });
      const qrBase64 = qrData.replace(/^data:image\/png;base64,/, '');
      const qrBuffer = Buffer.from(qrBase64, 'base64');
      doc.image(qrBuffer, 50, doc.y, { width: 80 });
      doc.fontSize(8).fillColor('#666')
        .text(isArabic ? 'امسح للتحقق من التقرير' : 'Scan to verify report', 140, doc.y + 30);

      // Signature
      doc.fontSize(10).fillColor('#333')
        .text(isArabic ? 'توقيع المختص' : 'Specialist Signature', 350, doc.y);
      if (reportData.specialistName) {
        doc.text(reportData.specialistName, 350, doc.y + 15);
      }

      doc.moveDown(4);
      doc.fontSize(8).fillColor('#999')
        .text(`${isArabic ? 'هذا التقرير صادر من' : 'Report issued by'} ${env.lab.name}`, { align: 'center' });

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
