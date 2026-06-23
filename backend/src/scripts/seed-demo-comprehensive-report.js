/**
 * Creates a comprehensive demo sample with all tests, 2 parasite images, and a final report.
 * Usage: node src/scripts/seed-demo-comprehensive-report.js [baseUrl]
 */
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'https://rare-vet-lims.onrender.com').replace(/\/$/, '');
const API = `${BASE}/api`;
const USER = process.env.API_USER || 'admin';
const PASS = process.env.API_PASS || 'Htoome449944@';

const DEMO_IMAGE = path.join(__dirname, '../../assets/logo.png');
const DEMO_IMAGE_2 = path.join(__dirname, '../../uploads/microscope/f74588e6-5629-43b9-b5e6-271413f921ae.png');

async function req(method, urlPath, { token, body, formData } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload = body;
  if (body && !formData) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${API}${urlPath}`, { method, headers, body: formData || payload });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 400) }; }
  return { status: res.status, data, ok: res.ok };
}

const sampleValue = (param) => {
  if (param.unit === 'qual') return 'Negative';
  if (param.code === 'NOTES') return 'Demo note';
  const n = Number(param.min_value ?? param.max_value);
  if (!Number.isNaN(n) && n > 0) return String(Math.round(n * 1.05 * 100) / 100);
  return '10';
};

async function main() {
  console.log(`\n=== Comprehensive demo report @ ${BASE} ===\n`);

  const login = await req('POST', '/auth/login', { body: { username: USER, password: PASS } });
  if (!login.ok) throw new Error(login.data?.error?.message || 'Login failed');
  const token = login.data.data.accessToken;
  console.log('Logged in as', USER);

  const testsRes = await req('GET', '/tests?limit=200&active=true', { token });
  const tests = testsRes.data?.data || [];
  if (!tests.length) throw new Error('No tests found');
  console.log(`Tests to order: ${tests.length}`);

  const ts = Date.now();
  const customer = await req('POST', '/customers', {
    token,
    body: {
      full_name: `Demo Comprehensive ${ts}`,
      full_name_ar: `تقرير تجريبي شامل ${ts}`,
      mobile: `05${String(ts).slice(-8)}`,
      customer_type: 'individual',
    },
  });
  if (!customer.ok) throw new Error(customer.data?.error?.message || JSON.stringify(customer.data));

  const animal = await req('POST', '/animals', {
    token,
    body: {
      owner_id: customer.data.data.id,
      animal_code: `DEMO-${ts}`,
      animal_type: 'horse',
      name_tag: 'Demo Horse',
      gender: 'male',
    },
  });
  if (!animal.ok) throw new Error(animal.data?.error?.message || JSON.stringify(animal.data));

  const sample = await req('POST', '/samples', {
    token,
    body: {
      customer_id: customer.data.data.id,
      animal_id: animal.data.data.id,
      priority: 'normal',
      test_ids: tests.map((t) => t.id),
    },
  });
  if (!sample.ok) throw new Error(sample.data?.error?.message || 'Sample failed');

  const sampleId = sample.data.data.id;
  const sampleCode = sample.data.data.sample_code;
  console.log('Sample:', sampleCode);

  await req('PATCH', `/samples/${sampleId}/status`, { token, body: { status: 'received' } });

  const detail = await req('GET', `/samples/${sampleId}`, { token });
  const sampleTests = detail.data?.data?.tests || [];
  console.log('Sample tests:', sampleTests.length);

  const bloodST = sampleTests.find((t) => t.test_code === 'PARAS-BLOOD');
  const stoolST = sampleTests.find((t) => t.test_code === 'PARAS-STOOL');

  const img1 = fs.existsSync(DEMO_IMAGE) ? fs.readFileSync(DEMO_IMAGE) : null;
  const img2 = fs.existsSync(DEMO_IMAGE_2) ? fs.readFileSync(DEMO_IMAGE_2) : img1;
  if (!img1) throw new Error('Demo image not found');

  const uploadImage = async (sampleTestId, buffer, name) => {
    const form = new FormData();
    form.append('image', new Blob([buffer], { type: 'image/png' }), name);
    const up = await req('POST', `/results/sample-test/${sampleTestId}/attachments`, { token, formData: form });
    if (!up.ok) throw new Error(up.data?.error?.message || `Upload failed: ${name}`);
    return up.data?.data?.attachments?.length || 0;
  };

  if (bloodST) {
    const n1 = await uploadImage(bloodST.id, img1, 'paras-blood-1.png');
    const n2 = await uploadImage(bloodST.id, img2, 'paras-blood-2.png');
    console.log(`Paras blood images uploaded: ${n2} total on test`);
  }

  const approveItems = [];

  for (const st of sampleTests) {
    const testMeta = tests.find((t) => t.id === st.test_id || t.code === st.test_code);
    const testDetail = await req('GET', `/tests/${testMeta?.id || st.test_id}`, { token });
    const params = testDetail.data?.data?.parameters || [];
    if (!params.length) {
      console.log(`  skip ${st.test_code} — no parameters`);
      continue;
    }

    let values = params
      .filter((p) => p.unit !== 'qual' || p.code !== 'NOTES')
      .map((p) => ({ parameter_id: p.id, value: sampleValue(p) }));

    if (st.test_code === 'PARAS-BLOOD') {
      const qual = params.find((p) => p.unit === 'qual' && p.code !== 'NOTES');
      if (qual) values = [{ parameter_id: qual.id, value: 'Positive' }];
    }
    if (st.test_code === 'PARAS-STOOL') {
      const qual = params.find((p) => p.unit === 'qual' && p.code !== 'NOTES');
      if (qual) values = [{ parameter_id: qual.id, value: 'Negative' }];
    }

    if (!values.length) continue;

    const enter = await req('POST', '/results/enter', {
      token,
      body: { sample_test_id: st.id, values },
    });
    if (!enter.ok) {
      console.warn(`  enter failed ${st.test_code}:`, enter.data?.error?.message);
      continue;
    }
    approveItems.push({ sample_test_id: st.id, values });
    console.log(`  results entered: ${st.test_code}`);
  }

  const approve = await req('POST', '/results/approve-batch', {
    token,
    body: { items: approveItems },
  });
  if (!approve.ok) throw new Error(approve.data?.error?.message || 'Approve batch failed');
  console.log('Approved tests:', approveItems.length);

  const after = await req('GET', `/samples/${sampleId}`, { token });
  console.log('Sample status:', after.data?.data?.status);

  const report = await req('POST', `/reports/generate/${sampleId}`, {
    token,
    body: {
      language: 'ar',
      approve_lab: true,
      approve_vet: true,
      treatment_recommendations: 'توصيات علاجية تجريبية — متابعة دورية.',
    },
  });
  if (!report.ok) throw new Error(report.data?.error?.message || 'Report generation failed');

  const r = report.data.data;
  console.log('\n=== DONE ===');
  console.log('Sample:   ', sampleCode);
  console.log('Report:   ', r.report_number);
  console.log('PDF:      ', `${BASE}${r.pdf_url}`);
  console.log('View:     ', `${BASE}/reports/${r.id}/view`);
  console.log('Tests:    ', sampleTests.length);
  console.log('Paras imgs: 2 on blood parasites');
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
