/**
 * Generate a report PDF via API for a sample code or id.
 * Usage:
 *   node src/scripts/generate-report-api.js P-260622-247804
 *   API_USER=admin API_PASS=secret node src/scripts/generate-report-api.js <sampleIdOrCode>
 */
const BASE = (process.env.APP_URL || 'https://rare-vet-lims.onrender.com').replace(/\/$/, '');
const API = `${BASE}/api`;
const USER = process.env.API_USER || 'admin';
const PASS = process.env.API_PASS || process.env.ADMIN_INITIAL_PASSWORD || 'RareVet2026';

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

async function resolveSampleId(token, arg) {
  if (/^[0-9a-f-]{36}$/i.test(arg)) return arg;
  const scan = await req('GET', `/samples/scan/${encodeURIComponent(arg)}`, { token });
  if (scan.ok && scan.data?.data?.id) return scan.data.data.id;
  throw new Error(scan.data?.error?.message || `Sample not found: ${arg}`);
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: node src/scripts/generate-report-api.js <sampleCodeOrId>');
    process.exit(1);
  }

  console.log(`API: ${BASE}`);
  const login = await req('POST', '/auth/login', { body: { username: USER, password: PASS } });
  if (!login.ok) {
    console.error('Login failed:', login.data?.error?.message || login.status);
    console.error('Set API_USER and API_PASS env vars if credentials differ.');
    process.exit(1);
  }
  const token = login.data.data.accessToken;
  console.log('Logged in as', login.data.data.user?.username);

  const sampleId = await resolveSampleId(token, arg);
  const sample = await req('GET', `/samples/${sampleId}`, { token });
  console.log('Sample:', sample.data?.data?.sample_code, '| status:', sample.data?.data?.status);

  const gen = await req('POST', `/reports/generate/${sampleId}`, {
    token,
    body: {
      language: 'ar',
      treatment_recommendations: '',
      approve_lab: true,
      approve_vet: true,
    },
  });

  if (!gen.ok) {
    console.error('Generate failed:', gen.data?.error?.message || gen.status);
    process.exit(1);
  }

  const report = gen.data.data;
  console.log('Report:', report.report_number);
  console.log('PDF URL:', `${BASE}${report.pdf_url}`);
  console.log('View:', `${BASE}/reports/${report.id}/view`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
