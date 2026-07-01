/**
 * Design 3 — IDEXX VetConnect-style HTML/CSS report (Puppeteer → PDF).
 */
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { buildReportHtml } = require('./build-html');
const { measureTablePagination } = require('./pagination');

let puppeteerModule;

const getPuppeteer = () => {
  if (!puppeteerModule) {
    try {
      puppeteerModule = require('puppeteer');
    } catch {
      throw new Error(
        'Design 3 requires puppeteer. Run: npm install puppeteer --save in backend/',
      );
    }
  }
  return puppeteerModule;
};

const generateReportPDF = async (reportData, outputDir, options = {}) => {
  const filename = options.filename || `report-${reportData.reportNumber}-${uuidv4().slice(0, 8)}.pdf`;
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, filename);

  const puppeteer = getPuppeteer();
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
  });

  const loadOpts = { waitUntil: 'domcontentloaded', timeout: 120000 };

  try {
    const page = await browser.newPage();

    const draftHtml = await buildReportHtml(reportData);
    await page.setContent(draftHtml, loadOpts);
    await page.emulateMediaType('print');
    const pagination = await measureTablePagination(page);

    const finalHtml = await buildReportHtml(reportData, pagination);
    await page.setContent(finalHtml, loadOpts);
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
