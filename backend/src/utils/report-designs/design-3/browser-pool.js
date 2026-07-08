/**
 * Shared Puppeteer browser for Design-3 PDF generation.
 * Launching Chromium per request routinely OOMs Render Starter (~512MB).
 * One reused headless browser + serialized generation keeps peak RSS much lower.
 */
const logger = require('../../../config/logger');
const { getLaunchOptions } = require('./launch-browser');

let browserPromise = null;
let generating = Promise.resolve();

const getPuppeteer = () => require('puppeteer-core');

const getBrowser = async () => {
  if (!browserPromise) {
    browserPromise = (async () => {
      const puppeteer = getPuppeteer();
      const opts = await getLaunchOptions();
      logger.info('Launching shared Chromium for PDF generation');
      const browser = await puppeteer.launch(opts);
      browser.on('disconnected', () => {
        browserPromise = null;
        logger.warn('Shared Chromium disconnected — will relaunch on next PDF');
      });
      return browser;
    })().catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
};

/**
 * Run PDF work with a single concurrency slot (no parallel Chromium tabs hammering RAM).
 * @param {(page: import('puppeteer-core').Page) => Promise<T>} fn
 * @returns {Promise<T>}
 */
const withPdfPage = async (fn) => {
  const run = generating.then(async () => {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      return await fn(page);
    } finally {
      await page.close().catch(() => {});
    }
  });
  // Keep chain alive even if previous run failed.
  generating = run.catch(() => {});
  return run;
};

const closeSharedBrowser = async () => {
  if (!browserPromise) return;
  try {
    const browser = await browserPromise;
    await browser.close();
  } catch {
    /* ignore */
  } finally {
    browserPromise = null;
  }
};

module.exports = { withPdfPage, closeSharedBrowser, getBrowser };
