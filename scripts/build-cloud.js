#!/usr/bin/env node
/**
 * Render/cloud build — staff + client portal frontends, then backend deps.
 * Fails loudly if frontend-portal/dist is missing (portal would show staff app).
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const puppeteerCacheDir = process.env.PUPPETEER_CACHE_DIR
  || path.join(root, 'backend', '.cache', 'puppeteer');

const run = (label, cmd, args, cwd, extraEnv = {}) => {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, VITE_API_URL: '/api', PUPPETEER_CACHE_DIR: puppeteerCacheDir, ...extraEnv },
  });
  if (result.status !== 0) {
    console.error(`\n[build-cloud] FAILED: ${label} (exit ${result.status})`);
    process.exit(result.status || 1);
  }
};

run('Staff frontend', 'npm', ['ci', '--include=dev'], path.join(root, 'frontend'));
run('Staff frontend build', 'npm', ['run', 'build'], path.join(root, 'frontend'));

run('Client portal deps', 'npm', ['ci', '--include=dev'], path.join(root, 'frontend-portal'));
run('Client portal build', 'npm', ['run', 'build'], path.join(root, 'frontend-portal'));

run('Backend deps', 'npm', ['ci', '--omit=dev'], path.join(root, 'backend'));

fs.mkdirSync(puppeteerCacheDir, { recursive: true });
run('Puppeteer Chrome', 'npx', ['puppeteer', 'browsers', 'install', 'chrome'], path.join(root, 'backend'));

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
