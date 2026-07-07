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

let activePrinterName = PRINTER_NAME;

const DEVICE = () => ({
  uid: activePrinterName,
  name: activePrinterName,
  deviceType: 'printer',
  connection: 'usb',
  limsBridge: true,
});

const TMP = path.join(__dirname, '_bridge-out.zpl');
const LOG_DIR = path.join(__dirname, 'zpl-log');
const LAST_DEBUG = path.join(LOG_DIR, '_last.json');

let lastDebug = null;

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function saveZplLog(zpl, meta, rawPayloadType) {
  ensureLogDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const zplPath = path.join(LOG_DIR, `lims-${stamp}.zpl`);
  fs.writeFileSync(zplPath, zpl, 'ascii');
  lastDebug = {
    at: new Date().toISOString(),
    zplPath,
    zplLength: zpl.length,
    zpl,
    meta: meta || null,
    rawPayloadType,
  };
  fs.writeFileSync(LAST_DEBUG, JSON.stringify(lastDebug, null, 2), 'utf8');
  console.log(`[zebra-bridge] saved ZPL log: ${zplPath}`);
  return lastDebug;
}

/** Accept ZPL string from LIMS fetch, Zebra Browser Print SDK, or raw body. */
function extractZpl(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  let data = payload.data ?? payload.zpl ?? payload.raw ?? '';
  if (typeof data === 'string') return data;
  if (data && typeof data === 'object') {
    if (typeof data.data === 'string') return data.data;
    if (typeof data.zpl === 'string') return data.zpl;
  }
  return '';
}

async function detectZebraPrinter() {
  if (process.platform !== 'win32') return PRINTER_NAME;
  try {
    const { stdout } = await execAsync(
      'powershell -NoProfile -Command "Get-Printer | Where-Object { $_.Name -match \'ZDesigner|ZD421|Zebra\' } | Select-Object -First 1 -ExpandProperty Name"'
    );
    const name = String(stdout || '').trim();
    if (name) return name;
  } catch {
    /* use default */
  }
  return PRINTER_NAME;
}

async function sendZpl(zpl) {
  fs.writeFileSync(TMP, zpl, 'ascii');
  if (process.platform === 'win32' && fs.existsSync(RAW_SCRIPT)) {
    const { stderr } = await execAsync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${RAW_SCRIPT}" -ZplFile "${TMP}" -PrinterName "${activePrinterName}"`
    );
    if (stderr && /failed/i.test(stderr)) {
      throw new Error(String(stderr).trim());
    }
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

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>LIMS Zebra Bridge</title>
<style>body{font-family:Segoe UI,Tahoma,sans-serif;max-width:520px;margin:48px auto;padding:0 16px}
.ok{color:#0a7;font-size:1.25rem;font-weight:600}code{background:#f0f0f0;padding:2px 6px;border-radius:4px}</style></head>
<body><p class="ok">✓ جسر الطباعة يعمل</p>
<p>الطابعة: <strong>${activePrinterName}</strong></p>
<p>يمكنك الآن الطباعة من <a href="https://lims.onrender.com">LIMS</a> (حدّث الصفحة Ctrl+F5).</p>
<p>اختبار JSON: <code>/default</code></p></body></html>`;
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(html);
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/lims/ping' || url.pathname === '/ping')) {
    sendJson(res, 200, {
      limsBridge: true,
      version: 1,
      printer: activePrinterName,
      port: PRINTER_PORT,
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/default') {
    sendJson(res, 200, { device: DEVICE() });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/available') {
    const device = DEVICE();
    sendJson(res, 200, { limsBridge: true, printer: [device], deviceList: [device] });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/debug/last') {
    if (!lastDebug && fs.existsSync(LAST_DEBUG)) {
      try {
        lastDebug = JSON.parse(fs.readFileSync(LAST_DEBUG, 'utf8'));
      } catch {
        lastDebug = null;
      }
    }
    sendJson(res, 200, lastDebug || { error: 'No print logged yet' });
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
    const rawPayloadType = typeof payload.data;
    const meta = payload.meta || null;
    const zpl = extractZpl(payload);
    if (!zpl.trim()) {
      console.error('[zebra-bridge] Empty ZPL. payload.data type:', rawPayloadType, 'meta:', meta);
      sendJson(res, 400, { error: 'Empty ZPL', rawPayloadType, meta });
      return;
    }
    if (!zpl.includes('^XA')) {
      console.error('[zebra-bridge] Rejected invalid payload (not ZPL):', zpl.slice(0, 80));
      sendJson(res, 400, { error: 'Invalid ZPL — expected ^XA header', preview: zpl.slice(0, 80), meta });
      return;
    }
    if (meta) {
      console.log('[zebra-bridge] meta:', JSON.stringify(meta));
    }
    console.log(`[zebra-bridge] RAW print ${zpl.length} bytes — ${zpl.slice(0, 40).replace(/\n/g, ' ')}...`);
    saveZplLog(zpl, meta, rawPayloadType);
    await sendZpl(zpl);
    sendJson(res, 200, {
      limsBridge: true,
      success: true,
      zplLength: zpl.length,
      printer: activePrinterName,
      meta,
    });
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

(async () => {
  activePrinterName = await detectZebraPrinter();
  if (activePrinterName !== PRINTER_NAME) {
    console.log(`[zebra-bridge] Auto-detected printer: ${activePrinterName}`);
  }

  server.listen(HTTP_PORT, '127.0.0.1', () => {
    console.log(`HTTP  http://127.0.0.1:${HTTP_PORT} -> RAW ${activePrinterName}`);
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
      console.log(`HTTPS https://127.0.0.1:${HTTPS_PORT} -> RAW ${activePrinterName}`);
      console.log('Open https://127.0.0.1:9101/default once in Chrome and accept the certificate.');
    });
  } else {
    console.warn(`Missing ${PFX_PATH} — run tools/generate-bridge-cert.ps1 for HTTPS (required from lims.rarevetcare.com)`);
  }
})();
