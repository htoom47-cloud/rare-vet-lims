/** Parse reference range strings from Norma HL7/ASTM (e.g. "4.0-15.0", "4 - 15", "4,0-15,0"). */
const parseReferenceRange = (raw) => {
  if (raw == null || raw === '') return null;
  let s = String(raw).trim();
  s = s.replace(/^[([{<]+/, '').replace(/[)\]}>]+$/, '');
  s = s.replace(/,/g, '.');
  const m = s.match(/([\d.]+)\s*[-–—~]\s*([\d.]+)/);
  if (!m) return null;
  const min = parseFloat(m[1]);
  const max = parseFloat(m[2]);
  if (Number.isNaN(min) || Number.isNaN(max)) return null;
  return { min: Math.min(min, max), max: Math.max(min, max) };
};

const defaultCritical = (min, max) => {
  if (min == null || max == null) return { crit_low: null, crit_high: null };
  const span = max - min || Math.abs(max) || 1;
  return {
    crit_low: Math.round((min - span * 0.5) * 1000) / 1000,
    crit_high: Math.round((max + span * 0.5) * 1000) / 1000,
  };
};

module.exports = { parseReferenceRange, defaultCritical };
