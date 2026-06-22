/**
 * End-to-end parasitology workflow test against running API.
 * Usage: node src/scripts/e2e-parasitology-workflow.js [baseUrl]
 */
const BASE = (process.argv[2] || process.env.APP_URL || 'https://rare-vet-lims.onrender.com').replace(/\/$/, '');
const API = `${BASE}/api`;

const errors = [];
const log = (step, ok, detail = '') => {
  const mark = ok ? 'OK' : 'FAIL';
  console.log(`[${mark}] ${step}${detail ? ` — ${detail}` : ''}`);
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
  console.log(`\n=== E2E Parasitology Workflow @ ${BASE} ===\n`);

  // 1. Login
  const login = await req('POST', '/auth/login', {
    body: { username: 'admin', password: 'RareVet2026' },
  });
  log('Login', login.ok, login.data?.error?.message || login.data?.data?.user?.username);
  if (!login.ok) {
    console.log('\nErrors:', errors);
    process.exit(1);
  }
  const token = login.data.data.accessToken;

  // 2. List tests — find parasitology
  const testsRes = await req('GET', '/tests?limit=100', { token });
  const tests = testsRes.data?.data || [];
  const blood = tests.find((t) => t.code === 'PARAS-BLOOD');
  const stool = tests.find((t) => t.code === 'PARAS-STOOL');
  log('PARAS-BLOOD test exists', !!blood, blood ? `category: ${blood.category_code}` : 'missing');
  log('PARAS-STOOL test exists', !!stool, stool ? `category: ${stool.category_code}` : 'missing');
  log('Paras tests under MICRO', blood?.category_code === 'MICRO' && stool?.category_code === 'MICRO');

  if (!blood || !stool) {
    console.log('\nErrors:', errors);
    process.exit(1);
  }

  // 3. Get parameters
  const bloodDetail = await req('GET', `/tests/${blood.id}`, { token });
  const qualParams = (bloodDetail.data?.data?.parameters || []).filter((p) => p.unit === 'qual' && p.code !== 'NOTES');
  log('Blood qual parameters', qualParams.length > 0, `${qualParams.length} types`);

  // 4. Create customer + animal
  const ts = Date.now();
  const customer = await req('POST', '/customers', {
    token,
    body: {
      full_name: `E2E Customer ${ts}`,
      full_name_ar: `عميل تجريبي ${ts}`,
      mobile: `05${String(ts).slice(-8)}`,
      customer_type: 'individual',
    },
  });
  log('Create customer', customer.ok, customer.data?.error?.message);
  const customerId = customer.data?.data?.id;

  const animal = await req('POST', '/animals', {
    token,
    body: {
      owner_id: customerId,
      animal_code: `E2E-${ts}`,
      animal_type: 'camel',
      name_tag: 'E2E Camel',
      gender: 'male',
    },
  });
  log('Create animal', animal.ok, animal.data?.error?.message);
  const animalId = animal.data?.data?.id;

  // 5. Create sample with parasitology tests
  const sample = await req('POST', '/samples', {
    token,
    body: {
      customer_id: customerId,
      animal_id: animalId,
      priority: 'normal',
      test_ids: [blood.id, stool.id],
    },
  });
  log('Create sample with paras tests', sample.ok, sample.data?.error?.message);
  const sampleId = sample.data?.data?.id;
  const sampleCode = sample.data?.data?.sample_code;

  // 6. Deliver to lab
  const delivered = await req('PATCH', `/samples/${sampleId}/status`, {
    token,
    body: { status: 'received' },
  });
  log('Deliver sample to lab', delivered.ok, delivered.data?.error?.message);

  // 7. Parasitology queue
  const queue = await req('GET', '/samples/queue/parasitology', { token });
  const queueItems = queue.data?.data || [];
  const inQueue = queueItems.some((s) => s.id === sampleId);
  log('Parasitology queue API', queue.ok, `HTTP ${queue.status}, ${queueItems.length} item(s)`);
  log('Sample in parasitology queue', inQueue, inQueue ? sampleCode : `${sampleCode} (status: ${delivered.data?.data?.status || '?'})`);

  // 8. Get sample tests
  const sampleDetail = await req('GET', `/samples/${sampleId}`, { token });
  const sampleTests = sampleDetail.data?.data?.tests || [];
  const bloodST = sampleTests.find((t) => t.test_code === 'PARAS-BLOOD');
  const stoolST = sampleTests.find((t) => t.test_code === 'PARAS-STOOL');
  log('Sample has blood test', !!bloodST);
  log('Sample has stool test', !!stoolST);

  // 9. Enter blood result
  const paramId = qualParams[0]?.id;
  const enterBlood = await req('POST', '/results/enter', {
    token,
    body: {
      sample_test_id: bloodST.id,
      values: [{ parameter_id: paramId, value: 'Positive' }],
    },
  });
  log('Enter blood parasite result', enterBlood.ok, enterBlood.data?.error?.message);

  // 9b. Upload microscope image for blood finding
  const png1x1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  const form = new FormData();
  form.append('image', new Blob([png1x1], { type: 'image/png' }), 'microscope.png');
  form.append('parameter_id', paramId);
  const upload = await req('POST', `/results/sample-test/${bloodST.id}/attachments`, {
    token,
    formData: form,
  });
  const hasAttachment = (upload.data?.data?.attachments || []).some((a) => a.parameter_id === paramId);
  log('Upload microscope image', upload.ok && hasAttachment, upload.data?.error?.message || `${upload.data?.data?.attachments?.length || 0} attachment(s)`);

  // 10. Enter stool result
  const stoolDetail = await req('GET', `/tests/${stool.id}`, { token });
  const stoolParam = (stoolDetail.data?.data?.parameters || []).find((p) => p.unit === 'qual' && p.code !== 'NOTES');
  const enterStool = await req('POST', '/results/enter', {
    token,
    body: {
      sample_test_id: stoolST.id,
      values: [{ parameter_id: stoolParam.id, value: 'Negative' }],
    },
  });
  log('Enter stool parasite result', enterStool.ok, enterStool.data?.error?.message);

  // 11. Validate results
  const validateBlood = await req('POST', `/results/validate/${bloodST.id}`, {
    token,
    body: { doctor_notes: 'E2E validated blood' },
  });
  log('Validate blood results', validateBlood.ok, validateBlood.data?.error?.message);

  const validateStool = await req('POST', `/results/validate/${stoolST.id}`, {
    token,
    body: { doctor_notes: 'E2E validated stool' },
  });
  log('Validate stool results', validateStool.ok, validateStool.data?.error?.message);

  // 12. Sample completed?
  const afterSample = await req('GET', `/samples/${sampleId}`, { token });
  log('Sample status completed', afterSample.data?.data?.status === 'completed', afterSample.data?.data?.status);

  // 13. Generate report
  const report = await req('POST', `/reports/generate/${sampleId}`, {
    token,
    body: { language: 'ar' },
  });
  log('Generate report', report.ok, report.data?.error?.message || report.data?.data?.report_number);

  // 14. Re-fetch results with attachments check
  const bloodResults = await req('GET', `/results/sample-test/${bloodST.id}`, { token });
  const hasPosFlag = bloodResults.data?.data?.values?.some((v) => v.flag === 'POS');
  const hasNegFlag = (await req('GET', `/results/sample-test/${stoolST.id}`, { token })).data?.data?.values?.some((v) => v.flag === 'NEG');
  const hasImage = (bloodResults.data?.data?.attachments || []).some((a) => a.parameter_id === paramId);
  log('POS flag on positive result', hasPosFlag);
  log('NEG flag on negative result', hasNegFlag);
  log('Microscope image on report data', hasImage);

  console.log('\n=== Summary ===');
  if (errors.length) {
    console.log(`FAILED: ${errors.length} step(s)`);
    errors.forEach((e) => console.log(`  - ${e.step}: ${e.detail}`));
    process.exit(1);
  }
  console.log('All steps passed.');
  console.log(`Sample: ${sampleCode} | Report: ${report.data?.data?.report_number || 'n/a'}`);
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
