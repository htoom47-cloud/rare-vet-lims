require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const logger = require('../config/logger');

const backendRoot = path.join(__dirname, '../..');

const runScript = (script) => new Promise((resolve, reject) => {
  logger.info(`Running ${script}`);
  const child = spawn('node', [script], { cwd: backendRoot, stdio: 'inherit' });
  child.on('error', reject);
  child.on('exit', (code) => {
    if (code === 0) resolve();
    else reject(new Error(`${script} exited with code ${code}`));
  });
});

const hasDb = process.env.DATABASE_URL || process.env.PGHOST;
if (!hasDb) {
  logger.error('Database not configured — link rare-vet-db via Environment → Link Database');
  process.exit(1);
}

const distPath = path.join(backendRoot, '../frontend/dist');
if (!fs.existsSync(distPath)) {
  logger.error('frontend/dist not found — check Build Command includes vite build');
  process.exit(1);
}

// Start HTTP immediately so Render health checks pass during background boot tasks.
require('../index');

const bootScripts = [
  'src/scripts/migrate.js',
  'src/scripts/ensure-result-attachments.js',
  'src/scripts/ensure-parasitology.js',
];

if (process.env.RUN_SEED === 'true') {
  bootScripts.push('src/scripts/seed.js');
}

bootScripts.push('src/scripts/ensure-admin.js');

(async () => {
  try {
    for (const script of bootScripts) {
      // eslint-disable-next-line no-await-in-loop
      await runScript(script);
    }
    try {
      await runScript('src/scripts/purge-demo-users.js');
    } catch (purgeErr) {
      logger.warn('purge-demo-users skipped', { error: purgeErr.message });
    }
    logger.info('Cloud boot tasks completed');
  } catch (err) {
    logger.error('Cloud boot tasks failed', { error: err.message });
  }
})();
