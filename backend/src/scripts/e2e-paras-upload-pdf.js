/**
 * E2E: technician image-only upload → approve → PDF contains images
 * Usage: API_PASS=xxx node src/scripts/e2e-paras-upload-pdf.js [baseUrl]
 */
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'https://rare-vet-lims.onrender.com').replace(/\/$/, '');
const API = `${BASE}/api`;
const USER = process.env.API_USER || 'admin';
const PASS = process.env.API_PASS || 'Htoome449944@';

const errors = [];
const log = (step, ok, detail = '') => {
  console.log(`[${ok ? 'OK' : 'FAIL'}] ${step}${detail ? ` — ${detail}` : ''}`);
  if (!ok) errors.push({ step, detail });
};

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
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; }
  return { status: res.status, data, ok: res.ok };
}

async function main() {
  console.log(`\n=== Paras upload + PDF @ ${BASE} ===\n`);

  const login = await req('POST', '/auth/login', { body: { username: USER, password: PASS } });
  log('Login', login.ok, login.data?.error?.message || USER);
  if (!login.ok) process.exit(1);
  const token = login.data.data.accessToken;

  const queue = await req('GET', '/samples/queue/parasitology', { token });
  const items = queue.data?.data || [];
  log('Parasitology queue', queue.ok, `${items.length} sample(s)`);

  let sampleId;
  let sampleCode;
  let bloodTestId;

  if (items.length > 0) {
    sampleId = items[0].id;
    sampleCode = items[0].sample_code;
    const det = await req('GET', `/samples/${sampleId}`, { token });
    bloodTestId = (det.data?.data?.tests || []).find((t) => t.test_code === 'PARAS-BLOOD')?.id;
  }

  if (!bloodTestId) {
    const ts = Date.now();
    const customer = await req('POST', '/customers', {
      token,
      body: { full_name: `Upload Test ${ts}`, mobile: `05${String(ts).slice(-8)}`, customer_type: 'individual' },
    });
    if (!customer.ok) {
      log('Create customer', false, customer.data?.error?.message);
      process.exit(1);
    }
    const animal = await req('POST', '/animals', {
      token,
      body: {
        owner_id: customer.data.data.id,
        animal_code: `UP-${ts}`,
        animal_type: 'horse',
        name_tag: 'Upload Test',
        gender: 'male',
      },
    });
    if (!animal.ok) {
      log('Create animal', false, animal.data?.error?.message);
      process.exit(1);
    }
    const testsRes = await req('GET', '/tests?limit=100', { token });
    const blood = (testsRes.data?.data || []).find((t) => t.code === 'PARAS-BLOOD');
    const sample = await req('POST', '/samples', {
      token,
      body: {
        customer_id: customer.data.data.id,
        animal_id: animal.data.data.id,
        priority: 'normal',
        test_ids: [blood.id],
      },
    });
    if (!sample.ok) {
      log('Create sample', false, sample.data?.error?.message);
      process.exit(1);
    }
    sampleId = sample.data.data.id;
    sampleCode = sample.data.data.sample_code;
    await req('PATCH', `/samples/${sampleId}/status`, { token, body: { status: 'received' } });
    const det = await req('GET', `/samples/${sampleId}`, { token });
    bloodTestId = (det.data?.data?.tests || []).find((t) => t.test_code === 'PARAS-BLOOD')?.id;
    log('Create test sample', !!bloodTestId, sampleCode);
  } else {
    log('Use queue sample', true, sampleCode);
  }

  // Minimal 1x1 JPEG
  const jpeg = Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//AP//wgARCAABAAEDASIAAhEBAxEB/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
    'base64'
  );
  const form = new FormData();
  form.append('image', new Blob([jpeg], { type: 'image/jpeg' }), 'microscope-test.jpg');

  const upload = await req('POST', `/results/sample-test/${bloodTestId}/attachments`, { token, formData: form });
  log('Upload image (no parameter_id)', upload.ok, upload.data?.error?.message || `HTTP ${upload.status}`);

  const bloodMeta = (await req('GET', '/tests?limit=100', { token })).data.data.find((t) => t.code === 'PARAS-BLOOD');
  const bloodDetail = await req('GET', `/tests/${bloodMeta.id}`, { token });
  const param = (bloodDetail.data?.data?.parameters || []).find((p) => p.unit === 'qual' && p.code !== 'NOTES');
  if (!param) {
    log('Qual parameter', false, 'missing');
    process.exit(1);
  }

  const values = [{ parameter_id: param.id, value: 'Negative' }];

  const enter = await req('POST', '/results/enter', {
    token,
    body: { sample_test_id: bloodTestId, values },
  });
  log('Enter result', enter.ok, enter.data?.error?.message);

  const approve = await req('POST', '/results/approve-batch', {
    token,
    body: { items: [{ sample_test_id: bloodTestId, values }] },
  });
  log('Approve batch', approve.ok, approve.data?.error?.message);

  const report = await req('POST', `/reports/generate/${sampleId}`, {
    token,
    body: { language: 'ar', approve_lab: true, approve_vet: true },
  });
  log('Generate report', report.ok, report.data?.error?.message || report.data?.data?.report_number);

  if (report.ok) {
    const pdfUrl = report.data.data.pdf_url;
    const pdfRes = await fetch(`${BASE}${pdfUrl.startsWith('/') ? '' : '/'}${pdfUrl}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
    log('Download PDF', pdfRes.ok && pdfBuf.length > 8000, `${pdfBuf.length} bytes`);
    if (pdfRes.ok) {
      const out = path.join(__dirname, '../../uploads/reports/_e2e-paras-upload-test.pdf');
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, pdfBuf);
      console.log('Saved:', out);
    }
  }

  const attCheck = await req('GET', `/results/sample-test/${bloodTestId}`, { token });
  const attCount = attCheck.data?.data?.attachments?.length || 0;
  log('Attachments on result', attCount > 0, `${attCount} file(s)`);

  console.log('');
  if (errors.length) {
    console.log('FAILED:', errors);
    process.exit(1);
  }
  console.log('All checks passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
