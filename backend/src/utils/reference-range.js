/** Parse reference range strings — bounds optional, raw always kept. */
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

const LIMS_ANIMAL_TYPES = new Set(['camel', 'horse', 'sheep', 'goat']);

const hasLimsReferenceRow = (row) => (
  row?.trr_min != null && row?.trr_max != null
);

/** Bounds from LIMS test_reference_ranges (manual admin entry). */
const resolveLimsReferenceBounds = (row) => ({
  min: row?.trr_min != null ? Number(row.trr_min) : null,
  max: row?.trr_max != null ? Number(row.trr_max) : null,
  critical_low: row?.trr_critical_low != null ? Number(row.trr_critical_low) : null,
  critical_high: row?.trr_critical_high != null ? Number(row.trr_critical_high) : null,
});

const formatLimsRangeDisplay = (row) => {
  if (row?.trr_text_reference) return String(row.trr_text_reference).trim();
  if (!hasLimsReferenceRow(row)) return null;
  const note = row?.trr_notes != null ? String(row.trr_notes).trim() : '';
  if (note) return note;
  const fmt = (n) => {
    const num = Number(n);
    if (Number.isNaN(num)) return String(n);
    return Number.isInteger(num) ? String(num) : String(num).replace(/\.?0+$/, '');
  };
  return `${fmt(row.trr_min)}-${fmt(row.trr_max)}`;
};

/** UI/workbench reference — LIMS manual ranges for camel, horse, sheep, goat. */
const resolveLimsReferenceDisplay = (row) => formatLimsRangeDisplay(row);

/** @deprecated Prefer reference-range-engine.service — lazy delegate avoids circular import. */
const resolveReportReferenceBounds = (row) => (
  require('../services/reference-range-engine.service').resolveReportReferenceBounds(row)
);

/** Report reference column — delegated to Reference Range Engine. */
const resolveReportReferenceDisplay = (row) => (
  require('../services/reference-range-engine.service').resolveReportReferenceDisplay(row)
);

module.exports = {
  parseReferenceRange,
  defaultCritical,
  LIMS_ANIMAL_TYPES,
  hasLimsReferenceRow,
  resolveLimsReferenceBounds,
  resolveLimsReferenceDisplay,
  resolveReportReferenceBounds,
  resolveReportReferenceDisplay,
};
