/**
 * Norma CBC bridge — run on the lab PC (same network as the analyzer).
 * Listens for HL7/ASTM over TCP (MLLP) and forwards to Rare Vet LIMS cloud API.
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

const hl7Timestamp = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};

const buildHl7Ack = (originalMsg) => {
  const segments = String(originalMsg).replace(/\r\n/g, '\r').split('\r').filter(Boolean);
  const msh = segments.find((s) => s.startsWith('MSH|')) || '';
  const fields = msh.split('|');

  const sendingApp = fields[2] || 'Norma';
  const sendingFac = fields[3] || 'CBC';
  const msgControlId = fields[9] || '1';
  const ackId = `ACK${Date.now()}`;

  const ackBody = [
    `MSH|^~\\&|LIMS|RareVet|${sendingApp}|${sendingFac}|${hl7Timestamp()}||ACK^R01^ACK|${ackId}|P|2.3`,
    `MSA|AA|${msgControlId}`,
  ].join('\r');

  return Buffer.from(`\x0b${ackBody}\r\x1c\r`, 'utf8');
};

const server = net.createServer((socket) => {
  let buffer = Buffer.alloc(0);
  console.log(`[Norma] Connection from ${socket.remoteAddress}`);

  socket.on('data', async (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    const { messages, remainder } = extractMessages(buffer);
    buffer = remainder;

    for (const msg of messages) {
      // Reply to Norma immediately so the analyzer does not show HL7 receive errors
      try {
        socket.write(buildHl7Ack(msg));
      } catch (ackErr) {
        console.error('[Norma] ACK build failed:', ackErr.message);
      }

      try {
        const result = await forwardToLims(msg);
        const imported = result?.data?.imported;
        if (imported?.sample_code) {
          console.log(`[Norma] Imported: ${imported.sample_code} (${imported.imported || 0} values)`);
        } else if (result?.data?.warning) {
          console.log(`[Norma] Stored with warning: ${result.data.warning}`);
        } else {
          console.log('[Norma] Message forwarded to LIMS');
        }
      } catch (err) {
        console.error('[Norma] Forward failed:', err.message);
      }
    }
  });
});

server.listen(LISTEN_PORT, '0.0.0.0', () => {
  console.log(`[Norma] Listening on port ${LISTEN_PORT}`);
  console.log(`[Norma] Forwarding to ${API_URL}`);
});
