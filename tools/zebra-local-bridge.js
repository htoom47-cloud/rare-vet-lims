/**
 * Minimal Zebra Browser Print bridge for Windows USB ZPL printers.
 * Forwards ZPL from LIMS (localhost:9100) to USB008 via raw copy.
 *
 * Usage: node tools/zebra-local-bridge.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const PORT = Number(process.env.ZEBRA_BRIDGE_PORT || 9100);
const PRINTER_PORT = process.env.ZEBRA_USB_PORT || 'USB008';
const PRINTER_NAME = process.env.ZEBRA_PRINTER_NAME || 'ZDesigner ZD421-203dpi ZPL';
const RAW_SCRIPT = path.join(__dirname, 'send-zebra-raw.ps1');

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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  try {
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
      await sendZpl(zpl);
      sendJson(res, 200, { success: true });
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error('[zebra-bridge]', error.message);
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Zebra local bridge on http://127.0.0.1:${PORT} -> ${PRINTER_PORT} (${PRINTER_NAME})`);
});
