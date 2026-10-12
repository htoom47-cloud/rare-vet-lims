/**
 * One PDF for a customer's brucella herd list.
 * Not a per-sample laboratory report.
 */
const PDFDocument = require('pdfkit');
const { LAB_NAME_AR, LAB_NAME_EN } = require('../constants/brand');
const { registerPdfFonts, drawArBox, drawEn } = require('./pdf-arabic');
const { HAS_LOGO, getBrandLogoBuffer } = require('./pdf-logo');

const MARGIN = 36;
const PAGE_W = 595;
const PAGE_H = 842;
const TW = PAGE_W - MARGIN * 2;
const BROWN = '#4E342E';
const MUTED = '#75685C';
const LINE = '#D8C8AE';
const RED = '#b91c1c';
const ROW_H = 16;

const isPositive = (value) => /^(positive|إيجابي|\+|pos)$/i.test(String(value || '').trim());

const columns = [
  { key: 'num', width: 36 },
  { key: 'sample', width: 110, label: 'رقم العينة' },
  { key: 'animal', width: 100, label: 'رقم الحيوان' },
  { key: 'name', width: 157, label: 'الاسم' },
  { key: 'result', width: 120, label: 'النتيجة' },
];

const columnXs = () => {
  let right = MARGIN + TW;
  return columns.map((col) => {
    right -= col.width;
    return { ...col, x: right };
  });
};

const rule = (doc, y) => {
  doc.moveTo(MARGIN, y).lineTo(MARGIN + TW, y).lineWidth(0.4).strokeColor(LINE).stroke();
};

const drawTableHead = (doc, y, cols) => {
  doc.rect(MARGIN, y, TW, 18).fill(BROWN);
  cols.forEach((col) => {
    if (col.key === 'num') {
      drawEn(doc, '#', col.x, y + 4, { size: 8, color: '#fff', bold: true, width: col.width, align: 'center', fromTop: true });
    } else {
      drawArBox(doc, col.label, col.x + 2, y + 3, col.width - 4, { size: 8, color: '#fff', bold: true, align: 'center', fromTop: true });
    }
  });
  return y + 18;
};

const buildBrucellaListPdf = async ({ customerName, rows, printedAt }) => {
  const logo = HAS_LOGO ? await getBrandLogoBuffer(BROWN) : null;
  const positiveCount = rows.filter((row) => isPositive(row.result_value)).length;
  const cols = columnXs();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    registerPdfFonts(doc);

    let y = MARGIN;
    if (logo) {
      doc.image(logo, MARGIN, y, { width: 42, height: 42 });
    }
    drawArBox(doc, LAB_NAME_AR, MARGIN + 52, y, TW - 52, { size: 14, color: BROWN, bold: true, align: 'right', fromTop: true });
    drawEn(doc, LAB_NAME_EN, MARGIN + 52, y + 18, { size: 9, color: BROWN, bold: true, width: TW - 52, align: 'right', fromTop: true });
    drawArBox(doc, 'تقرير نتائج المختبر', MARGIN + 52, y + 32, TW - 52, { size: 10, color: BROWN, align: 'right', fromTop: true });
    y += 52;
    rule(doc, y);
    y += 8;
    drawArBox(doc, `المالك: ${customerName || '—'}`, MARGIN, y, TW, { size: 10, color: BROWN, bold: true, align: 'right', fromTop: true });
    y += 16;
    drawArBox(doc, `الفحص: المالطية روز بنغال    العدد: ${rows.length}    إيجابي: ${positiveCount}`, MARGIN, y, TW * 0.72, { size: 9, color: MUTED, align: 'right', fromTop: true });
    drawEn(doc, printedAt || '', MARGIN, y, { size: 9, color: MUTED, width: TW * 0.28, align: 'left', fromTop: true });
    y += 18;
    y = drawTableHead(doc, y, cols);

    rows.forEach((row, index) => {
      if (y > PAGE_H - 48) {
        doc.addPage();
        y = MARGIN;
        y = drawTableHead(doc, y, cols);
      }
      if (index % 2 === 1) doc.rect(MARGIN, y, TW, ROW_H).fill('#F8F5F0');
      const positive = isPositive(row.result_value);
      const values = {
        num: String(index + 1),
        sample: row.sample_code || '',
        animal: row.animal_code || '',
        name: row.animal_name || '—',
        result: row.result_value || '',
      };
      cols.forEach((col) => {
        const text = values[col.key];
        const color = col.key === 'result' && positive ? RED : '#1a1a1a';
        if (col.key === 'name' || col.key === 'result') {
          drawArBox(doc, text, col.x + 2, y + 3, col.width - 4, { size: 8, color, bold: positive, align: 'center', fromTop: true });
        } else {
          drawEn(doc, text, col.x, y + 3, { size: 8, color, width: col.width, align: 'center', fromTop: true });
        }
      });
      y += ROW_H;
    });

    if (positiveCount) {
      if (y > PAGE_H - 60) {
        doc.addPage();
        y = MARGIN;
      }
      y += 8;
      drawArBox(doc, 'ملاحظة: النتيجة المالطية الإيجابية يجب التأكيد باختبار ELISA.', MARGIN, y, TW, { size: 8, color: BROWN, align: 'right', fromTop: true });
    }

    doc.end();
  });
};

module.exports = { buildBrucellaListPdf };
