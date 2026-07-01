/**
 * LIMS Zebra Bridge — Browser Print API over HTTP:9100 + HTTPS:9101 (RAW ZPL).
 * Required for https://lims.onrender.com (mixed content blocks HTTP-only localhost).
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const HTTP_PORT = Number(process.env.ZEBRA_BRIDGE_HTTP_PORT || 9100);
const HTTPS_PORT = Number(process.env.ZEBRA_BRIDGE_HTTPS_PORT || 9101);
const PRINTER_PORT = process.env.ZEBRA_USB_PORT || 'USB008';
const PRINTER_NAME = process.env.ZEBRA_PRINTER_NAME || 'ZDesigner ZD421-203dpi ZPL';
const RAW_SCRIPT = path.join(__dirname, 'send-zebra-raw.ps1');
const PFX_PATH = path.join(__dirname, 'certs', 'bridge.pfx');
const PFX_PASS = process.env.ZEBRA_BRIDGE_PFX_PASS || 'lims-bridge';

const DEVICE = {
  uid: PRINTER_NAME,
  name: PRINTER_NAME,
  deviceType: 'printer',
  connection: 'usb',
};

const TMP = path.join(__dirname, '_bridge-out.zpl');

async function sendZpl(zpl) {
  fs.writeFileSync(TMP, zpl, 'ascii');
  if (process.platform === 'win32' && fs.existsSync(RAW_SCRIPT)) {
    await execAsync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${RAW_SCRIPT}" -ZplFile "${TMP}" -PrinterName "${PRINTER_NAME}"`);
    return;
  }
  await execAsync(`cmd /c copy /b "${TMP}" ${PRINTER_PORT}`);
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handle(req, res) {
  const host = req.headers.host || `127.0.0.1:${HTTP_PORT}`;
  const url = new URL(req.url, `http://${host}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/default') {
    sendJson(res, 200, { device: DEVICE });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/available') {
    sendJson(res, 200, { printer: [DEVICE], deviceList: [DEVICE] });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/write') {
    const raw = await readBody(req);
    let payload = {};
    try {
      payload = JSON.parse(raw || '{}');
    } catch {
      payload = { data: raw };
    }
    const zpl = String(payload.data || '');
    if (!zpl.trim()) {
      sendJson(res, 400, { error: 'Empty ZPL' });
      return;
    }
    console.log(`[zebra-bridge] RAW print ${zpl.length} bytes`);
    await sendZpl(zpl);
    sendJson(res, 200, { success: true });
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error('[zebra-bridge]', error.message);
    sendJson(res, 500, { error: error.message });
  });
});

server.listen(HTTP_PORT, '127.0.0.1', () => {
  console.log(`HTTP  http://127.0.0.1:${HTTP_PORT} -> RAW ${PRINTER_NAME}`);
});

if (fs.existsSync(PFX_PATH)) {
  const tls = {
    pfx: fs.readFileSync(PFX_PATH),
    passphrase: PFX_PASS,
  };
  https.createServer(tls, (req, res) => {
    handle(req, res).catch((error) => {
      console.error('[zebra-bridge]', error.message);
      sendJson(res, 500, { error: error.message });
    });
  }).listen(HTTPS_PORT, '127.0.0.1', () => {
    console.log(`HTTPS https://127.0.0.1:${HTTPS_PORT} -> RAW ${PRINTER_NAME}`);
    console.log('Open https://127.0.0.1:9101/default once in Chrome and accept the certificate.');
  });
} else {
  console.warn(`Missing ${PFX_PATH} — run tools/generate-bridge-cert.ps1 for HTTPS (required from lims.onrender.com)`);
}
