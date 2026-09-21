const FIELD_VISIT_RE = /زيارة ميدانية|field visit|سحب العينات|سحب عينات|سحب ميداني/i;
const KM_SUFFIX_RE = /\s*[—–-]\s*\d+([.,]\d+)?\s*(كم|km)(\s+.*)?$/i;

const stripDistanceFromServiceName = (name) =>
  String(name || '').replace(KM_SUFFIX_RE, '').trim();

const classifyService = (row = {}) => {
  const raw = String(row.service_name || row.description || '').trim();
  const name = stripDistanceFromServiceName(raw) || raw || 'General';
  if (!row.test_id && !row.package_id && FIELD_VISIT_RE.test(`${raw} ${name}`)) {
    return { type: 'field_visit', key: 'field_visit', name: name || 'زيارة ميدانية' };
  }
  if (row.test_id) return { type: 'lab_test', key: `test:${row.test_id}`, name };
  if (row.package_id) return { type: 'package', key: `pkg:${row.package_id}`, name };
  return { type: 'other', key: `other:${name.toLowerCase()}`, name };
};

const groupServiceRows = (rows = []) => {
  const map = new Map();
  for (const row of rows) {
    const classified = classifyService(row);
    const cur = map.get(classified.key) || {
      type: classified.type,
      key: classified.key,
      service_name: classified.name,
      revenue: 0,
      quantity: 0,
      line_count: 0,
    };
    cur.revenue += parseFloat(row.revenue || 0);
    cur.quantity += parseFloat(row.quantity || 0);
    cur.line_count += parseInt(row.line_count, 10) || 0;
    map.set(classified.key, cur);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
};

const filterServiceRows = (rows = [], { type = '', key = '' } = {}) => {
  const typeFilter = String(type || '').trim();
  const keyFilter = String(key || '').trim();
  return rows.filter((row) => {
    if (typeFilter && typeFilter !== 'all' && row.type !== typeFilter) return false;
    if (keyFilter && keyFilter !== 'all' && row.key !== keyFilter) return false;
    return true;
  });
};

module.exports = {
  stripDistanceFromServiceName,
  classifyService,
  groupServiceRows,
  filterServiceRows,
};
