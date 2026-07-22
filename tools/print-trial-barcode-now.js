/**
 * Print one Arabic trial barcode label via LIMS print bridge (ZD421).
 * Usage: node tools/print-trial-barcode-now.js
 */
const http = require('http');
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const BRIDGE = '127.0.0.1';
const PORT = 9100;

const LABEL_W = 400;
const LABEL_H = 200;

const toHexField = (text) => {
  const buf = Buffer.from(String(text || ''), 'utf8');
  if (!buf.length) return '';
  return `^FH^FD${[...buf].map((b) => `_${b.toString(16).toUpperCase().padStart(2, '0')}`).join('')}^FS`;
};

const sample = {
  barcode: '260712686909',
  sampleCode: '26000099',
  animalTypeAr: 'جمل',
  animalName: 'تجربة',
  testAr: 'طفيليات',
};

const digits = String(sample.barcode).replace(/\D/g, '');
const encode = digits.length % 2 === 1 ? `0${digits}` : digits;
const pairs = encode.length / 2;
const moduleWidth = 3;
const barH = 40;
const w = (11 + pairs * 11 + 11 + 13) * moduleWidth;
const x = Math.max(10, Math.floor((LABEL_W - w) / 2));

const animalLine = `${sample.animalTypeAr} · ${sample.animalName}`;
const sampleLine = `عينة ${sample.sampleCode}`;

const zpl = [
  '^XA',
  '^FX LIMS trial barcode Arabic NOW',
  '^CI0',
  '^MTD',
  '^MD35',
  '^MNW',
  '^PR3',
  `^PW${LABEL_W}`,
  `^LL${LABEL_H}`,
  '^LH0,0',
  '^LT0',
  '^LS0',
  '^FWN',
  '^PON',
  `^FO${x},24^BY${moduleWidth},3,${barH}^BCN,${barH},N,N,N^FD>;>8${encode}^FS`,
  `^FO0,68^FB${LABEL_W},1,0,C,0^A0N,30,28^FD${digits}^FS`,
  '^CI28',
  `^FO0,102^FB${LABEL_W},1,0,C,0^A0N,24,22${toHexField(sampleLine)}`,
  `^FO0,138^FB${LABEL_W},1,0,C,0^A0N,24,24${toHexField(sample.testAr)}`,
  `^FO0,174^FB${LABEL_W},1,0,C,0^A0N,24,22${toHexField(animalLine)}`,
  '^CI0',
  '^XZ',
].join('\n');

function httpJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : Buffer.from(JSON.stringify(body), 'utf8');
    const req = http.request({
      host: BRIDGE,
      port: PORT,
      path: urlPath,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': payload.length } : {}),
      },
      timeout: 10000,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data = text;
        try { data = JSON.parse(text); } catch { /* raw */ }
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${text}`));
          return;
        }
        resolve(data);
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function ensureBridge() {
  try {
    return await httpJson('GET', '/default');
  } catch {
    const hidden = path.join(__dirname, 'start-lims-print-bridge-hidden.vbs');
    if (fs.existsSync(hidden)) {
      spawnSync('wscript.exe', [hidden], { windowsHide: true });
      await new Promise((r) => setTimeout(r, 3500));
      return httpJson('GET', '/default');
    }
    throw new Error('Bridge not running');
  }
}

(async () => {
  const device = await ensureBridge();
  console.log('Bridge OK:', device?.device?.name || device);
  const outDir = path.join(__dirname, 'zpl-log');
  fs.mkdirSync(outDir, { recursive: true });
  const zplPath = path.join(outDir, 'trial-now.zpl');
  fs.writeFileSync(zplPath, Buffer.from(zpl, 'ascii'));
  console.log('Sending trial label...', sample);
  const result = await httpJson('POST', '/write', {
    device: { name: 'LIMS Zebra Bridge' },
    data: zpl,
    meta: { trial: true, reason: 'user-requested-test-print' },
  });
  console.log('Print OK:', result);
  console.log('Check Zebra for barcode', digits, '+ Arabic lines');
})().catch((err) => {
  console.error('PRINT FAILED:', err.message);
  process.exit(1);
});
