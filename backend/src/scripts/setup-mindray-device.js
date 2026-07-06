/**
 * Register Mindray BS-120 in LIMS and seed chemistry parameter mappings.
 * Does not modify Norma or other devices.
 *
 * Usage:
 *   cd backend && node src/scripts/setup-mindray-device.js
 *   cd backend && node src/scripts/setup-mindray-device.js --regenerate-key
 */
require('dotenv').config();
const { query, pool } = require('../config/database');
const { prepareConfigWithHashedKey } = require('../utils/device-api-key');
const {
  MINDRAY_DEVICE_NAME,
  MINDRAY_TEST_CODE,
  MINDRAY_DEFAULT_PORT,
  MINDRAY_CHEM_MAPPINGS,
} = require('../utils/mindray-chem-map');

const regenerateKey = process.argv.includes('--regenerate-key');

async function findMindrayDevice() {
  const result = await query(
    `SELECT * FROM device_integrations WHERE name = $1 ORDER BY created_at DESC LIMIT 1`,
    [MINDRAY_DEVICE_NAME]
  );
  return result.rows[0] || null;
}

async function createDevice() {
  const { config, plaintextKey } = await prepareConfigWithHashedKey({
    test_code: MINDRAY_TEST_CODE,
    analyzer: 'BS-120',
  });
  const result = await query(
    `INSERT INTO device_integrations
       (name, model, protocol, connection_type, host, port, config, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      MINDRAY_DEVICE_NAME,
      'BS-120',
      'HL7',
      'tcp',
      '0.0.0.0',
      MINDRAY_DEFAULT_PORT,
      JSON.stringify(config),
      true,
    ]
  );
  return { device: result.rows[0], apiKey: plaintextKey };
}

async function regenerateDeviceKey(device) {
  const existingConfig = typeof device.config === 'string'
    ? JSON.parse(device.config)
    : (device.config || {});
  const { config, plaintextKey } = await prepareConfigWithHashedKey({
    ...existingConfig,
    test_code: existingConfig.test_code || MINDRAY_TEST_CODE,
  });
  const result = await query(
    `UPDATE device_integrations SET config = $1, is_active = true WHERE id = $2 RETURNING *`,
    [JSON.stringify(config), device.id]
  );
  return { device: result.rows[0], apiKey: plaintextKey };
}

async function seedMappings(deviceId) {
  const params = await query(
    `SELECT tp.id, tp.code FROM test_parameters tp
     JOIN tests t ON t.id = tp.test_id WHERE t.code = $1`,
    [MINDRAY_TEST_CODE]
  );
  const byCode = Object.fromEntries(params.rows.map((p) => [p.code, p.id]));
  let seeded = 0;
  let skipped = 0;

  for (const [deviceCode, limsCode, valueType] of MINDRAY_CHEM_MAPPINGS) {
    const paramId = byCode[limsCode];
    if (!paramId) {
      skipped += 1;
      continue;
    }
    await query(
      `INSERT INTO device_parameter_mappings
         (device_id, device_name, device_parameter_code, system_parameter_id, value_type, is_active)
       VALUES ($1,$2,$3,$4,$5,true)
       ON CONFLICT DO NOTHING`,
      [deviceId, MINDRAY_DEVICE_NAME, deviceCode, paramId, valueType]
    );
    seeded += 1;
  }
  return { seeded, skipped, panelParams: Object.keys(byCode) };
}

function printBridgeEnv(deviceId, apiKey) {
  const apiUrl = process.env.APP_URL
    ? `${process.env.APP_URL.replace(/\/$/, '')}/api`
    : 'https://lims.rarevetcare.com/api';

  console.log('\n=== mindray-bridge.env (save to C:\\RareVet\\mindray-bridge\\mindray-bridge.env) ===\n');
  console.log(`LIMS_API_URL=${apiUrl}`);
  console.log(`DEVICE_ID=${deviceId}`);
  console.log(`DEVICE_API_KEY=${apiKey}`);
  console.log(`LISTEN_PORT=${MINDRAY_DEFAULT_PORT}`);
  console.log('\n=== Mindray BS-120 LIS settings ===\n');
  console.log('  Enable LIS: ON');
  console.log('  LIS Host IP: <lab PC IPv4 from ipconfig>');
  console.log(`  Port: ${MINDRAY_DEFAULT_PORT}`);
  console.log('  Connect to LIS When Started Up: ON');
  console.log('  Bidirectional Mode: OFF (initial setup)');
  console.log('\n=== Test Correspondence (Code On LIS) ===\n');
  console.log('  Glu=GLU | Urea=BUN | Crea=CREA | AST | ALT | ALP | GGT | T.P=TP');
  console.log('  T.BILI=TBIL | LDH | CK | FE=IRON | IP=PHOS | Ca=CA | Mg=MG');
  console.log('\n=== Lab PC setup ===\n');
  console.log('  cd C:\\RareVet\\mindray-bridge');
  console.log('  .\\configure-mindray-bridge.ps1');
  console.log('  pm2 logs mindray-bridge --lines 20');
}

async function main() {
  let device = await findMindrayDevice();
  let apiKey = null;

  if (device && regenerateKey) {
    const updated = await regenerateDeviceKey(device);
    device = updated.device;
    apiKey = updated.apiKey;
    console.log(`Regenerated API key for ${MINDRAY_DEVICE_NAME} (${device.id})`);
  } else if (device) {
    console.log(`Device already exists: ${MINDRAY_DEVICE_NAME} (${device.id})`);
    console.log('Use --regenerate-key to issue a new API key for the bridge.');
  } else {
    const created = await createDevice();
    device = created.device;
    apiKey = created.apiKey;
    console.log(`Created ${MINDRAY_DEVICE_NAME} (${device.id})`);
  }

  const mapping = await seedMappings(device.id);
  console.log(`Parameter mappings: ${mapping.seeded} rows (${mapping.skipped} skipped — param not in ${MINDRAY_TEST_CODE})`);
  console.log(`CHEM-BASIC params in LIMS: ${mapping.panelParams.join(', ')}`);

  if (apiKey) {
    printBridgeEnv(device.id, apiKey);
  } else {
    console.log(`\nDEVICE_ID=${device.id}`);
    console.log('Run with --regenerate-key to print a new bridge API key.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => pool.end());
