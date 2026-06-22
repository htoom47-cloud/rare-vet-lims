/**
 * Creates a sample with parasitology tests in "received" status for UI testing.
 * Usage: node src/scripts/seed-paras-ui-sample.js [baseUrl]
 */
require('dotenv').config();

const BASE = (process.argv[2] || 'http://localhost:5001').replace(/\/$/, '');
const API = `${BASE}/api`;

async function req(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { ok: res.ok, data };
}

async function main() {
  const login = await req('POST', '/auth/login', {
    body: { username: 'admin', password: 'RareVet2026' },
  });
  if (!login.ok) throw new Error(login.data?.error?.message || 'Login failed');
  const token = login.data.data.accessToken;

  const testsRes = await req('GET', '/tests?limit=100', { token });
  const blood = testsRes.data.data.find((t) => t.code === 'PARAS-BLOOD');
  const stool = testsRes.data.data.find((t) => t.code === 'PARAS-STOOL');
  if (!blood || !stool) throw new Error('Parasitology tests missing — run ensure-parasitology.js');

  const ts = Date.now();
  const customer = await req('POST', '/customers', {
    token,
    body: {
      full_name: `UI Paras ${ts}`,
      full_name_ar: `عينة واجهة ${ts}`,
      mobile: `05${String(ts).slice(-8)}`,
      customer_type: 'individual',
    },
  });
  const animal = await req('POST', '/animals', {
    token,
    body: {
      owner_id: customer.data.data.id,
      animal_code: `UI-P-${ts}`,
      animal_type: 'horse',
      name_tag: 'UI Test',
      gender: 'female',
    },
  });
  const sample = await req('POST', '/samples', {
    token,
    body: {
      customer_id: customer.data.data.id,
      animal_id: animal.data.data.id,
      priority: 'normal',
      test_ids: [blood.id, stool.id],
    },
  });
  await req('PATCH', `/samples/${sample.data.data.id}/status`, {
    token,
    body: { status: 'received' },
  });

  const queue = await req('GET', '/samples/queue/parasitology', { token });
  const inQueue = (queue.data?.data || []).some((s) => s.id === sample.data.data.id);

  console.log('Sample ready for Parasitology UI:');
  console.log(`  Code: ${sample.data.data.sample_code}`);
  console.log(`  ID:   ${sample.data.data.id}`);
  console.log(`  In parasitology queue: ${inQueue ? 'yes' : 'no'}`);
  console.log(`  Open: ${BASE.replace('5001', '5173')}/parasitology`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
