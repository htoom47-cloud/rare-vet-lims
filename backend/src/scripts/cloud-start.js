require('dotenv').config();
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const logger = require('../config/logger');

const backendRoot = path.join(__dirname, '../..');

function run(script) {
  execSync(`node ${script}`, { cwd: backendRoot, stdio: 'inherit' });
}

try {
  const hasDb = process.env.DATABASE_URL || process.env.PGHOST;
  if (!hasDb) {
    logger.error('Database not configured — link rare-vet-db via Environment → Link Database');
    process.exit(1);
  }

  run('src/scripts/migrate.js');
  run('src/scripts/ensure-admin.js');

  if (process.env.RUN_SEED === 'true') {
    run('src/scripts/seed.js');
  }

  const distPath = path.join(backendRoot, '../frontend/dist');
  if (!fs.existsSync(distPath)) {
    logger.error('frontend/dist not found — check Build Command includes vite build');
    process.exit(1);
  }

  require('../index');
} catch (err) {
  logger.error('Cloud start failed', { error: err.message });
  process.exit(1);
}
