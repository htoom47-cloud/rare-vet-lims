/**
 * Results table — dual-column layout to use page width.
 * Hematology: WBC+RBC (left) | PLT (right). With chemistry: Hematology | Chemistry.
 */
const { drawEn, drawArBox } = require('./pdf-arabic');
const { isArabic, t } = require('./pdf-i18n');
const { normaSortIndex } = require('./norma-cbc-map');

const STYLE = {
  panelHdr: '#B8965D',
  sectionHdr: '#A9C4EB',
  rowAlt: '#E8F0FA',
  border: '#C8C8C8',
  high: '#CC0000',
  low: '#0066CC',
  text: '#000000',
};

const FONT = { panel: 8, colHdr: 7, section: 7, cell: 6.5 };
const GAP = 8;
const PANEL_H = 13;
const COL_H = 11;
const SEC_H = 11;
const ROW_H = 10;

const CHEM_CODES = new Set([
  'GLU', 'BUN', 'CREA', 'ALP', 'AST', 'GGT', 'ALT', 'ALB', 'TP',
  'CK', 'LDH', 'IRON', 'CA', 'PHOS', 'T4', 'PCR-RES', 'SP-RATIO', 'GROWTH', 'TITER', 'FINDINGS',
]);

const CBC_SECTIONS = [
  {
    key: 'wbc',
    titleEn: 'White Blood Cells',
    titleAr: 'كريات الدم البيضاء',
    codes: ['WBC', 'LYM_PCT', 'MON_PCT', 'NEU_PCT', 'EOS_PCT', 'BAS_PCT'],
    column: 'left',
  },
  {
    key: 'rbc',
    titleEn: 'Red Blood Cells',
    titleAr: 'كريات الدم الحمراء',
    codes: ['RBC', 'HGB', 'MCV', 'HCT', 'MCH', 'MCHC', 'RDW-SD', 'RDW-CV', 'RDW'],
    column: 'left',
  },
  {
    key: 'plt',
    titleEn: 'Platelets',
    titleAr: 'الصفائح الدموية',
    codes: ['PLT', 'MPV', 'PCT', 'PDW-SD', 'PDW-CV', 'PLC-R', 'PLC-C'],
    column: 'right',
  },
];

const CHEM_SECTIONS = [
  { key: 'renal', titleEn: 'Renal function', titleAr: 'وظائف الكلى', codes: ['BUN', 'CREA'], column: 'left' },
  { key: 'sugar', titleEn: 'Sugar level', titleAr: 'مستويات السكر', codes: ['GLU'], column: 'left' },
  { key: 'lft', titleEn: 'L.F.T', titleAr: 'وظائف الكبد', codes: ['ALP', 'AST', 'GGT', 'ALT', 'ALB', 'TP'], column: 'left' },
  { key: 'muscle', titleEn: 'Muscle profiles', titleAr: 'العضلات', codes: ['CK', 'LDH'], column: 'right' },
  { key: 'minerals', titleEn: 'Minerals level', titleAr: 'مستويات المعادن', codes: ['IRON', 'CA', 'PHOS'], column: 'right' },
];

const PANEL_META = {
  hematology: { titleEn: 'Hematology Report', titleAr: 'صورة الدم' },
  chemistry: { titleEn: 'Chemistry Report', titleAr: 'كيمياء الدم' },
};

const colSplit = (w) => {
  const param = Math.floor(w * 0.46);
  const result = Math.floor(w * 0.22);
  return { param, result, ref: w - param - result };
};

const fmtValue = (v) => {
  const s = String(v ?? '').trim();
  if (!s || s === '-') return '-';
  const n = Number(s);
  return Number.isNaN(n) ? s : n.toFixed(2);
};

const fmtResult = (row) => {
  const v = fmtValue(row.value);
  if (row.flag === 'HIGH' || row.flag === 'CRIT_HIGH') return { text: `${v} H`, tone: 'high' };
  if (row.flag === 'LOW' || row.flag === 'CRIT_LOW') return { text: `${v} L`, tone: 'low' };
  return { text: v, tone: 'normal' };
};

const { resolveReportReferenceDisplay } = require('./reference-range');

const fmtRef = (row) => {
  const verbatim = row.reference && row.reference !== '-' ? String(row.reference).trim() : null;
  if (verbatim) return verbatim;
  if (row.minValue != null && row.maxValue != null) {
    return `${Number(row.minValue).toFixed(2)} - ${Number(row.maxValue).toFixed(2)}`;
  }
  return '-';
};

const paramName = (row, lang) => {
  if (isArabic(lang)) return row.nameAr || row.nameEn || row.code;
  return row.nameEn || row.nameAr || row.code;
};

const indexResults = (results) => {
  const map = new Map();
  results.forEach((r) => {
    const code = String(r.code || '').toUpperCase();
    if (code && !map.has(code)) map.set(code, { ...r, code });
  });
  return map;
};

const isChemCode = (code) => CHEM_CODES.has(code);

const buildSections = (sectionDefs, byCode) => {
  const used = new Set();
  const sections = sectionDefs.map((def) => {
    const items = def.codes.map((c) => byCode.get(c)).filter(Boolean);
    items.forEach((item) => used.add(item.code));
    return {
      titleEn: def.titleEn,
      titleAr: def.titleAr,
      column: def.column,
      items,
    };
  }).filter((s) => s.items.length);

  const extras = [];
  byCode.forEach((row, code) => {
    if (!used.has(code)) extras.push(row);
  });
  if (extras.length) {
    extras.sort((a, b) => normaSortIndex(a.code) - normaSortIndex(b.code));
    sections.push({
      titleEn: 'Other',
      titleAr: 'أخرى',
      column: 'left',
      items: extras,
    });
  }
  return sections;
};

const preparePanels = (results) => {
  const byCode = indexResults(results);
  const hemaMap = new Map();
  const chemMap = new Map();
  byCode.forEach((row, code) => {
    if (isChemCode(code)) chemMap.set(code, row);
    else hemaMap.set(code, row);
  });
  return {
    hematology: buildSections(CBC_SECTIONS, hemaMap),
    chemistry: buildSections(CHEM_SECTIONS, chemMap),
  };
};

const nextPage = (doc, y, need, layout) => {
  if (y + need <= layout.CONTENT_BOTTOM) return y;
  doc.addPage({ size: layout.PAGE_SIZE, margin: 0 });
  layout.onNewPage(doc);
  return layout.CONTENT_TOP;
};

const strokeRect = (doc, x, y, w, h, color = STYLE.border) => {
  doc.rect(x, y, w, h).lineWidth(0.35).strokeColor(color).stroke();
};

const strokeCols = (doc, x, y, h, cols) => {
  doc.moveTo(x + cols.param, y).lineTo(x + cols.param, y + h).stroke();
  doc.moveTo(x + cols.param + cols.result, y).lineTo(x + cols.param + cols.result, y + h).stroke();
};

const writeCell = (doc, text, x, y, w, lang, opts = {}) => {
  const { size = FONT.cell, color = STYLE.text, bold = false, align = 'left', fromTop = true } = opts;
  if (isArabic(lang)) {
    drawArBox(doc, text, x, y, w, { size, color, bold, align, fromTop });
  } else {
    drawEn(doc, text, x, y, { size, color, bold, width: w, align, fromTop });
  }
};

const drawPanelHdr = (doc, meta, x, w, y, lang) => {
  const title = isArabic(lang) ? meta.titleAr : meta.titleEn;
  doc.rect(x, y, w, PANEL_H).fill(STYLE.panelHdr);
  writeCell(doc, title, x + 2, y + 2, w - 4, lang, {
    size: FONT.panel, color: '#fff', bold: true, align: 'center', fromTop: true,
  });
  return y + PANEL_H;
};

const drawColHdr = (doc, x, w, y, lang) => {
  const L = t(lang);
  const cols = colSplit(w);
  strokeRect(doc, x, y, w, COL_H);
  const ty = y + 2;
  writeCell(doc, L.parameter, x + 2, ty, cols.param - 4, lang, {
    size: FONT.colHdr, bold: true, align: isArabic(lang) ? 'right' : 'left', fromTop: true,
  });
  writeCell(doc, L.result, x + cols.param, ty, cols.result, lang, {
    size: FONT.colHdr, bold: true, align: 'center', fromTop: true,
  });
  writeCell(doc, L.refRange, x + cols.param + cols.result, ty, cols.ref, lang, {
    size: FONT.colHdr, bold: true, align: 'center', fromTop: true,
  });
  doc.moveTo(x, y + COL_H).lineTo(x + w, y + COL_H).lineWidth(0.6).strokeColor('#000').stroke();
  return y + COL_H;
};

const drawSectionHdr = (doc, section, x, w, y, lang) => {
  const title = isArabic(lang) ? section.titleAr : section.titleEn;
  doc.rect(x, y, w, SEC_H).fill(STYLE.sectionHdr);
  writeCell(doc, title, x + 2, y + 1, w - 4, lang, {
    size: FONT.section, bold: true, align: isArabic(lang) ? 'right' : 'left', fromTop: true,
  });
  strokeRect(doc, x, y, w, SEC_H);
  return y + SEC_H;
};

const drawRow = (doc, row, x, w, y, lang, alt) => {
  const cols = colSplit(w);
  const { text: res, tone } = fmtResult(row);
  const resColor = tone === 'high' ? STYLE.high : tone === 'low' ? STYLE.low : STYLE.text;

  if (alt) doc.rect(x, y, w, ROW_H).fill(STYLE.rowAlt);
  strokeRect(doc, x, y, w, ROW_H);
  strokeCols(doc, x, y, ROW_H, cols);

  const ty = y + 2;
  writeCell(doc, paramName(row, lang), x + 2, ty, cols.param - 4, lang, {
    align: isArabic(lang) ? 'right' : 'left', fromTop: true,
  });
  drawEn(doc, res, x + cols.param, ty, { size: FONT.cell, color: resColor, width: cols.result, align: 'center', fromTop: true });
  drawEn(doc, fmtRef(row), x + cols.param + cols.result, ty, { size: FONT.cell, width: cols.ref, align: 'center', fromTop: true });

  return y + ROW_H;
};

const drawColumnSections = (doc, sections, x, w, y0, lang, layout, withColHdr) => {
  let y = y0;
  if (withColHdr) {
    y = nextPage(doc, y, COL_H, layout);
    y = drawColHdr(doc, x, w, y, lang);
  }
  sections.forEach((section) => {
    y = nextPage(doc, y, SEC_H, layout);
    y = drawSectionHdr(doc, section, x, w, y, lang);
    section.items.forEach((item, i) => {
      y = nextPage(doc, y, ROW_H, layout);
      y = drawRow(doc, item, x, w, y, lang, i % 2 === 1);
    });
  });
  return y;
};

const splitByColumn = (sections) => ({
  left: sections.filter((s) => s.column !== 'right'),
  right: sections.filter((s) => s.column === 'right'),
});

const drawSinglePanelTwoCols = (doc, meta, sections, x, totalW, startY, lang, layout) => {
  const { left, right } = splitByColumn(sections);
  const hasLeft = left.length > 0;
  const hasRight = right.length > 0;

  if (!hasLeft && !hasRight) return startY;

  let y = nextPage(doc, startY, PANEL_H, layout);
  y = drawPanelHdr(doc, meta, x, totalW, y, lang);

  if (hasLeft && hasRight) {
    const colW = Math.floor((totalW - GAP) / 2);
    const yL = drawColumnSections(doc, left, x, colW, y, lang, layout, true);
    const yR = drawColumnSections(doc, right, x + colW + GAP, colW, y, lang, layout, true);
    return Math.max(yL, yR) + 4;
  }

  return drawColumnSections(doc, hasLeft ? left : right, x, totalW, y, lang, layout, true) + 4;
};

const renderResultsTable = (doc, results, x, totalW, startY, lang, layout) => {
  const { hematology, chemistry } = preparePanels(results);
  const hasH = hematology.length > 0;
  const hasC = chemistry.length > 0;

  if (!hasH && !hasC) return startY;

  const y = startY;

  if (hasH && hasC) {
    const colW = Math.floor((totalW - GAP) / 2);
    const yH = drawSinglePanelTwoCols(doc, PANEL_META.hematology, hematology, x, colW, y, lang, layout);
    const yC = drawSinglePanelTwoCols(doc, PANEL_META.chemistry, chemistry, x + colW + GAP, colW, y, lang, layout);
    return Math.max(yH, yC) + 4;
  }

  if (hasH) {
    return drawSinglePanelTwoCols(doc, PANEL_META.hematology, hematology, x, totalW, y, lang, layout);
  }

  return drawSinglePanelTwoCols(doc, PANEL_META.chemistry, chemistry, x, totalW, y, lang, layout);
};

module.exports = { renderResultsTable, STYLE };

