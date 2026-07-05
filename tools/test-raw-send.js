/**
 * Pre-deploy test: POST ZPL to local RAW bridge (same path as LIMS sendZplRawHttp).
 * Run: node tools/test-raw-send.js
 */
const fs = require('fs');
const https = require('https');
const path = require('path');

const zplPath = path.join(__dirname, 'sample-label-cbc.zpl');
const zpl = fs.readFileSync(zplPath, 'utf8');

const checks = ['^XA', '^FD', '^XZ', '^MNY', '^LT0'];
const failed = checks.filter((c) => !zpl.includes(c));
if (failed.length) {
  console.error('ZPL file missing:', failed.join(', '));
  process.exit(1);
}

const body = JSON.stringify({ data: zpl, meta: { test: true } });
const req = https.request({
  hostname: '127.0.0.1',
  port: 9101,
  path: '/write',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  },
  rejectUnauthorized: false,
}, (res) => {
  let data = '';
  res.on('data', (c) => { data += c; });
  res.on('end', () => {
    console.log('HTTP', res.statusCode, data);
    if (res.statusCode !== 200) process.exit(1);
    console.log('OK — RAW ZPL sent (' + zpl.length + ' bytes). Check printer.');
  });
});
req.on('error', (e) => {
  console.error('Bridge not running. Start: tools\\start-lims-zebra-bridge.bat');
  console.error(e.message);
  process.exit(1);
});
req.write(body);
req.end();
