/**
 * Shared bilingual row/table layout for invoice & quote PDFs.
 * English left column (LTR), Arabic right column (RTL) — no overlapping labels.
 */

const TABLE_HEADER_H = 28;

const bilingualMetaRow = (doc, ctx, y, rowH, labelEn, labelAr, value) => {
  const { MARGIN, TW, cellLatin, cellArabic } = ctx;
  const mid = MARGIN + TW / 2;
  const half = TW / 2;
  const val = String(value ?? '-');
  const labelEnW = 76;
  const labelArW = 72;
  const pad = y + Math.max(4, (rowH - 8) / 2);

  cellLatin(doc, `${labelEn}:`, MARGIN + 8, pad, labelEnW, { size: 8, bold: true });
  cellLatin(doc, val, MARGIN + 8 + labelEnW, pad, half - labelEnW - 16, { size: 8 });
  cellLatin(doc, val, mid + 8, pad, half - labelArW - 16, { size: 8, align: 'right' });
  cellArabic(doc, `${labelAr}:`, mid + half - labelArW - 4, pad, labelArW, { size: 8, bold: true, align: 'right' });
};

const drawCustomerBlock = (doc, ctx, y, customerEn, customerAr, mobile) => {
  const { MARGIN, TW, strokeBox, cellLatin, cellArabic } = ctx;
  const custH = mobile ? 40 : 32;
  strokeBox(doc, MARGIN, y, TW, custH);

  const mid = MARGIN + TW / 2;
  const half = TW / 2;
  const labelEnW = 62;
  const labelArW = 56;
  const nameEn = customerEn || (customerAr ? '—' : '-');
  const nameAr = customerAr || customerEn || '-';

  const r1 = y + 6;
  cellLatin(doc, 'Customer:', MARGIN + 8, r1, labelEnW, { size: 8, bold: true });
  cellLatin(doc, nameEn, MARGIN + 8 + labelEnW, r1, half - labelEnW - 16, { size: 8, bold: true });
  cellArabic(doc, nameAr, mid + 8, r1, half - labelArW - 16, { size: 8, bold: true, align: 'right' });
  cellArabic(doc, 'العميل:', mid + half - labelArW - 4, r1, labelArW, { size: 8, bold: true, align: 'right' });

  if (mobile) {
    const r2 = y + 22;
    const mob = String(mobile);
    cellLatin(doc, 'Mobile:', MARGIN + 8, r2, labelEnW, { size: 7.5, bold: true });
    cellLatin(doc, mob, MARGIN + 8 + labelEnW, r2, half - labelEnW - 16, { size: 7.5 });
    cellLatin(doc, mob, mid + 8, r2, half - labelArW - 16, { size: 7.5, align: 'right' });
    cellArabic(doc, 'الجوال:', mid + half - labelArW - 4, r2, labelArW, { size: 7.5, align: 'right' });
  }

  return y + custH;
};

const drawBilingualTableHeader = (doc, ctx, cols, y) => {
  const { activeBrand, cellLatin, cellArabic } = ctx;
  const h = TABLE_HEADER_H;
  let x = ctx.MARGIN;

  cols.forEach((col) => {
    doc.rect(x, y, col.w, h).fill(activeBrand.brown);
    doc.rect(x, y, col.w, h).lineWidth(0.4).strokeColor(activeBrand.border).stroke();
    const inner = col.w - 4;
    const narrow = col.w < 60;
    const enSize = narrow ? 5.5 : 6;
    const arSize = narrow ? 5.5 : 6.5;

    if (col.en && col.ar && col.en !== col.ar) {
      cellLatin(doc, col.en, x + 2, y + 4, inner, { size: enSize, color: '#fff', bold: true, align: 'center' });
      cellArabic(doc, col.ar, x + 2, y + 15, inner, { size: arSize, color: '#fff', bold: true, align: 'center' });
    } else {
      const label = col.en || col.ar;
      const isAr = col.ar && !col.en;
      if (isAr) {
        cellArabic(doc, label, x + 2, y + 8, inner, { size: 7, color: '#fff', bold: true, align: 'center' });
      } else {
        cellLatin(doc, label, x + 2, y + 8, inner, { size: 7, color: '#fff', bold: true, align: 'center' });
      }
    }
    x += col.w;
  });

  return y + h;
};

module.exports = {
  TABLE_HEADER_H,
  bilingualMetaRow,
  drawCustomerBlock,
  drawBilingualTableHeader,
};
