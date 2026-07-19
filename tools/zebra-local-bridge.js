/**
 * LIMS local print bridge — Zebra RAW ZPL + Epson silent PDF printing.
 * HTTP:9100 is used in development; HTTPS:9101 is required by the hosted LIMS.
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec, execFile } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const HTTP_PORT = Number(process.env.ZEBRA_BRIDGE_HTTP_PORT || 9100);
const HTTPS_PORT = Number(process.env.ZEBRA_BRIDGE_HTTPS_PORT || 9101);
const PRINTER_PORT = process.env.ZEBRA_USB_PORT || 'USB008';
const PRINTER_NAME = process.env.ZEBRA_PRINTER_NAME || 'ZDesigner ZD421-203dpi ZPL';
const EPSON_PRINTER_NAME = process.env.EPSON_PRINTER_NAME || 'EPSON TM-T20III Receipt';
const RAW_SCRIPT = path.join(__dirname, 'send-zebra-raw.ps1');
const PFX_PATH = path.join(__dirname, 'certs', 'bridge.pfx');
const PFX_PASS = process.env.ZEBRA_BRIDGE_PFX_PASS || 'lims-bridge';
const MAX_PDF_BYTES = Number(process.env.EPSON_MAX_PDF_BYTES || 10 * 1024 * 1024);
const ALLOWED_ORIGINS = new Set(
  String(
    process.env.LIMS_PRINT_ALLOWED_ORIGINS
      || 'https://lims.rarevetcare.com,https://rare-vet-lims.onrender.com,http://localhost:5173,http://127.0.0.1:5173'
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

const DEVICE = {
  uid: PRINTER_NAME,
  name: PRINTER_NAME,
  deviceType: 'printer',
  connection: 'usb',
};

const TMP = path.join(os.tmpdir(), 'lims-zebra-bridge-out.zpl');
const LOG_DIR = path.join(__dirname, 'zpl-log');
const LAST_DEBUG = path.join(LOG_DIR, '_last.json');

let lastDebug = null;
let epsonQueue = Promise.resolve();

const isAllowedOrigin = (origin) => !origin || ALLOWED_ORIGINS.has(origin);

const corsHeaders = (req) => {
  const origin = req.headers.origin;
  return {
    'Access-Control-Allow-Origin': origin && isAllowedOrigin(origin) ? origin : 'null',
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Private-Network': 'true',
  };
};

const loadPdfPrinter = () => {
  try {
    // Loaded lazily so Zebra remains available if Epson dependencies need setup.
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    return require('pdf-to-printer');
  } catch {
    throw new Error('Epson PDF support is not installed. Run tools\\setup-lims-print-bridge.ps1 once.');
  }
};

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

async function sendZpl(zpl) {
  fs.writeFileSync(TMP, zpl, 'ascii');
  if (process.platform === 'win32' && fs.existsSync(RAW_SCRIPT)) {
    await execAsync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${RAW_SCRIPT}" -ZplFile "${TMP}" -PrinterName "${PRINTER_NAME}"`);
    return;
  }
  await execAsync(`cmd /c copy /b "${TMP}" ${PRINTER_PORT}`);
}

function sendJson(req, res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    ...corsHeaders(req),
  });
  res.end(body);
}

function readBody(req, maxBytes = MAX_PDF_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) {
        reject(Object.assign(new Error('Request body is too large'), { statusCode: 413 }));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
    req.on('error', reject);
  });
}

async function getEpsonPrinter() {
  if (process.platform !== 'win32') return null;
  const command = [
    '$name = $env:LIMS_EPSON_CHECK_NAME;',
    '$printer = Get-Printer -Name $name -ErrorAction SilentlyContinue;',
    'if ($printer) { $printer.Name } else { exit 2 }',
  ].join(' ');
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', command],
      {
        timeout: 5000,
        windowsHide: true,
        env: { ...process.env, LIMS_EPSON_CHECK_NAME: EPSON_PRINTER_NAME },
      }
    );
    const name = stdout.trim();
    return name ? { name } : null;
  } catch {
    return null;
  }
}

async function printEpsonPdf(pdf) {
  const { print } = loadPdfPrinter();
  const tempPath = path.join(
    os.tmpdir(),
    `lims-invoice-${Date.now()}-${Math.random().toString(16).slice(2)}.pdf`
  );
  fs.writeFileSync(tempPath, pdf);
  try {
    await print(tempPath, {
      printer: EPSON_PRINTER_NAME,
      scale: 'noscale',
      monochrome: true,
      side: 'simplex',
      silent: true,
    });
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

const enqueueEpsonPdf = (pdf) => {
  const job = epsonQueue.then(() => printEpsonPdf(pdf));
  epsonQueue = job.catch(() => {});
  return job;
};

async function handle(req, res) {
  const host = req.headers.host || `127.0.0.1:${HTTP_PORT}`;
  const url = new URL(req.url, `http://${host}`);
  if (!isAllowedOrigin(req.headers.origin)) {
    sendJson(req, res, 403, { error: 'Origin not allowed' });
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(req));
    res.end();
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>LIMS Zebra Bridge</title>
<style>body{font-family:Segoe UI,Tahoma,sans-serif;max-width:520px;margin:48px auto;padding:0 16px}
.ok{color:#0a7;font-size:1.25rem;font-weight:600}code{background:#f0f0f0;padding:2px 6px;border-radius:4px}</style></head>
<body><p class="ok">✓ جسر الطباعة يعمل</p>
<p>الطابعة: <strong>${DEVICE.name}</strong></p>
<p>يمكنك الآن الطباعة من <a href="https://lims.onrender.com">LIMS</a> (حدّث الصفحة Ctrl+F5).</p>
<p>اختبار JSON: <code>/default</code></p></body></html>`;
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      ...corsHeaders(req),
    });
    res.end(html);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/default') {
    sendJson(req, res, 200, { device: DEVICE });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/available') {
    sendJson(req, res, 200, { printer: [DEVICE], deviceList: [DEVICE] });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/epson/status') {
    const printer = await getEpsonPrinter();
    sendJson(req, res, printer ? 200 : 503, {
      ready: !!printer,
      printer: printer?.name || EPSON_PRINTER_NAME,
    });
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
    sendJson(req, res, 200, lastDebug || { error: 'No print logged yet' });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/write') {
    const raw = (await readBody(req, 2 * 1024 * 1024)).toString('utf8');
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
      sendJson(req, res, 400, { error: 'Empty ZPL', rawPayloadType, meta });
      return;
    }
    if (!zpl.includes('^XA')) {
      console.error('[zebra-bridge] Rejected invalid payload (not ZPL):', zpl.slice(0, 80));
      sendJson(req, res, 400, { error: 'Invalid ZPL — expected ^XA header', preview: zpl.slice(0, 80), meta });
      return;
    }
    if (meta) {
      console.log('[zebra-bridge] meta:', JSON.stringify(meta));
    }
    console.log(`[zebra-bridge] RAW print ${zpl.length} bytes — ${zpl.slice(0, 40).replace(/\n/g, ' ')}...`);
    saveZplLog(zpl, meta, rawPayloadType);
    await sendZpl(zpl);
    sendJson(req, res, 200, { success: true, zplLength: zpl.length, meta });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/epson/print-pdf') {
    const contentType = String(req.headers['content-type'] || '').toLowerCase();
    if (!contentType.startsWith('application/pdf')) {
      sendJson(req, res, 415, { error: 'Expected application/pdf' });
      return;
    }
    const pdf = await readBody(req);
    if (pdf.length < 5 || pdf.subarray(0, 5).toString('ascii') !== '%PDF-') {
      sendJson(req, res, 400, { error: 'Invalid or empty PDF' });
      return;
    }
    const printer = await getEpsonPrinter();
    if (!printer) {
      sendJson(req, res, 503, { error: `Printer not found: ${EPSON_PRINTER_NAME}` });
      return;
    }
    console.log(`[epson-bridge] PDF print ${pdf.length} bytes -> ${EPSON_PRINTER_NAME}`);
    await enqueueEpsonPdf(pdf);
    sendJson(req, res, 200, { success: true, printer: EPSON_PRINTER_NAME });
    return;
  }

  sendJson(req, res, 404, { error: 'Not found' });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error('[zebra-bridge]', error.message);
    if (!res.headersSent) sendJson(req, res, error.statusCode || 500, { error: error.message });
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
      if (!res.headersSent) sendJson(req, res, error.statusCode || 500, { error: error.message });
    });
  }).listen(HTTPS_PORT, '127.0.0.1', () => {
    console.log(`HTTPS https://127.0.0.1:${HTTPS_PORT} -> Zebra ${PRINTER_NAME}`);
    console.log(`Epson PDF -> ${EPSON_PRINTER_NAME}`);
    console.log('Open https://127.0.0.1:9101/default once in Chrome and accept the certificate.');
  });
} else {
  console.warn(`Missing ${PFX_PATH} — run tools/generate-bridge-cert.ps1 for HTTPS (required from lims.onrender.com)`);
}
