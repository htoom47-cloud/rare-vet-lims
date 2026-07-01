/**
 * API smoke test for results permission routes (production or local).
 * Usage: node src/scripts/verify-permissions-api.js [baseUrl] [username] [password]
 */
require('dotenv').config();

const base = (process.argv[2] || process.env.LIMS_API_URL || 'https://lims.rarevetcare.com/api').replace(/\/$/, '');
const username = process.argv[3] || process.env.ADMIN_USERNAME || 'admin';
const password = process.argv[4] || process.env.ADMIN_INITIAL_PASSWORD;

if (!password) {
  console.error('Set ADMIN_INITIAL_PASSWORD or pass password as 4th argument');
  process.exit(1);
}

const req = async (method, path, { token, body } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
};

const mustInclude = (perms, codes) => codes.filter((c) => !perms.includes(c));

(async () => {
  const login = await req('POST', '/auth/login', { body: { username, password } });
  if (login.status !== 200) {
    console.error('Login failed', login.status, login.json);
    process.exit(1);
  }

  const token = login.json.data.accessToken;
  const perms = login.json.data.user.permissions || [];
  const role = login.json.data.user.role;
  console.log('Logged in as:', username, `(${role})`);
  console.log('Permission count:', perms.length);

  const required = ['results.view', 'results.enter', 'results.edit', 'results.validate', 'results.unvalidate'];
  const missing = mustInclude(perms, required);
  if (role === 'admin') {
    console.log('Admin — all permissions implied');
  } else if (missing.length) {
    console.log('Missing from user token (may be OK for non-admin):', missing.join(', '));
  } else {
    console.log('All results.* permissions present on token');
  }

  const allPerms = await req('GET', '/users/permissions', { token });
  if (allPerms.status === 200) {
    const codes = (allPerms.json.data || []).map((p) => p.code);
    const catalogMissing = mustInclude(codes, ['results.edit', 'results.unvalidate']);
    if (catalogMissing.length) {
      console.error('FAIL — catalog missing:', catalogMissing.join(', '));
      process.exit(1);
    }
    console.log('Catalog OK — results.edit & results.unvalidate registered');
  } else {
    console.log('Users permissions list:', allPerms.status, '(admin only)');
  }

  const fakeId = '00000000-0000-4000-8000-000000000099';
  const unvalidate = await req('POST', `/results/unvalidate/${fakeId}`, { token });
  const enter = await req('POST', '/results/enter', {
    token,
    body: { sample_test_id: fakeId, values: [{ parameter_id: fakeId, value: 'test' }] },
  });

  console.log('Route guards (expect 404/400, not 403 for admin):');
  console.log('  POST /results/unvalidate/:id →', unvalidate.status);
  console.log('  POST /results/enter →', enter.status);

  if (unvalidate.status === 403 || enter.status === 403) {
    console.error('FAIL — admin got 403 on results routes');
    process.exit(1);
  }

  console.log('\nOK — permissions API checks passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
