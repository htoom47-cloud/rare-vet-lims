/**
 * Resolve Puppeteer launch options for local dev and Render/Linux production.
 */
const fs = require('fs');
const path = require('path');

const BASE_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--font-render-hinting=none',
  // Lower Chromium process / renderer footprint on Render Starter (~512MB).
  '--single-process',
  '--no-zygote',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-default-apps',
  '--disable-sync',
  '--disable-translate',
  '--mute-audio',
  '--js-flags=--max-old-space-size=192',
];

const setCacheDir = () => {
  if (process.env.PUPPETEER_CACHE_DIR) return;
  const backendRoot = path.join(__dirname, '../../..');
  process.env.PUPPETEER_CACHE_DIR = path.join(backendRoot, '.cache', 'puppeteer');
};

/** System Chrome / Edge — Windows local PDF when puppeteer browser cache is missing. */
const resolveSystemChromePath = () => {
  const candidates = [];
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || '';
    const pf = process.env.PROGRAMFILES || 'C:\\Program Files';
    const pf86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
    candidates.push(
      path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(local, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    );
  } else {
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/microsoft-edge',
    );
  }
  return candidates.find((p) => p && fs.existsSync(p)) || null;
};

const resolveBundledExecutablePath = async () => {
  try {
    const puppeteerDev = require('puppeteer');
    const exe = typeof puppeteerDev.executablePath === 'function'
      ? puppeteerDev.executablePath()
      : null;
    const resolved = typeof exe?.then === 'function' ? await exe : exe;
    if (resolved && fs.existsSync(resolved)) return resolved;
  } catch {
    /* puppeteer not installed */
  }
  try {
    const puppeteerCore = require('puppeteer-core');
    const exe = typeof puppeteerCore.executablePath === 'function'
      ? puppeteerCore.executablePath()
      : null;
    const resolved = typeof exe?.then === 'function' ? await exe : exe;
    if (resolved && fs.existsSync(resolved)) return resolved;
  } catch {
    /* ignore */
  }
  return null;
};

const getLaunchOptions = async () => {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return {
      headless: true,
      args: BASE_ARGS,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    };
  }

  if (process.platform === 'linux') {
    const chromium = require('@sparticuz/chromium');
    chromium.setGraphicsMode = false;
    return {
      args: [...chromium.args, ...BASE_ARGS],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    };
  }

  setCacheDir();

  const bundled = await resolveBundledExecutablePath();
  const system = resolveSystemChromePath();
  const executablePath = bundled || system;
  if (!executablePath) {
    throw new Error(
      'Chrome/Edge not found for PDF generation. Install Google Chrome, or set PUPPETEER_EXECUTABLE_PATH, or run: npx puppeteer browsers install chrome'
    );
  }

  // --single-process can crash system Chrome on Windows; keep it for bundled/linux only
  const args = system && !bundled
    ? BASE_ARGS.filter((a) => a !== '--single-process' && a !== '--no-zygote')
    : BASE_ARGS;

  return {
    headless: true,
    args,
    executablePath,
  };
};

const isChromeMissingError = (err) => (
  /Could not find Chrome|Failed to launch the browser|Browser was not found|ENOENT.*chrom|path.*must be of type string|Chrome\/Edge not found/i.test(
    String(err?.message || err)
  )
);

module.exports = { getLaunchOptions, isChromeMissingError, resolveSystemChromePath };
