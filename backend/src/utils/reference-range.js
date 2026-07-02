/** Parse reference range strings from Norma HL7/ASTM OBX-7 — bounds optional, raw always kept. */
const parseReferenceRange = (raw) => {
  if (raw == null || raw === '') return null;
  const original = String(raw).trim();
  let s = original;
  s = s.replace(/^[([{<]+/, '').replace(/[)\]}>]+$/, '');

  if (s.includes('^')) {
    const parts = s.split('^').map((p) => p.trim().replace(/,/g, '.')).filter((p) => /^[\d.]+$/.test(p));
    if (parts.length >= 2) {
      const min = parseFloat(parts[0]);
      const max = parseFloat(parts[1]);
      if (!Number.isNaN(min) && !Number.isNaN(max)) {
        return { min: Math.min(min, max), max: Math.max(min, max), raw: original };
      }
    }
  }

  s = s.replace(/,/g, '.');
  const m = s.match(/([\d.]+)\s*[-–—~]\s*([\d.]+)/);
  if (m) {
    const min = parseFloat(m[1]);
    const max = parseFloat(m[2]);
    if (!Number.isNaN(min) && !Number.isNaN(max)) {
      return { min: Math.min(min, max), max: Math.max(min, max), raw: original };
    }
  }

  return { min: null, max: null, raw: original };
};

const defaultCritical = (min, max) => {
  if (min == null || max == null) return { crit_low: null, crit_high: null };
  const span = max - min || Math.abs(max) || 1;
  return {
    crit_low: Math.round((min - span * 0.5) * 1000) / 1000,
    crit_high: Math.round((max + span * 0.5) * 1000) / 1000,
  };
};

/** Verbatim OBX-7 text only — never synthesize from parsed min/max. */
const normaReferenceNote = (raw) => {
  const text = String(raw ?? '').trim();
  return text ? `Norma: ${text}` : null;
};

/** Display text from frozen result_values.notes (verbatim Norma OBX-7). */
const verbatimFromResultNotes = (notes) => {
  if (!notes || !String(notes).startsWith('Norma:')) return null;
  return String(notes).slice(6).trim() || null;
};

/** Parse bounds from frozen notes only (for flag math). */
const referenceFromResultNotes = (notes) => {
  const text = verbatimFromResultNotes(notes);
  if (!text) return null;
  return parseReferenceRange(text);
};

/** Report bounds: Norma snapshot in notes only — never LIMS tables. */
const resolveReportReferenceBounds = (row) => {
  const snap = referenceFromResultNotes(row.rv_notes);
  return {
    min: snap?.min ?? null,
    max: snap?.max ?? null,
  };
};

/** Report reference column: verbatim Norma OBX-7 when present. */
const resolveReportReferenceDisplay = (row) => {
  const verbatim = verbatimFromResultNotes(row.rv_notes);
  if (verbatim) return verbatim;
  const snap = referenceFromResultNotes(row.rv_notes);
  if (snap?.min != null && snap?.max != null) {
    return snap.raw || `${snap.min} - ${snap.max}`;
  }
  return null;
};

/** UI/PDF reference — Norma notes only; never LIMS tables. */
const resolveNormaReferenceOnly = (row) => {
  const fromNotes = verbatimFromResultNotes(row?.rv_notes || row?.notes);
  if (fromNotes) return fromNotes;
  return null;
};

module.exports = {
  parseReferenceRange,
  defaultCritical,
  normaReferenceNote,
  verbatimFromResultNotes,
  referenceFromResultNotes,
  resolveReportReferenceBounds,
  resolveReportReferenceDisplay,
  resolveNormaReferenceOnly,
};
