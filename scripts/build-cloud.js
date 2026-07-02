#!/usr/bin/env node
/**
 * Render/cloud build — staff + client portal frontends, then backend deps.
 * Fails loudly if frontend-portal/dist is missing (portal would show staff app).
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

const buildEnv = {
  ...process.env,
  VITE_API_URL: '/api',
  CI: 'true',
};

const pruneNodeModules = (relDir) => {
  const nm = path.join(root, relDir, 'node_modules');
  if (!fs.existsSync(nm)) return;
  console.log(`[build-cloud] Pruning ${relDir}/node_modules to free memory for next step`);
  fs.rmSync(nm, { recursive: true, force: true });
};

const run = (label, cmd, args, cwd, extraEnv = {}) => {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...buildEnv, ...extraEnv },
  });
  if (result.status !== 0) {
    console.error(`\n[build-cloud] FAILED: ${label} (exit ${result.status})`);
    process.exit(result.status || 1);
  }
};

run('Staff frontend', 'npm', ['ci', '--include=dev', '--no-audit', '--no-fund'], path.join(root, 'frontend'));
run('Staff frontend build', 'npm', ['run', 'build'], path.join(root, 'frontend'));
pruneNodeModules('frontend');

run('Client portal deps', 'npm', ['ci', '--include=dev', '--no-audit', '--no-fund'], path.join(root, 'frontend-portal'));
run('Client portal build', 'npm', ['run', 'build'], path.join(root, 'frontend-portal'));
pruneNodeModules('frontend-portal');

run('Backend deps', 'npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], path.join(root, 'backend'));

const staffIndex = path.join(root, 'frontend/dist/index.html');
const portalIndex = path.join(root, 'frontend-portal/dist/index.html');

if (!fs.existsSync(staffIndex)) {
  console.error('[build-cloud] Missing frontend/dist/index.html');
  process.exit(1);
}
if (!fs.existsSync(portalIndex)) {
  console.error('[build-cloud] Missing frontend-portal/dist/index.html — portal host routing will not work');
  process.exit(1);
}

console.log('\n[build-cloud] OK — staff + portal builds ready');
