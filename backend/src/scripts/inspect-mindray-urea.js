#!/usr/bin/env node
/** Readonly: inspect Mindray urea codes in recent device messages. */
require('dotenv').config();
const { query, pool } = require('../config/database');

(async () => {
  try {
    const devices = await query(
      `SELECT id, name, model, protocol, is_active, config
       FROM device_integrations
       WHERE name ILIKE '%mindray%'
       ORDER BY created_at DESC`
    );
    console.log('DEVICES', devices.rows.length);
    for (const d of devices.rows) {
      const cfg = typeof d.config === 'string' ? JSON.parse(d.config) : (d.config || {});
      console.log(`- ${d.name} active=${d.is_active} test_code=${cfg.test_code || '?'}`);
    }

    const maps = await query(
      `SELECT di.name, dpm.device_parameter_code, tp.code AS lims_code, dpm.is_active
       FROM device_parameter_mappings dpm
       JOIN device_integrations di ON di.id = dpm.device_id
       LEFT JOIN test_parameters tp ON tp.id = dpm.system_parameter_id
       WHERE di.name ILIKE '%mindray%'
         AND (
           dpm.device_parameter_code ILIKE '%urea%'
           OR dpm.device_parameter_code ILIKE '%bun%'
           OR dpm.device_parameter_code ILIKE 'ure%'
           OR tp.code ILIKE '%bun%'
         )
       ORDER BY dpm.device_parameter_code`
    );
    console.log('\nUREA/BUN MAPS', maps.rows.length);
    console.log(JSON.stringify(maps.rows, null, 2));

    const cols = await query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'device_messages'`
    );
    const colSet = new Set(cols.rows.map((r) => r.column_name));
    const rawCol = colSet.has('raw_payload') ? 'raw_payload'
      : (colSet.has('raw_message') ? 'raw_message' : 'payload');
    const errCol = colSet.has('error_message') ? 'error_message'
      : (colSet.has('error') ? 'error' : null);

    const msgs = await query(
      `SELECT dm.id, dm.status, dm.created_at, dm.${rawCol} AS raw_payload, dm.parsed_data
              ${errCol ? `, dm.${errCol} AS error_message` : ', NULL AS error_message'}
       FROM device_messages dm
       JOIN device_integrations di ON di.id = dm.device_id
       WHERE di.name ILIKE '%mindray%'
       ORDER BY dm.created_at DESC
       LIMIT 15`
    );

    console.log('\nRECENT MESSAGES', msgs.rows.length);
    for (const row of msgs.rows) {
      const raw = String(row.raw_payload || '');
      const ureaLines = raw.split(/\r\n|\n|\r/).filter((l) => /urea|bun|\bure\b|3094|22664/i.test(l));
      const parsed = row.parsed_data || {};
      const results = parsed.results || parsed.parameters || parsed.tests || [];
      const codes = Array.isArray(results)
        ? results.map((r) => r.code || r.parameter_code || r.device_code || r.obx_code).filter(Boolean)
        : [];
      const skipped = parsed.skipped || parsed.mapping_warnings || parsed.warnings || [];
      console.log('---', row.created_at, row.status);
      if (codes.length) console.log('  codes:', codes.join(', '));
      if (ureaLines.length) console.log('  urea HL7:', ureaLines.slice(0, 6));
      if (skipped?.length) console.log('  skipped:', JSON.stringify(skipped).slice(0, 400));
      if (row.error_message) console.log('  error:', row.error_message);
    }
  } catch (err) {
    console.error('ERR', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
})();
