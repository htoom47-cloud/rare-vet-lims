/**
 * ELISA special report rows — used only when ELISA_SPECIAL_ENTRY=true.
 * Collapses per-parameter rows into one disease/technique matrix row.
 * Does not mutate non-ELISA results.
 */

const isElisaCategory = (code) => String(code || '').toUpperCase() === 'ELISA';

/** True for any ELISA assay row (category or test code). */
const isElisaRow = (row = {}) => (
  isElisaCategory(row.categoryCode)
  || /ELISA/i.test(String(row.testCode || ''))
);

const isQualLikeRow = (row) => {
  const code = String(row.systemCode || row.code || '').toUpperCase();
  if (code === 'RESULT' || /INTERP|QUAL|INTERPRET/.test(code)) return true;
  if (row.flag === 'POS' || row.flag === 'NEG') return true;
  const val = String(row.value || '');
  return /^(positive|negative|إيجابي|سلبي)$/i.test(val.trim());
};

const pickSpRow = (rows, qualRow) => {
  const others = rows.filter((r) => r !== qualRow);
  const byCode = others.find((r) => /SP|S\/P|RATIO/i.test(String(r.systemCode || r.code || '')));
  if (byCode) return byCode;
  const numeric = others.find((r) => r.numericValue != null && r.numericValue !== '');
  if (numeric) return numeric;
  return others[0] || null;
};

const displaySpValue = (spRow) => {
  if (!spRow) return '—';
  if (spRow.numericValue != null && spRow.numericValue !== '') {
    const n = Number(spRow.numericValue);
    if (!Number.isNaN(n)) {
      return Number.isInteger(n) ? String(n) : String(n);
    }
  }
  const raw = String(spRow.value ?? '').trim();
  if (!raw || /^(positive|negative|إيجابي|سلبي)$/i.test(raw)) return '—';
  return raw;
};

const displayResultValue = (qualRow, lang) => {
  if (!qualRow) return '—';
  const raw = String(qualRow.value ?? '').trim();
  if (!raw) return '—';
  if (/^(positive|إيجابي|\+|pos)$/i.test(raw)) return lang === 'ar' ? 'إيجابي' : 'Positive';
  if (/^(negative|سلبي|\-|neg)$/i.test(raw)) return lang === 'ar' ? 'سلبي' : 'Negative';
  return raw;
};

const pickReference = (...rows) => {
  const candidates = [];
  for (const row of rows) {
    if (!row) continue;
    if (row.reference != null) candidates.push(row.reference);
  }
  for (const ref of candidates) {
    const s = String(ref).trim();
    if (s && s !== '-' && s !== 'N/A' && s !== 'غير متوفر') return s;
  }
  return '';
};

const displayTechnique = (method, lang) => {
  const m = String(method || 'ELISA').trim() || 'ELISA';
  if (/^ELISA$/i.test(m) || /^إليزا$/i.test(m) || /^اليزا$/i.test(m)) {
    return lang === 'ar' ? 'إليزا' : 'ELISA';
  }
  return m;
};

const displayDisease = (rows, spRow, qualRow, lang) => {
  const ar = spRow?.testNameAr || qualRow?.testNameAr || rows[0]?.testNameAr || '';
  const en = spRow?.testNameEn || qualRow?.testNameEn || rows[0]?.testNameEn || '';
  if (lang === 'ar') return (ar && String(ar).trim()) || en || '—';
  return (en && String(en).trim()) || ar || '—';
};

/**
 * Build disease-matrix rows for ELISA category only.
 * @returns {{ sn, labId, disease, technique, spPercent, result, reference }[]}
 */
const buildElisaMatrixRows = (results = [], { sampleCode = '', lang = 'ar' } = {}) => {
  const elisaRows = (results || []).filter(isElisaRow);
  if (!elisaRows.length) return [];

  const byTest = new Map();
  for (const row of elisaRows) {
    const key = row.testCode || row.testNameEn || 'ELISA';
    if (!byTest.has(key)) byTest.set(key, []);
    byTest.get(key).push(row);
  }

  let sn = 0;
  const matrix = [];
  for (const [, rows] of byTest) {
    sn += 1;
    const qualRow = rows.find(isQualLikeRow) || null;
    const spRow = pickSpRow(rows, qualRow);
    const method = spRow?.method || qualRow?.method || rows[0]?.method || 'ELISA';
    matrix.push({
      sn,
      labId: sampleCode || '—',
      disease: displayDisease(rows, spRow, qualRow, lang),
      technique: displayTechnique(method, lang),
      spPercent: displaySpValue(spRow),
      result: displayResultValue(qualRow, lang),
      // Prefer SP-RATIO text, then RESULT, then any other param in the assay group
      reference: pickReference(spRow, qualRow, ...rows) || (lang === 'ar' ? 'غير متوفر' : 'N/A'),
    });
  }
  return matrix;
};

const splitElisaSectionResults = (results = []) => {
  const elisa = [];
  const other = [];
  for (const row of results || []) {
    if (isElisaRow(row)) elisa.push(row);
    else other.push(row);
  }
  return { elisa, other };
};

module.exports = {
  isElisaCategory,
  isElisaRow,
  buildElisaMatrixRows,
  splitElisaSectionResults,
};
