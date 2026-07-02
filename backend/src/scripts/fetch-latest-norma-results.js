/**
 * Print latest Norma CBC imports and result values from production DB.
 * Usage (Render shell or machine with DATABASE_URL):
 *   node src/scripts/fetch-latest-norma-results.js
 *   node src/scripts/fetch-latest-norma-results.js BC-260630-537773
 */
require('dotenv').config();
const { pool, query } = require('../config/database');

const sampleFilter = process.argv[2]?.trim();

async function main() {
  const device = await query(
    `SELECT id, name, last_connected FROM device_integrations WHERE name ILIKE '%norma%' LIMIT 1`
  );
  if (!device.rows[0]) {
    console.log('No Norma device in database.');
    process.exitCode = 1;
    return;
  }

  const devId = device.rows[0].id;
  console.log('Norma device:', device.rows[0].name, '| last_connected:', device.rows[0].last_connected);

  const msgSql = sampleFilter
    ? `SELECT id, status, created_at, parsed_data, sample_id
       FROM device_messages
       WHERE device_id = $1
         AND (parsed_data->>'sampleId' ILIKE $2 OR parsed_data->'import'->>'sample_code' ILIKE $2)
       ORDER BY created_at DESC LIMIT 5`
    : `SELECT id, status, created_at, parsed_data, sample_id
       FROM device_messages WHERE device_id = $1 ORDER BY created_at DESC LIMIT 8`;

  const msgParams = sampleFilter ? [devId, `%${sampleFilter}%`] : [devId];
  const msgs = await query(msgSql, msgParams);

  console.log('\n--- Recent device messages ---');
  for (const m of msgs.rows) {
    const pd = typeof m.parsed_data === 'string' ? JSON.parse(m.parsed_data) : m.parsed_data;
    const sid = pd?.sampleId || pd?.import?.sample_code || '—';
    const imp = pd?.import?.imported;
    console.log(`${m.created_at.toISOString()} | ${m.status} | sample: ${sid}${imp != null ? ` | values: ${imp}` : ''}`);
  }

  const latestImported = msgs.rows.find((m) => m.status === 'imported');
  const importMeta = latestImported?.parsed_data?.import || latestImported?.parsed_data;
  const sampleCode = importMeta?.sample_code || latestImported?.parsed_data?.sampleId;

  if (!sampleCode && !sampleFilter) {
    console.log('\nNo imported message found yet.');
    return;
  }

  const lookup = sampleFilter || sampleCode;
  const sample = await query(
    `SELECT s.id, s.sample_code, s.barcode, s.status
     FROM samples s
     WHERE s.sample_code ILIKE $1 OR s.barcode ILIKE $1
     ORDER BY s.created_at DESC LIMIT 1`,
    [`%${lookup.replace(/^.*?(BC|SMP)-/i, '$1-')}%`]
  );

  if (!sample.rows[0]) {
    console.log('\nSample not found for:', lookup);
    return;
  }

  const s = sample.rows[0];
  console.log('\n--- Sample ---');
  console.log('SMP:', s.sample_code, '| BC:', s.barcode, '| status:', s.status);

  const results = await query(
    `SELECT t.code AS test_code, t.name AS test_name, st.status AS test_status,
            tp.code AS param_code, tp.name AS param_name, tp.unit,
            rv.value, rv.flag, rv.reference_text
     FROM sample_tests st
     JOIN tests t ON st.test_id = t.id
     LEFT JOIN results r ON r.sample_test_id = st.id
     LEFT JOIN result_values rv ON rv.result_id = r.id
     LEFT JOIN test_parameters tp ON tp.id = rv.parameter_id
     WHERE st.sample_id = $1 AND t.code = 'CBC-FULL'
     ORDER BY tp.sort_order NULLS LAST, tp.code`,
    [s.id]
  );

  if (!results.rows.length) {
    console.log('\nNo CBC results stored for this sample (cleared or not imported yet).');
    return;
  }

  console.log('\n--- CBC values ---');
  const seen = new Set();
  for (const row of results.rows) {
    if (!row.param_code || seen.has(row.param_code)) continue;
    seen.add(row.param_code);
    if (row.value == null || String(row.value).trim() === '') continue;
    const ref = row.reference_text ? ` (ref ${row.reference_text})` : '';
    const flag = row.flag && row.flag !== 'NORMAL' ? ` [${row.flag}]` : '';
    console.log(`${row.param_code.padEnd(10)} ${row.value} ${row.unit || ''}${ref}${flag}`);
  }
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
