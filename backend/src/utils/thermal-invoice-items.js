/**
 * Thermal receipt lines: count each test/package, never print animal names.
 */

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const catalogLabel = (item = {}) => {
  const desc = String(item.description || item.test_name || item.service_name || '').trim();
  const animal = String(item.name_tag || item.animal_code || '').trim();
  if (animal) {
    const stripped = desc.replace(new RegExp(`^${escapeRegExp(animal)}\\s*[—–-]\\s*`), '').trim();
    if (stripped) return stripped;
  }
  if ((item.package_id || item.test_id) && /\s+[—–-]\s+/.test(desc)) {
    const parts = desc.split(/\s+[—–-]\s+/);
    if (parts.length >= 2) return parts.slice(1).join(' — ').trim() || desc;
  }
  return desc || '-';
};

const groupKey = (item = {}, label) => {
  if (item.package_id) return `pkg:${item.package_id}`;
  if (item.test_id) return `test:${item.test_id}`;
  if (item.service_code) return `svc:${item.service_code}`;
  return `label:${String(label).toLowerCase()}`;
};

const aggregateThermalInvoiceItems = (items = []) => {
  const groups = new Map();
  for (const item of items || []) {
    const description = catalogLabel(item);
    const key = groupKey(item, description);
    const quantity = Number(item.quantity || 1) || 1;
    const total = Number(
      item.total_price != null
        ? item.total_price
        : item.total != null
          ? item.total
          : quantity * Number(item.unit_price || item.price || 0)
    );
    const prev = groups.get(key);
    if (prev) {
      prev.quantity += quantity;
      prev.total_price += total;
    } else {
      groups.set(key, { description, quantity, total_price: total });
    }
  }
  return [...groups.values()].map((row) => ({
    ...row,
    unit_price: row.quantity ? row.total_price / row.quantity : 0,
  }));
};

module.exports = { catalogLabel, aggregateThermalInvoiceItems };
