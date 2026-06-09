require('dotenv').config();
const { execSync } = require('child_process');
const path = require('path');

const backendRoot = path.join(__dirname, '../..');

function run(script) {
  execSync(`node ${script}`, { cwd: backendRoot, stdio: 'inherit' });
}

run('src/scripts/migrate.js');

if (process.env.RUN_SEED === 'true') {
  run('src/scripts/seed.js');
}

require('../index');
