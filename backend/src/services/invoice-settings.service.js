const { query } = require('../config/database');
const path = require('path');
const fs = require('fs');
const env = require('../config/env');
const {
  SETTINGS_KEY,
  mergeInvoiceSettings,
  buildSampleInvoice,
} = require('../utils/invoice-settings');
const { generateInvoicePDF } = require('../utils/invoice-pdf');

const getInvoiceSettings = async () => {
  const result = await query('SELECT value FROM settings WHERE key = $1', [SETTINGS_KEY]);
  return mergeInvoiceSettings(result.rows[0]?.value);
};

const updateInvoiceSettings = async (payload, userId) => {
  const merged = mergeInvoiceSettings(payload);
  await query(
    `INSERT INTO settings (key, value, updated_by) VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
    [SETTINGS_KEY, JSON.stringify(merged), userId]
  );
  await query('UPDATE invoices SET pdf_url = NULL WHERE pdf_url IS NOT NULL');
  return merged;
};

const previewInvoicePdf = async (res, draftSettings = null) => {
  const settings = mergeInvoiceSettings(draftSettings);
  const sample = buildSampleInvoice(settings);
  const previewDir = path.join(env.storage.path, 'invoices', '_preview');
  fs.mkdirSync(previewDir, { recursive: true });

  const { filePath, filename } = await generateInvoicePDF(sample, previewDir, {
    filename: `invoice-preview-${Date.now()}.pdf`,
    settings,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('end', resolve);
    stream.pipe(res);
  });

  fs.unlink(filePath, () => {});
};

module.exports = {
  getInvoiceSettings,
  updateInvoiceSettings,
  previewInvoicePdf,
};
