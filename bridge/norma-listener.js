/**
 * Norma CBC bridge — run on the lab PC (same network as the analyzer).
 * Listens for HL7/ASTM over TCP (MLLP) and forwards to Rare Vet LIMS cloud API.
 *
 * Env:
 *   LIMS_API_URL=https://rare-vet-lims.onrender.com/api
 *   DEVICE_ID=<uuid from Devices page>
 *   DEVICE_API_KEY=<key from Devices page>
 *   LISTEN_PORT=2575
 */
const net = require('net');
const https = require('https');
const http = require('http');

const API_URL = process.env.LIMS_API_URL || 'http://localhost:5000/api';
const DEVICE_ID = process.env.DEVICE_ID;
const DEVICE_API_KEY = process.env.DEVICE_API_KEY;
const LISTEN_PORT = Number(process.env.LISTEN_PORT || 2575);

if (!DEVICE_ID || !DEVICE_API_KEY) {
  console.error('Set DEVICE_ID and DEVICE_API_KEY environment variables.');
  process.exit(1);
}

function forwardToLims(message) {
  const url = new URL(`${API_URL.replace(/\/$/, '')}/devices/ingest/${DEVICE_ID}`);
  const body = JSON.stringify({ message });
  const client = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'X-Device-Key': DEVICE_API_KEY,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data || '{}'));
          } else {
            reject(new Error(`LIMS ${res.statusCode}: ${data}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function extractMessages(buffer) {
  const messages = [];
  let start = 0;
  while (start < buffer.length) {
    const sb = buffer.indexOf(0x0b, start);
    if (sb === -1) break;
    const eb = buffer.indexOf('\x1c\x0d', sb);
    if (eb === -1) break;
    messages.push(buffer.slice(sb + 1, eb).toString('utf8'));
    start = eb + 2;
  }
  return { messages, remainder: buffer.slice(start) };
}

const server = net.createServer((socket) => {
  let buffer = Buffer.alloc(0);
  console.log(`[Norma] Connection from ${socket.remoteAddress}`);

  socket.on('data', async (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    const { messages, remainder } = extractMessages(buffer);
    buffer = remainder;

    for (const msg of messages) {
      try {
        const result = await forwardToLims(msg);
        const imported = result?.data?.imported;
        console.log(`[Norma] Imported: ${imported?.sample_code || 'ok'} (${imported?.imported || 0} values)`);
        const ack = `\x0bMSH|^~\\&|LIMS|RareVet|Norma|CBC|${new Date().toISOString()}||ACK|1|P|2.3\rMSA|AA|1\r\x1c\r`;
        socket.write(ack);
      } catch (err) {
        console.error('[Norma] Forward failed:', err.message);
        const nack = `\x0bMSH|^~\\&|LIMS|RareVet|Norma|CBC|${new Date().toISOString()}||ACK|1|P|2.3\rMSA|AE|1|${err.message}\r\x1c\r`;
        socket.write(nack);
      }
    }
  });
});

server.listen(LISTEN_PORT, '0.0.0.0', () => {
  console.log(`[Norma] Listening on port ${LISTEN_PORT}`);
  console.log(`[Norma] Forwarding to ${API_URL}`);
});
