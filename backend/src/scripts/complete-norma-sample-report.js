/**
 * Validate, generate report, and audit Norma sample references on production.
 * Usage: API_PASS=... node src/scripts/complete-norma-sample-report.js SMP-260702-968431
 */
const API = (process.env.LIMS_API_URL || 'https://lims.rarevetcare.com/api').replace(/\/$/, '');
const BASE = API.replace(/\/api$/, '');
const USER = process.env.API_USER || 'admin';
const PASS = process.env.API_PASS || process.argv[3];

async function req(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${API}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 500) }; }
  return { status: res.status, data, ok: res.ok };
}

async function main() {
  const sampleCode = process.argv[2] || 'SMP-260702-968431';
  if (!PASS) {
    console.error('Set API_PASS env var');
    process.exit(1);
  }

  const login = await req('POST', '/auth/login', { body: { username: USER, password: PASS } });
  if (!login.ok) {
    console.error('Login failed:', login.data?.error?.message);
    process.exit(1);
  }
  const token = login.data.data.accessToken;

  const scan = await req('GET', `/samples/scan/${encodeURIComponent(sampleCode)}`, { token });
  if (!scan.ok) throw new Error(scan.data?.error?.message || 'Sample not found');
  const sample = scan.data.data;
  const cbcTest = (sample.tests || []).find((t) => t.test_code === 'CBC-FULL' || t.has_results);
  if (!cbcTest) throw new Error('No CBC test on sample');

  const val = await req('POST', `/results/validate/${cbcTest.id}`, {
    token,
    body: { doctor_notes: '' },
  });
  console.log('Validated:', val.ok, val.data?.data?.is_validated);

  const gen = await req('POST', `/reports/generate/${sample.id}`, {
    token,
    body: { language: 'ar', approve_lab: true, approve_vet: true },
  });
  if (!gen.ok) throw new Error(gen.data?.error?.message || 'Report generate failed');
  const report = gen.data.data;
  console.log('Report:', report.report_number, report.id);
  console.log('View:', `${BASE}/reports/${report.id}/view`);

  const dbg = await req('GET', `/devices/ref-debug/sample/${sample.id}`, { token });
  const params = dbg.data?.data?.parameters || [];
  const keys = ['WBC', 'LYM_PCT', 'MON_PCT', 'NEU_PCT', 'EOS_PCT', 'BAS_PCT', 'RBC'];
  let mismatches = 0;
  for (const code of keys) {
    const p = params.find((x) => x.parameterCode === code);
    if (!p) continue;
    const ok = !p.mismatch;
    if (!ok) mismatches += 1;
    console.log(`${ok ? '✓' : '✗'} ${code} OBX-7=${p.rawObx7} report=${p.reportReference}`);
  }
  console.log('Audit mismatches (key params):', mismatches);
  if (dbg.data?.data?.mismatchCount > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
