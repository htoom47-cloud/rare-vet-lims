/**
 * Compare Norma OBX-7 vs result_values.notes vs report reference for one sample.
 * Usage:
 *   node src/scripts/audit-norma-report-refs.js <sample_id_or_code>
 *   node src/scripts/audit-norma-report-refs.js SMP-260702-968431 --api
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { query, pool } = require('../config/database');
const normaRefDebug = require('../services/norma-ref-debug.service');
const { buildReportData } = require('../services/reports.service');

const readBridgeEnv = () => {
  const candidates = [
    path.join(__dirname, '../../../../bridge/bridge.env'),
    'C:\\RareVet\\bridge\\bridge.env',
  ];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) return {};
      return Object.fromEntries(
        fs.readFileSync(file, 'utf8').split(/\r?\n/)
          .filter((l) => l && !l.startsWith('#'))
          .map((l) => l.split('=').map((p) => p.trim()))
          .filter((p) => p.length === 2)
      );
    } catch { return {}; }
  }
  return {};
};

const bridge = readBridgeEnv();
const API = (process.env.LIMS_API_URL || bridge.LIMS_API_URL || 'https://lims.rarevetcare.com/api').replace(/\/$/, '');

const arg = process.argv[2]?.trim();
const useApi = process.argv.includes('--api') || !process.env.DATABASE_URL;

if (!arg) {
  console.error('Usage: node src/scripts/audit-norma-report-refs.js <sample_id_or_code> [--api]');
  process.exit(1);
}

async function resolveSampleId(input) {
  const byId = await query('SELECT id, sample_code, animal_type FROM samples WHERE id = $1', [input]);
  if (byId.rows[0]) return byId.rows[0];

  const byCode = await query(
    `SELECT s.id, s.sample_code, a.animal_type
     FROM samples s JOIN animals a ON a.id = s.animal_id
     WHERE s.sample_code ILIKE $1 OR s.barcode ILIKE $1
     ORDER BY s.created_at DESC LIMIT 1`,
    [`%${input}%`]
  );
  return byCode.rows[0] || null;
}

async function auditViaApi(sampleCode) {
  const loginPass = process.env.API_PASS || process.env.ADMIN_INITIAL_PASSWORD || 'RareVet2026';
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: loginPass }),
  });
  const lj = await login.json();
  if (!login.ok) throw new Error(`Login failed: ${lj?.error?.message || login.status}`);

  const token = lj.data.accessToken;
  const auth = { Authorization: `Bearer ${token}` };

  const scan = await fetch(`${API}/samples/scan/${encodeURIComponent(sampleCode)}`, { headers: auth });
  const sj = await scan.json();
  if (!scan.ok) throw new Error(sj?.error?.message || 'Sample not found');
  const sample = sj.data;

  console.log('Sample:', sample.sample_code, '| id:', sample.id, '| LIMS species:', sample.animal_type);

  const dbg = await fetch(`${API}/devices/ref-debug/sample/${sample.id}`, { headers: auth });
  const dj = await dbg.json();
  if (!dbg.ok) throw new Error(dj?.error?.message || `ref-debug failed ${dbg.status}`);
  const trace = dj.data;

  console.log('Norma species:', trace.species, '| raw:', trace.speciesRaw || '—');
  if (sample.animal_type && trace.species && sample.animal_type !== trace.species) {
    console.warn('⚠ Species mismatch: LIMS=', sample.animal_type, 'Norma=', trace.species);
  }

  console.log('\n--- Parameter comparison ---');
  for (const p of trace.parameters || []) {
    const mark = p.mismatch ? '✗' : '✓';
    console.log(
      `${mark} ${p.parameterCode || p.parameter} | OBX-7=${p.rawObx7 || '—'} | stored=${p.storedInDb || '—'} | device_ref=${p.deviceRefText || '—'} | report=${p.reportReference || '—'}`
    );
    if (p.mismatchReason) console.log(`    reason: ${p.mismatchReason}`);
  }

  console.log(`\nSummary: ${trace.mismatchCount || 0} mismatch(es) of ${trace.parameters?.length || 0} parameters`);
  return trace;
}

async function main() {
  if (useApi) {
    const trace = await auditViaApi(arg);
    if ((trace.mismatchCount || 0) > 0) process.exitCode = 1;
    return;
  }

  const sample = await resolveSampleId(arg);
  if (!sample) {
    console.error('Sample not found:', arg);
    process.exitCode = 1;
    return;
  }

  console.log('Sample:', sample.sample_code, '| id:', sample.id, '| LIMS species:', sample.animal_type);

  const trace = await normaRefDebug.analyzeSample(sample.id);
  if (!trace) {
    console.error('No imported Norma message linked to this sample.');
    process.exitCode = 1;
    return;
  }

  console.log('Norma species:', trace.species, '| raw:', trace.speciesRaw || '—');
  if (sample.animal_type && trace.species && sample.animal_type !== trace.species) {
    console.warn('⚠ Species mismatch: LIMS=', sample.animal_type, 'Norma=', trace.species);
  }

  console.log('\n--- Parameter comparison ---');
  for (const p of trace.parameters) {
    const mark = p.mismatch ? '✗' : '✓';
    console.log(
      `${mark} ${p.parameterCode} | OBX-7=${p.rawObx7 || '—'} | stored=${p.storedInDb || '—'} | device_ref=${p.deviceRefText || '—'} | report=${p.reportReference || '—'}`
    );
    if (p.mismatchReason) console.log(`    reason: ${p.mismatchReason}`);
  }

  console.log(`\nSummary: ${trace.mismatchCount} mismatch(es) of ${trace.parameters.length} parameters`);

  try {
    await buildReportData(sample.id, {
      reportNumber: 'AUDIT',
      verificationCode: 'AUDIT',
      language: 'en',
      generatedBy: 'audit-script',
    });
    console.log('(Report build audit logged above as [NormaRef] lines)');
  } catch (err) {
    console.warn('Report build skipped:', err.message);
  }

  if (trace.mismatchCount > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  })
  .finally(() => pool.end().catch(() => {}));
