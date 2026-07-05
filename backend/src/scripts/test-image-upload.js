/**
 * Test microscope image upload against running API.
 * Usage: API_PASS=... node src/scripts/test-image-upload.js [baseUrl]
 */
const BASE = (process.argv[2] || 'https://rare-vet-lims.onrender.com').replace(/\/$/, '');
const API = `${BASE}/api`;
const USER = process.env.API_USER || 'admin';
const PASS = process.env.API_PASS || 'Htoome449944@';

async function req(method, path, { token, body, formData } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload = formData;
  if (body && !formData) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: payload,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 600) }; }
  return { status: res.status, data, ok: res.ok };
}

async function main() {
  const login = await req('POST', '/auth/login', { body: { username: USER, password: PASS } });
  if (!login.ok) {
    console.error('Login failed:', login.data?.error?.message);
    process.exit(1);
  }
  const token = login.data.data.accessToken;

  const q = await req('GET', '/samples/queue/parasitology', { token });
  let sampleTestId;
  let paramId;

  if (q.data?.data?.[0]) {
    const sample = q.data.data[0];
    const det = await req('GET', `/samples/${sample.id}`, { token });
    const st = (det.data?.data?.tests || []).find((t) => t.test_code?.startsWith('PARAS'));
    sampleTestId = st?.id;
    const td = await req('GET', `/tests/${st.test_id}`, { token });
    paramId = (td.data?.data?.parameters || []).find((p) => p.unit === 'qual' && p.code !== 'NOTES')?.id;
    console.log('Queue sample:', sample.sample_code, 'test:', st?.test_code);
  }

  if (!sampleTestId) {
    const completed = await req('GET', '/samples?limit=5&search=260622', { token });
    const rows = completed.data?.data || [];
    for (const row of rows) {
      const det = await req('GET', `/samples/${row.id}`, { token });
      const st = (det.data?.data?.tests || []).find((t) => t.test_code?.startsWith('PARAS'));
      if (st) {
        sampleTestId = st.id;
        const td = await req('GET', `/tests/${st.test_id}`, { token });
        paramId = (td.data?.data?.parameters || []).find((p) => p.unit === 'qual' && p.code !== 'NOTES')?.id;
        console.log('Completed sample:', row.sample_code, 'status:', st.status);
        break;
      }
    }
  }

  if (!sampleTestId) {
    console.error('No parasitology sample_test found');
    process.exit(1);
  }

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  const form = new FormData();
  form.append('parameter_id', paramId);
  form.append('image', new Blob([png], { type: 'image/png' }), 'test.png');

  const up = await fetch(`${API}/results/sample-test/${sampleTestId}/attachments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const upText = await up.text();
  console.log('Upload status:', up.status);
  console.log(upText.slice(0, 1000));

  // Test octet-stream without extension (mobile edge case)
  const form2 = new FormData();
  form2.append('parameter_id', paramId);
  form2.append('image', new Blob([png], { type: 'application/octet-stream' }), 'capture');

  const up2 = await fetch(`${API}/results/sample-test/${sampleTestId}/attachments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form2,
  });
  const up2Text = await up2.text();
  console.log('\nOctet-stream no ext:', up2.status);
  console.log(up2Text.slice(0, 400));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
