/**
 * Report body — patient info box only.
 */
const { drawEn, drawAr, drawArBox } = require('./pdf-arabic');
const { isArabic, t, animalLabel } = require('./pdf-i18n');
const { renderResultsTable } = require('./pdf-results-table');

const STYLE = { border: '#C8C8C8' };
const FONT = { infoLabel: 7, infoValue: 7.5 };
const INFO_H = 46;
const INFO_ROW = 11;
const ICON_W = 28;

const bl = (y, h, pad = 3) => y + h - pad;

const drawText = (doc, text, x, y, w, lang, opts = {}) => {
  const { size = 7.5, bold = false, align, color = '#000' } = opts;
  const str = String(text ?? '-');
  if (isArabic(lang)) {
    drawAr(doc, str, x, y, w, { size, bold, color, align: align || 'right' });
  } else {
    drawEn(doc, str, x, y, { size, bold, color, width: w, align: align || 'left' });
  }
};

const drawLabel = (doc, text, x, y, w, lang) => {
  const label = `${text}:`;
  if (isArabic(lang)) {
    drawArBox(doc, label, x, y, w, { size: FONT.infoLabel, bold: true, align: 'right' });
  } else {
    drawEn(doc, label, x, y, { size: FONT.infoLabel, bold: true, width: w });
  }
};

const drawCamelIcon = (doc, x, y, sz) => {
  const cx = x + sz / 2;
  const cy = y + sz / 2;
  doc.save().lineWidth(0.9).strokeColor('#666');
  doc.moveTo(cx - 12, cy + 6).lineTo(cx - 4, cy - 2).lineTo(cx + 4, cy + 1)
    .lineTo(cx + 11, cy - 9).lineTo(cx + 13, cy - 14).stroke();
  doc.circle(cx + 13, cy - 15, 1.8).fill('#B8904D');
  doc.moveTo(cx - 12, cy + 6).lineTo(cx - 14, cy + 10).stroke();
  doc.moveTo(cx + 4, cy + 1).lineTo(cx + 2, cy + 8).stroke();
  doc.restore();
};

const drawInfoBox = (doc, data, TX, TW, y0, lang) => {
  const L = t(lang);
  const ar = isArabic(lang);
  const textW = TW - ICON_W;
  const half = Math.floor(textW / 2);

  doc.rect(TX, y0, TW, INFO_H).lineWidth(0.8).strokeColor('#000000').stroke();
  doc.moveTo(TX + half, y0 + 3).lineTo(TX + half, y0 + INFO_H - 3).strokeColor(STYLE.border).stroke();

  const orderRows = [
    [L.orderId, data.reportNumber],
    [L.customerName, data.customerName],
    [L.customerMobile, data.customerMobile],
    [L.nationalId, data.nationalId || '-'],
  ];
  const animalRows = [
    [L.analysisDate, data.dateStr],
    [L.animalId, data.animalName],
    [L.animalType, animalLabel(lang, data.animalType)],
    [L.animalChip, data.animalChip || '-'],
  ];

  const paintCol = (rows, colX, colW, startY) => {
    const labelW = ar ? 72 : 66;
    const valW = colW - labelW - 6;
    rows.forEach(([label, val], i) => {
      const by = bl(startY + i * INFO_ROW, INFO_ROW);
      if (ar) {
        drawArBox(doc, `${label}:`, colX + colW - labelW, by, labelW, { size: FONT.infoLabel, bold: true, align: 'right' });
        drawAr(doc, val, colX, by, valW, { size: FONT.infoValue, bold: true, align: 'right' });
      } else {
        drawLabel(doc, label, colX, by, labelW, lang);
        drawText(doc, val, colX + labelW + 2, by, valW, lang, { size: FONT.infoValue, bold: true, align: 'left' });
      }
    });
  };

  if (ar) {
    paintCol(orderRows, TX + half + 5, half - 5, y0 + 4);
    paintCol(animalRows, TX + 5, half, y0 + 4);
  } else {
    paintCol(orderRows, TX + 5, half, y0 + 4);
    paintCol(animalRows, TX + half + 5, half - 5, y0 + 4);
  }

  drawCamelIcon(doc, TX + TW - ICON_W + 1, y0 + 8, ICON_W - 4);
  return y0 + INFO_H + 4;
};

const renderReportBody = (doc, reportData, layout) => {
  const lang = reportData.language || 'ar';
  const y0 = reportData._cursorY || layout.CONTENT_TOP;

  let y = drawInfoBox(doc, {
    reportNumber: reportData.reportNumber,
    customerName: reportData.customerName || '-',
    customerMobile: reportData.customerMobile || '-',
    nationalId: reportData.nationalId || '-',
    dateStr: reportData.dateStr,
    animalName: reportData.animalName || reportData.animalCode || '-',
    animalType: reportData.animalType,
    animalChip: reportData.animalChip || '-',
  }, layout.TX, layout.TW, y0, lang);

  if (reportData.results?.length) {
    y = renderResultsTable(doc, reportData.results, layout.TX, layout.TW, y, lang, layout);
  }

  doc.y = y;
  return y;
};

module.exports = { renderReportBody };
