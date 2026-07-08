/**
 * Design 3 — IDEXX VetConnect-style HTML/CSS report (Puppeteer → PDF).
 * Uses a shared Chromium instance + single-flight queue to stay under Render Starter RAM.
 */
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { buildReportHtml } = require('./build-html');
const { measureTablePagination } = require('./pagination');
const { withPdfPage } = require('./browser-pool');

const generateReportPDF = async (reportData, outputDir, options = {}) => {
  const filename = options.filename || `report-${reportData.reportNumber}-${uuidv4().slice(0, 8)}.pdf`;
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, filename);
  const loadOpts = { waitUntil: 'domcontentloaded', timeout: 120000 };

  await withPdfPage(async (page) => {
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
  });

  return { filePath, filename, url: `/uploads/reports/${filename}` };
};

module.exports = {
  designId: 3,
  designName: 'VetConnect HTML Report',
  generateReportPDF,
};
