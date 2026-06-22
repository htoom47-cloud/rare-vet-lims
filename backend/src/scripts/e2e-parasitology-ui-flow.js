/**
 * Simulates the Parasitology page API flow (queue → open → save → upload).
 * Usage: node src/scripts/e2e-parasitology-ui-flow.js [baseUrl]
 */
const BASE = (process.argv[2] || 'http://localhost:5001').replace(/\/$/, '');
const API = `${BASE}/api`;

const errors = [];
const log = (step, ok, detail = '') => {
  console.log(`[${ok ? 'OK' : 'FAIL'}] ${step}${detail ? ` — ${detail}` : ''}`);
  if (!ok) errors.push({ step, detail });
};

async function req(method, path, { token, body, formData } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload = body;
  if (body && !formData) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${API}${path}`, { method, headers, body: formData || payload });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data, ok: res.ok };
}

async function main() {
  console.log(`\n=== Parasitology UI API flow @ ${BASE} ===\n`);

  const login = await req('POST', '/auth/login', {
    body: { username: 'admin', password: 'RareVet2026' },
  });
  if (!login.ok) throw new Error('Login failed');
  const token = login.data.data.accessToken;

  const queue = await req('GET', '/samples/queue/parasitology', { token });
  log('Load queue', queue.ok, `${(queue.data?.data || []).length} sample(s)`);
  const sample = queue.data?.data?.[0];
  if (!sample) {
    console.log('No sample in queue — run seed-paras-ui-sample.js first');
    process.exit(1);
  }

  const detail = await req('GET', `/samples/${sample.id}`, { token });
  log('Open sample (GET /samples/:id)', detail.ok, detail.data?.data?.sample_code);
  const bloodST = detail.data?.data?.tests?.find((t) => t.test_code === 'PARAS-BLOOD');
  const stoolST = detail.data?.data?.tests?.find((t) => t.test_code === 'PARAS-STOOL');
  log('Blood sample_test present', !!bloodST);
  log('Stool sample_test present', !!stoolST);

  const bloodTest = await req('GET', `/tests/${bloodST.test_id}`, { token });
  const qualParam = (bloodTest.data?.data?.parameters || []).find((p) => p.unit === 'qual' && p.code !== 'NOTES');
  log('Qual parasite param available', !!qualParam, qualParam?.name);

  const enter = await req('POST', '/results/enter', {
    token,
    body: {
      sample_test_id: bloodST.id,
      values: [{ parameter_id: qualParam.id, value: 'Positive' }],
    },
  });
  log('Save finding (enter results)', enter.ok, enter.data?.error?.message);

  const png1x1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  const form = new FormData();
  form.append('image', new Blob([png1x1], { type: 'image/png' }), 'scope.png');
  form.append('parameter_id', qualParam.id);
  const upload = await req('POST', `/results/sample-test/${bloodST.id}/attachments`, { token, formData: form });
  const att = (upload.data?.data?.attachments || []).find((a) => a.parameter_id === qualParam.id);
  log('Upload image per finding', upload.ok && !!att);

  const reload = await req('GET', `/results/sample-test/${bloodST.id}`, { token });
  const val = reload.data?.data?.values?.find((v) => v.parameter_id === qualParam.id);
  log('Reload shows Positive value', val?.value === 'Positive');
  log('Reload shows POS flag', val?.flag === 'POS');
  log('Reload shows attachment', (reload.data?.data?.attachments || []).some((a) => a.parameter_id === qualParam.id));

  if (errors.length) {
    console.log(`\nFAILED: ${errors.length} step(s)`);
    process.exit(1);
  }
  console.log('\nUI API flow passed.');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
