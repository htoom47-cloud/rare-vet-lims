/** Normalize catalog entry_options for pick-or-type result fields. */

const normalizeEntryOptions = (raw) => {
  if (raw == null || raw === '') return null;
  let list = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      list = JSON.parse(trimmed);
    } catch {
      list = trimmed.split(/[\n,;]+/);
    }
  }
  if (!Array.isArray(list)) return null;
  const cleaned = [...new Set(
    list.map((item) => String(item == null ? '' : item).trim()).filter(Boolean)
  )];
  return cleaned.length ? cleaned : null;
};

module.exports = { normalizeEntryOptions };
