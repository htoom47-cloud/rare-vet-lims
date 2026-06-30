const fs = require('fs');
const path = require('path');

const loadEnvFile = (filename) => {
  const filePath = path.join(__dirname, filename);
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const idx = trimmed.indexOf('=');
      if (idx <= 0) return;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (key) env[key] = value;
    });
  return env;
};

const bridgeEnv = loadEnvFile('bridge.env');

module.exports = {
  apps: [
    {
      name: 'norma-bridge',
      script: 'norma-listener.js',
      cwd: __dirname,
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
        LIMS_API_URL: bridgeEnv.LIMS_API_URL || 'https://lims.rarevetcare.com/api',
        DEVICE_ID: bridgeEnv.DEVICE_ID || '',
        DEVICE_API_KEY: bridgeEnv.DEVICE_API_KEY || '',
        LISTEN_PORT: bridgeEnv.LISTEN_PORT || '21110',
      },
    },
  ],
};
