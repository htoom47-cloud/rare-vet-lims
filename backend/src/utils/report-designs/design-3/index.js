/**
 * Design 3 — IDEXX VetConnect-style HTML/CSS report (Puppeteer → PDF).
 */
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { buildReportHtml } = require('./build-html');
const { measureTablePagination } = require('./pagination');
const { getLaunchOptions } = require('./launch-browser');

let puppeteerModule;

const getPuppeteer = () => {
  if (!puppeteerModule) {
    puppeteerModule = require('puppeteer-core');
  }
  return puppeteerModule;
};

const generateReportPDF = async (reportData, outputDir, options = {}) => {
  const filename = options.filename || `report-${reportData.reportNumber}-${uuidv4().slice(0, 8)}.pdf`;
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, filename);

  const puppeteer = getPuppeteer();
  const browser = await puppeteer.launch(await getLaunchOptions());
  const loadOpts = { waitUntil: 'domcontentloaded', timeout: 120000 };

  try {
    const page = await browser.newPage();
    const html = await buildReportHtml(reportData);
    await page.setContent(html, loadOpts);
    await page.emulateMediaType('print');
    await measureTablePagination(page);
    await page.setContent(html, loadOpts);
    await page.emulateMediaType('print');
    await page.pdf({
      path: filePath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      scale: 1,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
  } finally {
    await browser.close();
  }

  return { filePath, filename, url: `/uploads/reports/${filename}` };
};

module.exports = {
  designId: 3,
  designName: 'VetConnect HTML Report',
  generateReportPDF,
};
