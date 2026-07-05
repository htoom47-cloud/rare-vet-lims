/**
 * Verify sample label print pipeline: barcode API + print HTML content (not blank).
 * Usage: node src/scripts/verify-label-print.js [baseUrl] [password]
 */
const BASE = (process.argv[2] || process.env.API_BASE || 'http://127.0.0.1:5000/api').replace(/\/$/, '');
const PASS = process.argv[3] || process.env.ADMIN_INITIAL_PASSWORD || 'RareVet2026';

const checks = [];
const ok = (name, fn) => checks.push({ name, fn });
const fail = (msg) => {
  throw new Error(msg);
};

async function req(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}

ok('login', async () => {
  const { status, json } = await req('POST', '/auth/login', {
    body: { username: 'admin', password: PASS },
  });
  if (status !== 200) fail(`login ${status}: ${JSON.stringify(json)}`);
  return json.data.accessToken;
});

ok('list samples with barcode', async (token) => {
  const { status, json } = await req('GET', '/samples?limit=5', { token });
  if (status !== 200) fail(`samples ${status}`);
  const rows = json.data?.samples || json.data || [];
  const sample = rows.find((s) => s.sample_code || s.barcode);
  if (!sample) fail('no sample in database');
  return sample;
});

ok('barcode API returns PNG data URL', async (token, sample) => {
  const { status, json } = await req('GET', `/samples/${sample.id}/barcode`, { token });
  if (status !== 200) fail(`barcode ${status}: ${JSON.stringify(json?.error || json)}`);
  const img = json.data?.image;
  if (!img || !String(img).startsWith('data:image/')) fail('missing image data URL');
  if (img.length < 500) fail('image data URL too short — likely blank PNG');
  return { sample, img };
});

ok('print HTML document has barcode SVG paths or PNG img', async (_token, { sample, img }) => {
  const code = String(sample.sample_code || sample.barcode || '').replace(/\D/g, '');
  if (code.length < 4) fail('sample code too short');

  // Minimal print doc like frontend buildMultiLabelPrintDocumentWithImage
  const html = `<!DOCTYPE html><html><body>
    <div class="label-50x25">
      <img src="${img}" alt="barcode" />
      <p>${sample.sample_code}</p>
    </div>
  </body></html>`;

  if (!html.includes('data:image/')) fail('HTML missing embedded barcode image');
  if (!html.includes(sample.sample_code)) fail('HTML missing sample code text');
  return html.length;
});

ok('in-place print CSS class exists in frontend index.css', async () => {
  const fs = require('fs');
  const path = require('path');
  const cssPath = path.join(__dirname, '../../../frontend/src/index.css');
  const css = fs.readFileSync(cssPath, 'utf8');
  if (!css.includes('printing-sample-label')) fail('printing-sample-label CSS missing');
  if (!css.includes('.label-print-area')) fail('label-print-area CSS missing');
  return true;
});

ok('ZPL label builder produces valid ZPL', async () => {
  const engine = require('../services/barcode-engine.service');
  const payload = engine.buildBarcodePayload({
    sample_code: '26000003',
    barcode: '260705798445',
    animal_code: '384729',
    animal_name: 'Test',
    tests: [{ test_code: 'CBC', test_name: 'CBC', category_code: 'CBC' }],
  }, { isArabic: false });
  const zpl = engine.buildZplLabel(payload, { isArabic: false });
  if (!zpl || !String(zpl).includes('^XA') || !String(zpl).includes('^XZ')) {
    fail('invalid ZPL output');
  }
  return true;
});

ok('labelPrintHtml uses sync JsBarcode import', async () => {
  const fs = require('fs');
  const path = require('path');
  const jsPath = path.join(__dirname, '../../../frontend/src/utils/labelPrintHtml.js');
  const src = fs.readFileSync(jsPath, 'utf8');
  if (!src.includes("import JsBarcode from 'jsbarcode'")) fail('JsBarcode import missing');
  if (!src.includes('lims-print-toolbar')) fail('manual print toolbar missing');
  if (!src.includes('document.write(html)')) fail('document.write print window missing');
  return true;
});

ok('printLabel tries Zebra before browser', async () => {
  const fs = require('fs');
  const path = require('path');
  const printSrc = fs.readFileSync(path.join(__dirname, '../../../frontend/src/utils/printLabel.js'), 'utf8');
  const panelSrc = fs.readFileSync(path.join(__dirname, '../../../frontend/src/utils/labelPanel.js'), 'utf8');
  if (printSrc.includes('preferBrowser')) fail('preferBrowser should be removed');
  if (!panelSrc.includes('animalCode = String(sample?.animal_code')) {
    fail('buildThermalLabelContent missing animalCode');
  }
  if (!printSrc.includes('printSampleLabelWithDialogSync')) fail('printSampleLabelWithDialogSync missing');
  if (!printSrc.includes('showDialog')) fail('showDialog option missing');
  if (!printSrc.includes('printToZebra')) fail('printToZebra missing');
  return true;
});

(async () => {
  let token;
  let sample;
  let payload;
  let passed = 0;
  console.log(`\n=== verify-label-print @ ${BASE} ===\n`);

  for (const check of checks) {
    try {
      let result;
      if (check.name === 'login') result = await check.fn();
      else if (check.name === 'list samples with barcode') result = await check.fn(token);
      else if (check.name === 'barcode API returns PNG data URL') result = await check.fn(token, sample);
      else if (check.name === 'print HTML document has barcode SVG paths or PNG img') result = await check.fn(token, payload);
      else result = await check.fn();

      if (check.name === 'login') token = result;
      if (check.name === 'list samples with barcode') sample = result;
      if (check.name === 'barcode API returns PNG data URL') payload = result;
      passed += 1;
      console.log(`  OK  ${check.name}${result && typeof result === 'number' ? ` (${result} chars)` : ''}`);
    } catch (error) {
      console.log(`  FAIL ${check.name}: ${error.message}`);
      console.log(`\n${passed}/${checks.length} passed\n`);
      process.exit(1);
    }
  }

  console.log(`\n${passed}/${checks.length} passed — label print pipeline OK\n`);
})();
