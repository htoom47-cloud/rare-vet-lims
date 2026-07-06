/**
 * Mindray BS-120 chemistry bridge — run on the lab PC (same network as the analyzer).
 * Listens for HL7/ASTM over TCP (MLLP) on port 5150 and forwards to Rare Vet LIMS cloud API.
 * Independent from norma-listener.js (port 21110).
 */
const net = require('net');
const https = require('https');
const http = require('http');

const API_URL = process.env.LIMS_API_URL || 'https://lims.rarevetcare.com/api';
const DEVICE_ID = process.env.DEVICE_ID;
const DEVICE_API_KEY = process.env.DEVICE_API_KEY;
const LISTEN_PORT = Number(process.env.LISTEN_PORT || 5150);

if (!DEVICE_ID || !DEVICE_API_KEY) {
  console.error('[Mindray] Set DEVICE_ID and DEVICE_API_KEY in mindray-bridge.env');
  process.exit(1);
}

function forwardToLims(message) {
  const url = new URL(`${API_URL.replace(/\/$/, '')}/devices/ingest/${DEVICE_ID}`);
  const body = JSON.stringify({ message });
  const client = url.protocol === 'https:' ? https : http;
  const timeoutMs = Number(process.env.LIMS_FORWARD_TIMEOUT_MS || 45000);

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
        timeout: timeoutMs,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data || '{}'));
            } catch {
              resolve({ ok: true, raw: data });
            }
          } else {
            reject(new Error(`LIMS ${res.statusCode}: ${data}`));
          }
        });
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error('LIMS request timeout'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function forwardToLimsWithRetry(message, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await forwardToLims(message);
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        const wait = 2000 * (i + 1);
        console.warn(`[Mindray] Forward retry ${i + 2}/${attempts} in ${wait}ms: ${err.message}`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw lastErr;
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

  const sendingApp = fields[2] || 'Mindray';
  const sendingFac = fields[3] || 'BS-120';
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
  console.log(`[Mindray] Connection from ${socket.remoteAddress}`);

  socket.on('error', (err) => {
    if (err.code === 'ECONNRESET' || err.code === 'EPIPE') return;
    console.error('[Mindray] Socket error:', err.message);
  });

  socket.on('data', async (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    const { messages, remainder } = extractMessages(buffer);
    buffer = remainder;

    for (const msg of messages) {
      if (msg.startsWith('MSH|')) {
        try {
          socket.write(buildHl7Ack(msg));
        } catch (ackErr) {
          console.error('[Mindray] ACK build failed:', ackErr.message);
        }
      }

      try {
        const result = await forwardToLimsWithRetry(msg);
        const imported = result?.data?.imported;
        if (imported?.sample_code) {
          const skipped = result?.data?.imported?.skipped?.length;
          console.log(`[Mindray] Imported: ${imported.sample_code} (${imported.imported || 0} values${skipped ? `, skipped: ${skipped}` : ''})`);
        } else if (result?.data?.warning) {
          const sid = result?.data?.parsed?.sampleId || '—';
          console.log(`[Mindray] Stored with warning: ${result.data.warning} (sampleId=${sid})`);
        } else {
          console.log('[Mindray] Message forwarded to LIMS');
        }
      } catch (err) {
        console.error('[Mindray] Forward failed:', err.message);
      }
    }
  });
});

server.on('error', (err) => {
  console.error('[Mindray] Server error:', err.message);
});

server.listen(LISTEN_PORT, '0.0.0.0', () => {
  console.log(`[Mindray] Bridge listening on port ${LISTEN_PORT}`);
  console.log(`[Mindray] Forwarding to ${API_URL}`);
  console.log(`[Mindray] Device ${DEVICE_ID.slice(0, 8)}…`);
});

setInterval(() => {
  console.log(`[Mindray] Heartbeat ${new Date().toISOString()} port=${LISTEN_PORT}`);
}, 30 * 60 * 1000);

process.on('uncaughtException', (err) => {
  console.error('[Mindray] Uncaught exception:', err.message);
});
process.on('unhandledRejection', (err) => {
  console.error('[Mindray] Unhandled rejection:', err?.message || err);
});
