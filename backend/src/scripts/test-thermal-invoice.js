const fs = require('fs');
const os = require('os');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const { getDefaultInvoiceSettings, buildSampleInvoice } = require('../utils/invoice-settings');
const { generateThermalInvoicePDF } = require('../utils/invoice-thermal-pdf');

const BRIDGE_URL = process.env.LIMS_PRINT_BRIDGE_URL || 'http://127.0.0.1:9100';

async function main() {
  const settings = getDefaultInvoiceSettings();
  const invoice = buildSampleInvoice(settings);
  const filename = `lims-epson-test-${Date.now()}-80mm.pdf`;
  const pdf = await generateThermalInvoicePDF(invoice, os.tmpdir(), {
    settings,
    filename,
  });

  const bytes = fs.readFileSync(pdf.filePath);
  const document = await PDFDocument.load(bytes);
  const [page] = document.getPages();
  const { width, height } = page.getSize();
  if (Math.abs(width - 227) > 1) {
    throw new Error(`Expected an 80mm PDF width near 227pt, received ${width}pt`);
  }

  console.log(`Generated: ${pdf.filePath} (${width.toFixed(1)} x ${height.toFixed(1)}pt)`);
  if (!process.argv.includes('--print')) return;

  const response = await fetch(`${BRIDGE_URL}/epson/print-pdf`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/pdf',
      Origin: 'http://localhost:5173',
    },
    body: bytes,
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Print bridge HTTP ${response.status}: ${body}`);
  console.log(`Printed: ${body}`);
  fs.rmSync(path.resolve(pdf.filePath), { force: true });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
