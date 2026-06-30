/**
 * Verify Norma CBC device registration and recent bridge traffic.
 * Usage: node src/scripts/verify-norma-bridge.js
 */
require('dotenv').config();
const { pool, query } = require('../config/database');
const logger = require('../config/logger');

const BRIDGE_PORT = 21110;

async function main() {
  const devices = await query(
    `SELECT id, name, protocol, port, is_active, last_connected, config
     FROM device_integrations WHERE name ILIKE '%norma%' ORDER BY name`
  );

  if (!devices.rows.length) {
    logger.warn('No Norma device configured — open LIMS → Lab Devices → Set up Norma CBC');
    process.exitCode = 1;
    return;
  }

  for (const d of devices.rows) {
    const msgs = await query(
      `SELECT status, COUNT(*)::int AS count, MAX(created_at) AS last_at
       FROM device_messages WHERE device_id = $1
       GROUP BY status ORDER BY status`,
      [d.id]
    );
    const recent = await query(
      `SELECT status, created_at, parsed_data->>'sampleId' AS sample_id
       FROM device_messages WHERE device_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [d.id]
    );

    const summary = {
      id: d.id,
      active: d.is_active,
      db_port: d.port,
      expected_bridge_port: BRIDGE_PORT,
      port_ok: Number(d.port) === BRIDGE_PORT,
      last_connected: d.last_connected,
      has_api_key: Boolean(d.config?.api_key),
      message_stats: msgs.rows,
      recent_messages: recent.rows,
    };

    logger.info('Norma device check', summary);

    if (!d.is_active) logger.warn('Device is inactive — activate in Lab Devices');
    if (!summary.port_ok) logger.warn(`DB port is ${d.port}; bridge should listen on ${BRIDGE_PORT}`);
    if (!d.last_connected) logger.warn('No last_connected timestamp — bridge has not forwarded yet');
  }
}

main()
  .catch((err) => {
    logger.error('verify-norma-bridge failed', { error: err.message });
    process.exitCode = 1;
  })
  .finally(() => pool.end());
