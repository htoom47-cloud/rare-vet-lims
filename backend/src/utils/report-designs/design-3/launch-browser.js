/**
 * Resolve Puppeteer launch options for local dev and Render/Linux production.
 */
const path = require('path');

const BASE_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--font-render-hinting=none',
];

const setCacheDir = () => {
  if (process.env.PUPPETEER_CACHE_DIR) return;
  const backendRoot = path.join(__dirname, '../../..');
  process.env.PUPPETEER_CACHE_DIR = path.join(backendRoot, '.cache', 'puppeteer');
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

  try {
    const puppeteerDev = require('puppeteer');
    return {
      headless: true,
      args: BASE_ARGS,
      executablePath: await puppeteerDev.executablePath(),
    };
  } catch {
    const puppeteerCore = require('puppeteer-core');
    return {
      headless: true,
      args: BASE_ARGS,
      executablePath: await puppeteerCore.executablePath(),
    };
  }
};

const isChromeMissingError = (err) => (
  /Could not find Chrome|Failed to launch the browser|Browser was not found|ENOENT.*chrom/i.test(String(err?.message || err))
);

module.exports = { getLaunchOptions, isChromeMissingError };
