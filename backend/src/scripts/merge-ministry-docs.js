/**
 * Merge ministry submission PDFs with an Arabic cover page.
 *
 * Usage:
 *   node src/scripts/merge-ministry-docs.js [inputDir] [outputPdf]
 */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const arabicReshaper = require('arabic-reshaper');
const { PDFDocument: PdfLibDoc, degrees } = require('pdf-lib');
const env = require('../config/env');
const { LAB_NAME_EN, LAB_NAME_AR } = require('../constants/brand');

const ROOT = path.join(__dirname, '../..');
const FONT_PATH = path.join(ROOT, 'assets/fonts/NotoSansArabic-Regular.ttf');
const FONT_BOLD_PATH = path.join(ROOT, 'assets/fonts/NotoSansArabic-Bold.ttf');
const HAS_AR_FONT = fs.existsSync(FONT_PATH);
const DEFAULT_INPUT = path.join(ROOT, 'uploads/ministry-docs');
const DEFAULT_OUTPUT = path.join(ROOT, 'uploads/ministry-docs/متطلبات-الكوادر-الفنية-مجمعة.pdf');

const BRAND = {
  brown: '#4A3728',
  gold: '#C9A227',
  goldPale: '#F5EDD6',
  text: '#2C2416',
  muted: '#6B5B4F',
  border: '#D4C4A8',
  cream: '#FAF8F4',
};

const STAFF = [
  { name: 'حاتم القحطاني', role: 'المدير ومالك المنشأة' },
  { name: 'مصطفى حسن مصطفى إبراهيم', role: 'فني مخبري' },
];

const TITLE_MAP = {
  'الهوية الوطنية_22-06-2026': 'الهوية الوطنية',
  'contract-34954442 (1)': 'عقد العمل',
  'Resident ID_17-06-2026 (1)': 'بطاقة الإقامة',
  'MSc mh (1)': 'شهادة الماجستير',
  'التسجيل المهني (1) (1)': 'شهادة التسجيل المهني',
};

const todayAr = () => {
  const d = new Date();
  const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}م`;
};

const friendlyName = (filename) => {
  const base = path.basename(filename, path.extname(filename));
  return TITLE_MAP[base] || base.replace(/[-_]+/g, ' ');
};

const hasAr = (t) => /[\u0600-\u06FF]/.test(String(t || ''));
const ARABIC_RUN = /[\u0600-\u06FF\u0750-\u077F]+/g;

const reverseArWords = (text) => {
  const words = String(text).trim().split(/\s+/);
  return words.length > 1 ? words.reverse().join(' ') : String(text).trim();
};

const shapeAr = (text) => arabicReshaper.convertArabic(reverseArWords(text));

const arLine = (text) => {
  const line = String(text ?? '').trim();
  if (!line || !hasAr(line)) return line;
  try {
    if (/[0-9A-Za-z]/.test(line)) return line.replace(ARABIC_RUN, (m) => shapeAr(m));
    return shapeAr(line);
  } catch {
    return line;
  }
};

const registerFonts = (doc) => {
  if (HAS_AR_FONT) {
    doc.registerFont('Arabic', FONT_PATH);
    doc.registerFont('ArabicBold', fs.existsSync(FONT_BOLD_PATH) ? FONT_BOLD_PATH : FONT_PATH);
  }
  doc.registerFont('Latin', 'Helvetica');
  doc.registerFont('LatinBold', 'Helvetica-Bold');
};

const setLatin = (doc, bold = false) => doc.font(bold ? 'LatinBold' : 'Latin');
const setArabic = (doc, bold = false) => doc.font(bold && HAS_AR_FONT ? 'ArabicBold' : (HAS_AR_FONT ? 'Arabic' : 'Latin'));

const cellLatin = (doc, text, x, y, w, opts = {}) => {
  const { size = 9, color = BRAND.text, bold = false, align = 'left' } = opts;
  setLatin(doc, bold);
  doc.fontSize(size).fillColor(color);
  doc.text(String(text ?? ''), x, y, { width: w, align, lineBreak: false, ellipsis: true });
};

const cellArabic = (doc, text, x, y, w, opts = {}) => {
  const { size = 9, color = BRAND.text, bold = false, align = 'right' } = opts;
  const shaped = arLine(text);
  if (!shaped) return;
  setArabic(doc, bold);
  doc.fontSize(size).fillColor(color);
  const tw = doc.widthOfString(shaped);
  let tx = x;
  if (align === 'right') tx = x + Math.max(0, w - tw);
  else if (align === 'center') tx = x + Math.max(0, (w - tw) / 2);
  doc.text(shaped, tx, y, { lineBreak: false });
};

const strokeRect = (doc, x, y, w, h, fill) => {
  if (fill) doc.rect(x, y, w, h).fill(fill);
  doc.rect(x, y, w, h).lineWidth(0.4).strokeColor(BRAND.border).stroke();
};

const listPdfFiles = (dir) => {
  const orderFile = path.join(dir, 'order.txt');
  if (fs.existsSync(orderFile)) {
    return fs.readFileSync(orderFile, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((name) => path.join(dir, name))
      .filter((p) => fs.existsSync(p) && p.toLowerCase().endsWith('.pdf'));
  }
  return fs.readdirSync(dir)
    .filter((f) => {
      const lower = f.toLowerCase();
      return lower.endsWith('.pdf')
        && !lower.includes('مجمعة')
        && !f.startsWith('_');
    })
    .sort((a, b) => a.localeCompare(b, 'ar'))
    .map((f) => path.join(dir, f));
};

const buildCoverPdf = async (attachments) => {
  const labAr = env.lab.nameAr || LAB_NAME_AR;
  const labEn = env.lab.name || LAB_NAME_EN;

  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: 'A4', margin: 48, autoFirstPage: true });
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    registerFonts(doc);
    const margin = 48;
    const pageW = doc.page.width;
    const contentW = pageW - margin * 2;
    let y = margin;

    doc.rect(margin, y, contentW, 3).fill(BRAND.gold);
    y += 18;

    cellArabic(doc, 'المملكة العربية السعودية', margin, y, contentW, { size: 12, bold: true, color: BRAND.brown, align: 'center' });
    y += 20;
    cellArabic(doc, 'وزارة البيئة والمياه والزراعة', margin, y, contentW, { size: 12, bold: true, color: BRAND.brown, align: 'center' });
    y += 26;

    doc.roundedRect(margin, y, contentW, 40, 4).fill(BRAND.goldPale);
    doc.roundedRect(margin, y, contentW, 40, 4).lineWidth(0.5).strokeColor(BRAND.gold).stroke();
    cellArabic(doc, 'صفحة تعريفية للمرفقات', margin, y + 8, contentW, { size: 15, bold: true, color: BRAND.brown, align: 'center' });
    cellArabic(doc, 'مستندات متطلبات الكوادر الفنية', margin, y + 26, contentW, { size: 11, bold: true, color: BRAND.text, align: 'center' });
    y += 52;

    cellLatin(doc, labEn, margin, y, contentW, { size: 9, color: BRAND.muted, bold: true, align: 'left' });
    y += 14;
    cellArabic(doc, labAr, margin, y, contentW, { size: 13, bold: true, color: BRAND.brown, align: 'right' });
    y += 28;

    const staffHeaderH = 18;
    strokeRect(doc, margin, y, contentW, staffHeaderH, BRAND.brown);
    cellArabic(doc, 'بيانات المنشأة والكوادر الفنية', margin + 8, y + 5, contentW - 16, {
      size: 10, bold: true, color: '#FFFFFF', align: 'right',
    });
    y += staffHeaderH;

    const colRoleW = contentW * 0.42;
    const colNameW = contentW - colRoleW;
    const staffRowH = 24;

    strokeRect(doc, margin, y, colRoleW, staffRowH, BRAND.goldPale);
    strokeRect(doc, margin + colRoleW, y, colNameW, staffRowH, BRAND.goldPale);
    cellArabic(doc, 'الصفة', margin + 6, y + 7, colRoleW - 12, { size: 9, bold: true, color: BRAND.brown, align: 'right' });
    cellArabic(doc, 'الاسم', margin + colRoleW + 6, y + 7, colNameW - 12, { size: 9, bold: true, color: BRAND.brown, align: 'right' });
    y += staffRowH;

    STAFF.forEach((person, i) => {
      const bg = i % 2 === 0 ? BRAND.cream : '#FFFFFF';
      strokeRect(doc, margin, y, colRoleW, staffRowH, bg);
      strokeRect(doc, margin + colRoleW, y, colNameW, staffRowH, bg);
      cellArabic(doc, person.role, margin + 6, y + 7, colRoleW - 12, { size: 9, color: BRAND.muted, align: 'right' });
      cellArabic(doc, person.name, margin + colRoleW + 6, y + 7, colNameW - 12, { size: 10, bold: true, color: BRAND.text, align: 'right' });
      y += staffRowH;
    });
    y += 20;

    const colNo = 32;
    const colPages = 52;
    const colTitle = contentW - colNo - colPages;
    const tableRowH = 22;

    strokeRect(doc, margin, y, contentW, tableRowH, BRAND.brown);
    cellArabic(doc, 'م', margin, y + 6, colNo, { size: 9, bold: true, color: '#FFFFFF', align: 'center' });
    cellArabic(doc, 'اسم المرفق', margin + colNo, y + 6, colTitle, { size: 9, bold: true, color: '#FFFFFF', align: 'right' });
    cellArabic(doc, 'الصفحات', margin + colNo + colTitle, y + 6, colPages, { size: 9, bold: true, color: '#FFFFFF', align: 'center' });
    y += tableRowH;

    attachments.forEach((item, idx) => {
      const bg = idx % 2 === 0 ? BRAND.cream : '#FFFFFF';
      strokeRect(doc, margin, y, contentW, tableRowH, bg);
      cellLatin(doc, String(idx + 1), margin, y + 6, colNo, { size: 9, align: 'center' });
      cellArabic(doc, item.title, margin + colNo + 4, y + 6, colTitle - 8, { size: 9, color: BRAND.text, align: 'right' });
      cellLatin(doc, String(item.pages), margin + colNo + colTitle, y + 6, colPages, { size: 9, align: 'center' });
      y += tableRowH;
    });

    y += 22;
    cellArabic(doc, `التاريخ: ${todayAr()}`, margin, y, contentW, { size: 9, color: BRAND.muted, align: 'right' });
    y += 18;
    cellArabic(doc, 'تُقدَّم هذه المستندات استكمالاً لمتطلبات الكوادر الفنية المعتمدة من الوزارة.', margin, y, contentW, {
      size: 8.5, color: BRAND.muted, align: 'right',
    });

    doc.rect(margin, doc.page.height - margin - 3, contentW, 2).fill(BRAND.gold);
    doc.end();
  });
};

const countPages = async (filePath) => {
  const bytes = fs.readFileSync(filePath);
  const pdf = await PdfLibDoc.load(bytes, { ignoreEncryption: true });
  return pdf.getPageCount();
};

const mergePdfs = async (coverBuffer, pdfPaths) => {
  const merged = await PdfLibDoc.create();

  const coverDoc = await PdfLibDoc.load(coverBuffer);
  (await merged.copyPages(coverDoc, coverDoc.getPageIndices())).forEach((p) => merged.addPage(p));

  for (const filePath of pdfPaths) {
    const bytes = fs.readFileSync(filePath);
    const src = await PdfLibDoc.load(bytes, { ignoreEncryption: true });
    const indices = src.getPageIndices();
    const pages = await merged.copyPages(src, indices);
    pages.forEach((page, i) => {
      const srcPage = src.getPage(indices[i]);
      const { width, height } = srcPage.getSize();
      const rotation = srcPage.getRotation().angle;
      if (width > height && rotation === 0) {
        page.setRotation(degrees(90));
      }
      merged.addPage(page);
    });
  }

  return merged.save();
};

const main = async () => {
  const inputDir = path.resolve(process.argv[2] || DEFAULT_INPUT);
  const outputPath = path.resolve(process.argv[3] || DEFAULT_OUTPUT);

  if (!fs.existsSync(inputDir)) {
    fs.mkdirSync(inputDir, { recursive: true });
    console.error(`تم إنشاء المجلد: ${inputDir}`);
    process.exit(1);
  }

  const pdfPaths = listPdfFiles(inputDir);
  if (!pdfPaths.length) {
    console.error(`لا توجد ملفات PDF في: ${inputDir}`);
    process.exit(1);
  }

  console.log('الملفات المراد دمجها:');
  const attachments = [];
  for (const filePath of pdfPaths) {
    const pages = await countPages(filePath);
    attachments.push({ filePath, title: friendlyName(path.basename(filePath)), pages });
    console.log(`  - ${path.basename(filePath)} (${pages} صفحة)`);
  }

  const coverBuffer = await buildCoverPdf(attachments);
  const mergedBytes = await mergePdfs(coverBuffer, pdfPaths);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, mergedBytes);

  const totalPages = 1 + attachments.reduce((sum, a) => sum + a.pages, 0);
  console.log(`\nتم إنشاء الملف: ${outputPath}`);
  console.log(`إجمالي الصفحات: ${totalPages}`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
