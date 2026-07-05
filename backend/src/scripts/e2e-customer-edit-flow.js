/**
 * E2E: customer create → view profile → update → verify
 * Usage: node src/scripts/e2e-customer-edit-flow.js [baseUrl] [username] [password]
 */
const BASE = (process.argv[2] || process.env.APP_URL || 'https://lims.rarevetcare.com').replace(/\/$/, '');
const USER = process.argv[3] || process.env.E2E_USER || 'admin';
const PASS = process.argv[4] || process.env.E2E_PASS || 'RareVet2026';
const API = `${BASE}/api`;

const errors = [];
const log = (step, ok, detail = '') => {
  const mark = ok ? 'OK' : 'FAIL';
  console.log(`[${mark}] ${step}${detail ? ` — ${detail}` : ''}`);
  if (!ok) errors.push({ step, detail });
};

async function req(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 200) }; }
  return { status: res.status, data, ok: res.ok };
}

async function main() {
  const stamp = Date.now();
  const mobile = `050${String(stamp).slice(-8)}`;
  console.log(`\n=== E2E Customer Edit Flow @ ${BASE} ===\n`);

  const login = await req('POST', '/auth/login', { body: { username: USER, password: PASS } });
  log('1. Login', login.ok, login.data?.error?.message || login.data?.data?.user?.username);
  if (!login.ok) {
    console.log('\nStopped — login failed');
    process.exit(1);
  }
  const token = login.data.data.accessToken;
  const perms = login.data.data.user?.permissions || [];
  log('   Has customers.create', perms.includes('customers.create'));
  log('   Has customers.update', perms.includes('customers.update'));

  const createBody = {
    full_name: `E2E Test ${stamp}`,
    full_name_ar: `اختبار ${stamp}`,
    mobile,
    city: 'المزاحمية',
    farm_company: 'مزرعة تجريبية',
    notes: 'created by e2e',
    credit_limit: 5000,
  };

  const created = await req('POST', '/customers', { token, body: createBody });
  log('2. Create customer', created.ok, created.data?.error?.message || created.data?.data?.id);
  if (!created.ok) process.exit(1);
  const customerId = created.data.data.id;

  const profile1 = await req('GET', `/customers/${customerId}`, { token });
  const p1 = profile1.data?.data;
  log('3. View profile', profile1.ok && p1?.full_name === createBody.full_name);
  log('   Profile has financial_statement', !!p1?.financial_statement);
  log('   Profile invoices array', Array.isArray(p1?.invoices));
  log('   Profile payments array', Array.isArray(p1?.payments));

  const updateBody = {
    ...createBody,
    full_name: `E2E Updated ${stamp}`,
    full_name_ar: `محدّث ${stamp}`,
    city: 'الرياض',
    farm_company: 'شركة محدّثة',
    notes: 'updated by e2e',
    credit_limit: 7500,
  };

  const updated = await req('PUT', `/customers/${customerId}`, { token, body: updateBody });
  log('4. Update customer', updated.ok, updated.data?.error?.message || updated.data?.data?.full_name);

  const profile2 = await req('GET', `/customers/${customerId}`, { token });
  const p2 = profile2.data?.data;
  log('5. Verify name', p2?.full_name === updateBody.full_name, p2?.full_name);
  log('6. Verify Arabic name', p2?.full_name_ar === updateBody.full_name_ar, p2?.full_name_ar);
  log('7. Verify city', p2?.city === 'الرياض', p2?.city);
  log('8. Verify credit limit', parseFloat(p2?.credit_limit) === 7500, String(p2?.credit_limit));

  const list = await req('GET', `/customers?search=${encodeURIComponent(updateBody.full_name)}`, { token });
  const found = (list.data?.data || []).some((c) => c.id === customerId);
  log('9. Customer in search list', found);

  console.log(`\n=== Result: ${errors.length ? 'FAILED' : 'PASSED'} (${errors.length} errors) ===\n`);
  if (errors.length) {
    console.log(errors);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
