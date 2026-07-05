/**
 * Post-deploy smoke test: login, sync refs, ingest HL7, list device ranges.
 */
const API = 'https://lims.rarevetcare.com/api';
const PASS = process.env.ADMIN_INITIAL_PASSWORD || 'RareVet2026';
const fs = require('fs');
const path = require('path');

const readBridgeEnv = () => {
  const candidates = [
    path.join(__dirname, '../../../../bridge/bridge.env'),
    'C:\\RareVet\\bridge\\bridge.env',
  ];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const map = Object.fromEntries(
        fs.readFileSync(file, 'utf8').split(/\r?\n/)
          .filter((l) => l && !l.startsWith('#'))
          .map((l) => l.split('=').map((p) => p.trim()))
          .filter((p) => p.length === 2)
      );
      return map;
    } catch { /* next */ }
  }
  return {};
};

const bridge = readBridgeEnv();
const DEVICE_ID = process.env.DEVICE_ID || bridge.DEVICE_ID || 'f14ff865-0524-4573-abe0-6bafb67515e5';
const DEVICE_KEY = process.env.DEVICE_API_KEY || bridge.DEVICE_API_KEY;

async function main() {
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: PASS }),
  });
  const lj = await login.json();
  if (!login.ok) {
    console.error('LOGIN_FAIL', login.status, lj);
    process.exit(1);
  }
  const token = lj.data.accessToken;
  const auth = { Authorization: `Bearer ${token}` };

  const ranges = await fetch(`${API}/devices/reference-ranges/list?limit=5`, { headers: auth });
  const rj = await ranges.json();
  console.log('RANGES_STATUS', ranges.status, 'total', rj.data?.total ?? 'n/a');

  if (DEVICE_KEY) {
    const hl7 = fs.readFileSync(
      path.join(__dirname, '../fixtures/norma-cbc-horse.hl7'),
      'utf8'
    ).replace(/SMP-260701-273078/g, 'SMP-260701-273078');
    const ingest = await fetch(`${API}/devices/ingest/${DEVICE_ID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Key': DEVICE_KEY,
      },
      body: JSON.stringify({ message: hl7 }),
    });
    const ij = await ingest.json();
    console.log('INGEST_STATUS', ingest.status, ij.data?.imported?.reference_ranges_synced ?? ij);
  } else {
    console.log('INGEST_SKIP no DEVICE_API_KEY');
  }

  const sync = await fetch(`${API}/devices/reference-ranges/sync`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ hours: 48 }),
  });
  const sj = await sync.json();
  console.log('SYNC_STATUS', sync.status, sj.data);

  const ranges2 = await fetch(`${API}/devices/reference-ranges/list?species=horse&limit=10`, { headers: auth });
  const rj2 = await ranges2.json();
  console.log('HORSE_RANGES', rj2.data?.total, rj2.data?.rows?.slice(0, 3).map((r) => `${r.parameter_code}:${r.low_value}-${r.high_value}`));
}

main().catch((e) => { console.error(e); process.exit(1); });
