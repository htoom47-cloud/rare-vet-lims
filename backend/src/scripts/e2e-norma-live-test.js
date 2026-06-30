/**
 * End-to-end Norma → bridge → LIMS test.
 * 1) Creates a sample with CBC on the cloud API
 * 2) Sends HL7 (MLLP) to the local bridge
 * 3) Verifies results appear in LIMS
 *
 * Usage:
 *   node src/scripts/e2e-norma-live-test.js [apiBaseUrl] [bridgeHost] [bridgePort]
 *
 * Example:
 *   node src/scripts/e2e-norma-live-test.js https://rare-vet-lims.onrender.com
 */
const net = require('net');

const API_BASE = (process.argv[2] || 'https://rare-vet-lims.onrender.com').replace(/\/$/, '');
const BRIDGE_HOST = process.argv[3] || '127.0.0.1';
const BRIDGE_PORT = Number(process.argv[4] || 21110);
const API = `${API_BASE}/api`;
const PASS = process.env.E2E_PASS || process.env.ADMIN_INITIAL_PASSWORD || 'RareVet2026';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
}

function buildHl7(sampleCode) {
  const ts = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const rows = [
    ['WBC', '8.5'], ['RBC', '7.2'], ['HGB', '11.8'], ['HCT', '32.5'], ['PLT', '210'],
    ['NEU', '4.1'], ['LYM', '3.2'], ['MON', '0.6'],
  ];
  const obx = rows.map(([code, val], i) =>
    `OBX|${i + 1}|NM|${code}^^^||${val}|10*3/uL|N|||F`
  ).join('\r');
  return [
    `MSH|^~\\&|Norma|CBC|LIMS|Lab|${ts}||ORU^R01^ORU_R01|NORMA-E2E-${Date.now()}|P|2.3`,
    `PID|1||${sampleCode}^^^||TEST^ANIMAL`,
    `OBR|1||${sampleCode}||CBC^Complete Blood Count`,
    obx,
  ].join('\r');
}

function sendHl7ToBridge(hl7) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(`\x0b${hl7}\r\x1c\r`, 'utf8');
    const socket = net.createConnection({ host: BRIDGE_HOST, port: BRIDGE_PORT }, () => {
      socket.write(payload);
    });
    let ack = '';
    socket.setTimeout(8000);
    socket.on('data', (chunk) => { ack += chunk.toString('utf8'); });
    socket.on('timeout', () => { socket.destroy(); reject(new Error('Bridge timeout')); });
    socket.on('error', reject);
    socket.on('close', () => resolve(ack));
  });
}

async function main() {
  console.log(`\n=== Norma live E2E @ ${API_BASE} → bridge ${BRIDGE_HOST}:${BRIDGE_PORT} ===\n`);

  const login = await req('POST', '/auth/login', { body: { username: 'admin', password: PASS } });
  if (!login.ok) {
    throw new Error(`Login failed (${login.status}): ${login.data?.error?.message || 'check password'}`);
  }
  const token = login.data.data.accessToken;
  console.log('[OK] Logged in');

  const testsRes = await req('GET', '/tests?limit=100', { token });
  const cbc = (testsRes.data?.data || []).find((t) => t.code === 'CBC-FULL');
  if (!cbc) throw new Error('CBC-FULL test not found');
  console.log('[OK] Found CBC-FULL test');

  const ts = Date.now();
  const customer = await req('POST', '/customers', {
    token,
    body: {
      full_name: `Norma E2E ${ts}`,
      full_name_ar: `اختبار نورما ${ts}`,
      mobile: `05${String(ts).slice(-8)}`,
      customer_type: 'individual',
    },
  });
  if (!customer.ok) throw new Error(`Customer create failed: ${customer.data?.error?.message}`);

  const animal = await req('POST', '/animals', {
    token,
    body: {
      owner_id: customer.data.data.id,
      animal_code: `NRM-${ts}`,
      animal_type: 'camel',
      name_tag: 'Norma Test',
      gender: 'female',
    },
  });
  if (!animal.ok) throw new Error(`Animal create failed: ${animal.data?.error?.message}`);

  const sample = await req('POST', '/samples', {
    token,
    body: {
      customer_id: customer.data.data.id,
      animal_id: animal.data.data.id,
      priority: 'normal',
      test_ids: [cbc.id],
    },
  });
  if (!sample.ok) throw new Error(`Sample create failed: ${sample.data?.error?.message}`);

  const sampleCode = sample.data.data.sample_code;
  const sampleId = sample.data.data.id;
  console.log(`[OK] Sample created: ${sampleCode} (${sampleId})`);

  await req('PATCH', `/samples/${sampleId}/status`, { token, body: { status: 'received' } });
  console.log('[OK] Sample status → received');

  const hl7 = buildHl7(sampleCode);
  console.log(`[..] Sending HL7 to bridge...`);
  const ack = await sendHl7ToBridge(hl7);
  console.log(`[OK] Bridge ACK received (${ack.length} bytes)`);

  await sleep(4000);

  const detail = await req('GET', `/samples/${sampleId}`, { token });
  const cbcSt = detail.data?.data?.tests?.find((t) => t.test_code === 'CBC-FULL');
  if (!cbcSt) throw new Error('CBC sample_test missing on sample');

  const results = await req('GET', `/results/sample-test/${cbcSt.id}`, { token });
  const values = results.data?.data?.values || [];
  const filled = values.filter((v) => v.value != null && v.value !== '');

  console.log(`\n--- Results in LIMS ---`);
  console.log(`  Sample:     ${sampleCode}`);
  console.log(`  Values set: ${filled.length} / ${values.length}`);
  if (filled.length) {
    filled.slice(0, 8).forEach((v) => console.log(`    ${v.parameter_code || v.code}: ${v.value}`));
    if (filled.length > 8) console.log(`    ... +${filled.length - 8} more`);
  }

  const devices = await req('GET', '/devices', { token });
  const norma = (devices.data?.data?.configured || []).find((d) => d.name === 'Norma CBC');
  if (norma) {
    const msgs = await req('GET', `/devices/${norma.id}/messages`, { token });
    const last = (msgs.data?.data || [])[0];
    if (last) console.log(`  Last device msg: ${last.status} @ ${last.created_at}`);
  }

  if (filled.length >= 3) {
    console.log('\n✓ PASS — Norma results reflected in LIMS');
    console.log(`  Open Workbench: ${API_BASE.replace(/:\d+$/, '')}/workbench?sample=${sampleId}`);
    return;
  }

  console.log('\n✗ FAIL — No results imported yet');
  console.log('  Check: pm2 logs norma-bridge');
  console.log('  Check: LIMS → Lab Devices → Recent messages');
  process.exitCode = 1;
}

main().catch((err) => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
