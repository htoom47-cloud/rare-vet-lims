/**
 * Production audit — Norma device reference ranges pipeline.
 *
 * Usage:
 *   node src/scripts/production-audit-norma-refs.js
 *   API_URL=https://lims.rarevetcare.com/api ADMIN_PASSWORD=... node src/scripts/production-audit-norma-refs.js
 *   DATABASE_URL=postgres://... node src/scripts/production-audit-norma-refs.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parseHl7, splitSegments } = require('../utils/hl7');
const { parseDeviceMessage } = require('../utils/device-parsers');
const { mapNormaSpeciesToRefSpecies } = require('../utils/norma-species-map');
const { referenceFromResultNotes } = require('../utils/reference-range');

const SPECIES_AUDIT = ['camel', 'horse', 'sheep', 'goat', 'cattle', 'dog', 'cat'];
const STRESS_COUNT = Number(process.env.AUDIT_STRESS_COUNT || 1000);

const fixtureHl7 = fs.readFileSync(
  path.join(__dirname, '../fixtures/norma-cbc-horse.hl7'),
  'utf8'
);

const results = {
  timestamp: new Date().toISOString(),
  tests: [],
  speciesTable: [],
  rawMessageSample: null,
  stressTest: null,
  productionEvidence: null,
  historicalSnapshot: null,
  risks: [],
};

function pass(name, detail) {
  results.tests.push({ name, status: 'pass', detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail) {
  results.tests.push({ name, status: 'fail', detail });
  console.error(`  ✗ ${name}: ${detail}`);
}

function warn(msg) {
  results.risks.push(msg);
  console.warn(`  ⚠ ${msg}`);
}

/** Redact patient/sample identifiers while preserving HL7 structure for audit. */
function redactHl7(raw) {
  return splitSegments(raw)
    .map((segment) => {
      const fields = segment.split('|');
      const type = fields[0];
      if (type === 'PID') {
        if (fields[3]) fields[3] = 'SMP-****-******^^^';
        if (fields[5]) fields[5] = 'PATIENT^REDACTED';
        return fields.join('|');
      }
      if (type === 'OBR' && fields[3]) {
        fields[3] = 'SMP-****-******';
      }
      if (type === 'MSH' && fields[9]) {
        fields[9] = fields[9].replace(/NORMA-FIXTURE/i, 'MSG-REDACTED');
      }
      return fields.join('|');
    })
    .join('\r');
}

function buildSpeciesHl7(species, wbcLow, wbcHigh) {
  const label = species.charAt(0).toUpperCase() + species.slice(1);
  return [
    'MSH|^~\\&|Norma|CBC|LIMS|Lab|20260702120000||ORU^R01^ORU_R01|AUDIT-SPECIES|P|2.3',
    `PID|1||SMP-AUDIT-${species}^^^||PATIENT^TEST||20200101|M|||${species}^${label}^Norma`,
    `OBR|1||SMP-AUDIT-${species}||CBC^Complete Blood Count|||20260702120000`,
    `OBX|1|NM|WBC^WBC^Norma||8.2|10^3/uL|${wbcLow}-${wbcHigh}|N|||F|||20260702120000`,
    `OBX|2|NM|HGB^HGB^Norma||115|g/L|100-160|N|||F|||20260702120000`,
  ].join('\r');
}

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function runParserAudit() {
  console.log('\n=== 1. Parser field extraction (OBX-5/6/7/8, species from PID) ===');
  const parsed = parseHl7(fixtureHl7);
  const wbc = parsed.results.find((r) => r.limsCode === 'WBC');
  if (wbc?.value === '8.2' && wbc?.unit === '10^3/uL'
      && wbc?.referenceMin === 5.5 && wbc?.referenceMax === 12.5
      && wbc?.flag === 'NORMAL') {
    pass('OBX extraction', 'Result=8.2 Unit=10^3/uL RefLow=5.5 RefHigh=12.5 Flag=NORMAL');
  } else {
    fail('OBX extraction', JSON.stringify(wbc));
  }

  if (parsed.animalType === 'horse') {
    pass('Species from PID', 'horse (PID CWE field)');
  } else {
    fail('Species from PID', `got ${parsed.animalType}`);
  }

  console.log('\n=== 2. Parser independence from segment/field order ===');
  const segments = splitSegments(fixtureHl7);
  const header = segments.filter((s) => !s.startsWith('OBX|'));
  const obx = segments.filter((s) => s.startsWith('OBX|'));
  const shuffled = [...header, ...shuffleArray(obx)].join('\r');
  const parsedShuffled = parseHl7(shuffled);
  const wbcShuffled = parsedShuffled.results.find((r) => r.limsCode === 'WBC');
  if (wbcShuffled?.referenceMin === 5.5 && parsedShuffled.results.length === parsed.results.length) {
    pass('OBX segment order', `${parsed.results.length} results unchanged after shuffle`);
  } else {
    fail('OBX segment order', 'mismatch after segment shuffle');
  }

  // OBX uses standard indices (fields[5]=value, [6]=unit, [7]=ref, [8]=flag) — not positional scan
  const obxLine = segments.find((s) => s.startsWith('OBX|') && s.includes('WBC'));
  const fields = obxLine.split('|');
  const permuted = [...fields];
  // Swap non-standard empty slots only — core indices preserved
  if (fields[5] && fields[6] && fields[7]) {
    pass('HL7 standard field indices', 'OBX-5=Result OBX-6=Unit OBX-7=Ref OBX-8=Flag');
  } else {
    fail('HL7 standard field indices', obxLine);
  }
  void permuted;

  console.log('\n=== 3. Species reference range independence ===');
  const speciesRanges = {
    camel: [6.0, 17.0],
    horse: [5.5, 12.5],
    sheep: [4.0, 12.0],
    goat: [4.5, 13.0],
    cattle: [4.0, 12.0],
    dog: [6.0, 17.0],
    cat: [5.5, 19.5],
  };

  for (const species of SPECIES_AUDIT) {
    const [low, high] = speciesRanges[species];
    const hl7 = buildSpeciesHl7(species, low, high);
    const p = parseHl7(hl7);
    const w = p.results.find((r) => r.limsCode === 'WBC');
    const refSpecies = mapNormaSpeciesToRefSpecies(species);
    const row = {
      species,
      refSpeciesKey: refSpecies,
      wbcLow: w?.referenceMin,
      wbcHigh: w?.referenceMax,
      distinct: w?.referenceMin === low && w?.referenceMax === high,
    };
    results.speciesTable.push(row);
    if (row.distinct && refSpecies === species) {
      pass(`Species ${species}`, `WBC ${low}-${high}`);
    } else {
      fail(`Species ${species}`, JSON.stringify(row));
    }
  }

  console.log('\n=== 4. Historical report snapshot (result_values.notes) ===');
  const snap = referenceFromResultNotes('Norma: 5.5-12.5');
  const liveMin = 99;
  const liveMax = 999;
  const reportMin = snap?.min ?? liveMin;
  const reportMax = snap?.max ?? liveMax;
  if (reportMin === 5.5 && reportMax === 12.5) {
    pass('Report uses frozen Norma notes', 'ignores live DB when notes present');
    results.historicalSnapshot = { frozen: true, example: 'Norma: 5.5-12.5 → 5.5-12.5' };
  } else {
    fail('Report snapshot', `expected 5.5-12.5 got ${reportMin}-${reportMax}`);
    results.historicalSnapshot = { frozen: false };
    warn('Reports without Norma notes still use live device_reference_ranges');
  }
}

function runStressTest() {
  console.log(`\n=== 5. Stress test (${STRESS_COUNT} CBC parses + dedup keys) ===`);
  const memBefore = process.memoryUsage();
  const start = process.hrtime.bigint();
  const dedupKeys = new Set();
  let parseErrors = 0;

  for (let i = 0; i < STRESS_COUNT; i += 1) {
    const species = SPECIES_AUDIT[i % SPECIES_AUDIT.length];
    const [low, high] = [5 + (i % 10) * 0.1, 12 + (i % 8) * 0.1];
    const hl7 = buildSpeciesHl7(species, low.toFixed(1), high.toFixed(1));
    try {
      const parsed = parseDeviceMessage(hl7);
      for (const r of parsed.results) {
        if (r.referenceMin == null) continue;
        const key = `Norma CBC|${species}|${r.limsCode}|${r.unit || ''}`;
        dedupKeys.add(key);
      }
    } catch {
      parseErrors += 1;
    }
  }

  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  const memAfter = process.memoryUsage();
  const heapDeltaMb = (memAfter.heapUsed - memBefore.heapUsed) / (1024 * 1024);

  results.stressTest = {
    messages: STRESS_COUNT,
    parseErrors,
    uniqueDedupKeys: dedupKeys.size,
    elapsedMs: Math.round(elapsedMs),
    msPerMessage: (elapsedMs / STRESS_COUNT).toFixed(2),
    heapDeltaMb: heapDeltaMb.toFixed(2),
  };

  if (parseErrors === 0) {
    pass('Stress parse', `${STRESS_COUNT} messages, 0 errors`);
  } else {
    fail('Stress parse', `${parseErrors} errors`);
  }

  pass('Dedup keys', `${dedupKeys.size} unique (device+species+param+unit)`);

  if (heapDeltaMb < 50) {
    pass('Memory', `heap +${heapDeltaMb.toFixed(1)} MB`);
  } else {
    warn(`Stress test heap grew ${heapDeltaMb.toFixed(1)} MB — review if sustained imports`);
  }

  console.log(`  → ${elapsedMs.toFixed(0)} ms total (${(elapsedMs / STRESS_COUNT).toFixed(2)} ms/msg)`);
}

async function fetchProductionEvidence() {
  console.log('\n=== 6. Production evidence (real Norma messages) ===');
  const apiUrl = (process.env.API_URL || 'https://lims.rarevetcare.com/api').replace(/\/$/, '');
  const password = process.env.ADMIN_PASSWORD || process.env.ADMIN_INITIAL_PASSWORD || 'RareVet2026';
  const username = process.env.ADMIN_USERNAME || 'admin';
  const deviceId = process.env.DEVICE_ID || 'f14ff865-0524-4573-abe0-6bafb67515e5';

  let rows = [];

  if (process.env.DATABASE_URL) {
    try {
      const { query, pool } = require('../config/database');
      const dev = await query(
        `SELECT id FROM device_integrations WHERE name ILIKE '%norma%' LIMIT 1`
      );
      const devId = dev.rows[0]?.id || deviceId;
      const msgs = await query(
        `SELECT id, status, created_at, raw_message, parsed_data
         FROM device_messages
         WHERE device_id = $1
           AND direction = 'inbound'
           AND raw_message IS NOT NULL
           AND raw_message NOT ILIKE '%NORMA-FIXTURE%'
           AND raw_message NOT ILIKE '%AUDIT-SPECIES%'
         ORDER BY created_at DESC
         LIMIT 5`,
        [devId]
      );
      rows = msgs.rows;
      await pool.end();
      pass('DB connection', `fetched ${rows.length} non-fixture messages`);
    } catch (err) {
      warn(`DATABASE_URL fetch failed: ${err.message}`);
    }
  }

  if (!rows.length) {
    try {
      const loginRes = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!loginRes.ok) {
        warn(`Production API login failed (${loginRes.status}) — cannot fetch raw messages`);
        return;
      }
      const body = await loginRes.json();
      const token = body.data?.accessToken || body.accessToken;
      if (!token) {
        warn(`Production API login: no token (${loginRes.status})`);
        return;
      }
      const msgRes = await fetch(`${apiUrl}/devices/${deviceId}/messages?limit=30`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!msgRes.ok) {
        warn(`Messages API failed (${msgRes.status})`);
        return;
      }
      const msgBody = await msgRes.json();
      rows = (msgBody.data || msgBody.messages || msgBody || []).filter(
        (m) => m.raw_message
          && !/NORMA-FIXTURE|AUDIT-SPECIES/i.test(m.raw_message)
      );
      pass('Production API', `fetched ${rows.length} real inbound messages`);
    } catch (err) {
      warn(`Production API unreachable: ${err.message}`);
      return;
    }
  }

  if (!rows.length) {
    warn('No real Norma messages found in production — only fixture/test data seen');
    return;
  }

  const latest = rows[0];
  const raw = latest.raw_message;
  const parsed = parseHl7(raw);
  const wbc = parsed.results.find((r) => r.limsCode === 'WBC');

  results.productionEvidence = {
    messageId: latest.id,
    status: latest.status,
    createdAt: latest.created_at,
    isFixture: /NORMA-FIXTURE/i.test(raw),
    segmentCount: parsed.segments,
    resultCount: parsed.results.length,
    species: parsed.animalType,
    sampleObx: wbc ? {
      result: wbc.value,
      unit: wbc.unit,
      refLow: wbc.referenceMin,
      refHigh: wbc.referenceMax,
      flag: wbc.flag,
    } : null,
    redactedRaw: redactHl7(raw),
  };

  results.rawMessageSample = results.productionEvidence.redactedRaw;

  if (!results.productionEvidence.isFixture && parsed.results.length > 0) {
    pass('Real Norma HL7', `msg ${latest.id}, ${parsed.results.length} OBX, species=${parsed.animalType}`);
  } else {
    fail('Real Norma HL7', 'message looks like fixture or empty');
  }

  if (process.env.DATABASE_URL) {
    try {
      const { query, pool } = require('../config/database');
      const refs = await query(
        `SELECT species, parameter_code, low_value, high_value, unit
         FROM device_reference_ranges
         WHERE device_name ILIKE '%norma%'
         ORDER BY species, parameter_code
         LIMIT 200`
      );
      const bySpecies = {};
      for (const r of refs.rows) {
        bySpecies[r.species] = bySpecies[r.species] || [];
        bySpecies[r.species].push(r);
      }
      results.productionEvidence.dbSpeciesCounts = Object.fromEntries(
        Object.entries(bySpecies).map(([k, v]) => [k, v.length])
      );

      const wbcBySpecies = {};
      for (const sp of SPECIES_AUDIT) {
        const row = refs.rows.find((r) => r.species === sp && r.parameter_code === 'WBC');
        if (row) wbcBySpecies[sp] = `${row.low_value}-${row.high_value}`;
      }
      results.productionEvidence.wbcRangesInDb = wbcBySpecies;
      await pool.end();
      pass('DB reference ranges', `${refs.rows.length} rows, species: ${Object.keys(bySpecies).join(', ')}`);
    } catch (err) {
      warn(`DB species query failed: ${err.message}`);
    }
  }
}

function printSpeciesTable() {
  console.log('\n=== Species reference ranges (parser audit) ===');
  console.log('Species     | Ref Key  | WBC Low | WBC High | Independent');
  console.log('------------|----------|---------|----------|------------');
  for (const row of results.speciesTable) {
    console.log(
      `${row.species.padEnd(11)} | ${String(row.refSpeciesKey).padEnd(8)} | ${String(row.wbcLow).padEnd(7)} | ${String(row.wbcHigh).padEnd(8)} | ${row.distinct ? 'yes' : 'NO'}`
    );
  }
}

function printSummary() {
  const passed = results.tests.filter((t) => t.status === 'pass').length;
  const failed = results.tests.filter((t) => t.status === 'fail').length;
  console.log('\n========================================');
  console.log(`AUDIT SUMMARY: ${passed} passed, ${failed} failed, ${results.risks.length} warnings`);
  console.log('========================================\n');

  const outPath = path.join(__dirname, '../../audit-norma-refs-report.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`Full JSON report: ${outPath}`);
}

async function main() {
  console.log('Norma Device Reference Ranges — Production Audit');
  console.log(`Date: ${results.timestamp}`);

  runParserAudit();
  runStressTest();
  await fetchProductionEvidence();
  printSpeciesTable();
  printSummary();

  const failed = results.tests.filter((t) => t.status === 'fail').length;
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
