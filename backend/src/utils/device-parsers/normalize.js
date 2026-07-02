/** Normalize device result flag to LOW / HIGH / NORMAL. */
const normalizeResultFlag = (flag) => {
  const f = String(flag || '').trim().toUpperCase();
  if (!f) return 'NORMAL';
  if (['H', 'HIGH', 'HI', 'HH'].includes(f)) return 'HIGH';
  if (['L', 'LOW', 'LO', 'LL'].includes(f)) return 'LOW';
  if (['N', 'NORMAL', 'NR'].includes(f)) return 'NORMAL';
  return f;
};

/** Parse HL7/ASTM timestamp field to ISO string when possible. */
const parseDeviceTimestamp = (raw) => {
  const s = String(raw || '').trim();
  if (!s || s.length < 8) return null;
  const digits = s.replace(/\D/g, '');
  if (digits.length < 8) return null;
  const y = digits.slice(0, 4);
  const mo = digits.slice(4, 6);
  const d = digits.slice(6, 8);
  const h = digits.slice(8, 10) || '00';
  const mi = digits.slice(10, 12) || '00';
  const se = digits.slice(12, 14) || '00';
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${se}Z`;
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
};

module.exports = { normalizeResultFlag, parseDeviceTimestamp };
