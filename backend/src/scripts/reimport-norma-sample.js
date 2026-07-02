/**
 * Re-import latest Norma HL7 for a sample (refreshes result_values.notes from OBX-7).
 * Usage:
 *   node src/scripts/reimport-norma-sample.js SMP-260702-968431
 *   DATABASE_URL=... node src/scripts/reimport-norma-sample.js <sample_code>
 *
 * With API only (no DB):
 *   DEVICE_API_KEY=... node src/scripts/reimport-norma-sample.js <code> --api
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool, query } = require('../config/database');

const readBridgeEnv = () => {
  const candidates = [
    path.join(__dirname, '../../../../bridge/bridge.env'),
    'C:\\RareVet\\bridge\\bridge.env',
  ];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      return Object.fromEntries(
        fs.readFileSync(file, 'utf8').split(/\r?\n/)
          .filter((l) => l && !l.startsWith('#'))
          .map((l) => l.split('=').map((p) => p.trim()))
          .filter((p) => p.length === 2)
      );
    } catch { /* next */ }
  }
  return {};
};

const bridge = readBridgeEnv();
const API = (process.env.LIMS_API_URL || bridge.LIMS_API_URL || 'https://lims.rarevetcare.com/api').replace(/\/$/, '');
const DEVICE_ID = process.env.DEVICE_ID || bridge.DEVICE_ID;
const DEVICE_KEY = process.env.DEVICE_API_KEY || bridge.DEVICE_API_KEY;

async function resolveSampleId(input) {
  const byId = await query('SELECT id, sample_code FROM samples WHERE id = $1', [input]);
  if (byId.rows[0]) return byId.rows[0];

  const byCode = await query(
    `SELECT id, sample_code FROM samples
     WHERE sample_code ILIKE $1 OR barcode ILIKE $1
     ORDER BY created_at DESC LIMIT 1`,
    [`%${input}%`]
  );
  return byCode.rows[0] || null;
}

async function unvalidateSample(sampleId) {
  await query(
    `UPDATE results r SET is_validated = false, validated_by = NULL, validated_at = NULL
     FROM sample_tests st
     WHERE r.sample_test_id = st.id AND st.sample_id = $1`,
    [sampleId]
  );
  await query(
    `UPDATE sample_tests SET status = 'running', completed_at = NULL WHERE sample_id = $1`,
    [sampleId]
  );
  await query(
    `UPDATE samples SET status = 'running', completed_date = NULL, updated_at = NOW() WHERE id = $1`,
    [sampleId]
  );
}

async function reimportViaDb(sampleId) {
  const msg = await query(
    `SELECT dm.id, dm.raw_message, dm.parsed_data
     FROM device_messages dm
     WHERE dm.sample_id = $1 AND dm.status = 'imported' AND dm.raw_message IS NOT NULL
     ORDER BY dm.created_at DESC LIMIT 1`,
    [sampleId]
  );
  if (!msg.rows[0]?.raw_message) {
    throw new Error('No imported Norma raw_message for this sample');
  }

  const device = await query(
    `SELECT id, name, api_key FROM device_integrations WHERE name ILIKE '%norma%' LIMIT 1`
  );
  if (!device.rows[0]) throw new Error('Norma device not found');

  const devicesService = require('../services/devices.service');
  console.log('Unvalidating sample for re-import...');
  await unvalidateSample(sampleId);

  console.log('Re-importing from stored HL7 message', msg.rows[0].id);
  const result = await devicesService.receiveMessage(
    device.rows[0].id,
    msg.rows[0].raw_message,
    'inbound',
    device.rows[0]
  );
  return result;
}

async function reimportViaApi(sampleCode) {
  if (!DEVICE_KEY || !DEVICE_ID) throw new Error('DEVICE_API_KEY and DEVICE_ID required for --api mode');

  console.log('Replaying Norma HL7 via device API for', sampleCode);
  const replay = await fetch(`${API}/devices/ingest/${DEVICE_ID}/replay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Key': DEVICE_KEY,
    },
    body: JSON.stringify({ sampleCode }),
  });
  const rj = await replay.json();
  if (!replay.ok) throw new Error(rj?.error?.message || `Replay failed ${replay.status}`);
  return rj.data;
}

async function main() {
  const arg = process.argv[2]?.trim();
  const useApi = process.argv.includes('--api');
  if (!arg) {
    console.error('Usage: node src/scripts/reimport-norma-sample.js <sample_code> [--api]');
    process.exit(1);
  }

  if (useApi || !process.env.DATABASE_URL) {
    const data = await reimportViaApi(arg);
    console.log('Re-import OK:', JSON.stringify(data?.imported || data, null, 2));
    return;
  }

  const sample = await resolveSampleId(arg);
  if (!sample) {
    console.error('Sample not found:', arg);
    process.exitCode = 1;
    return;
  }
  console.log('Sample:', sample.sample_code, sample.id);
  const result = await reimportViaDb(sample.id);
  console.log('Re-import OK:', result?.imported || result);
}

main()
  .catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  })
  .finally(() => pool.end().catch(() => {}));
