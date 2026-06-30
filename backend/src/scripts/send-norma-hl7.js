const net = require('net');
const { buildNormaCbcHl7, buildFullNormaPanelValues } = require('../utils/norma-hl7-builder');
const { parseHl7 } = require('../utils/hl7');

const sampleCode = process.argv[2];
const animalType = (process.argv[3] || 'camel').toLowerCase();

if (!sampleCode) {
  console.error('Usage: node src/scripts/send-norma-hl7.js SMP-260630-037056 [camel|horse|...]');
  process.exit(1);
}

const hl7 = buildNormaCbcHl7(sampleCode, buildFullNormaPanelValues(), animalType);
const parsed = parseHl7(hl7);
const withRefs = parsed.results.filter((r) => r.referenceMin != null).length;

console.log(`Sending ${parsed.results.length} OBX (${withRefs} with reference ranges) → ${sampleCode}`);

const payload = Buffer.from(`\x0b${hl7}\r\x1c\r`, 'utf8');
const port = Number(process.env.LISTEN_PORT || 21110);

const s = net.createConnection(port, '127.0.0.1', () => s.write(payload));
s.on('data', (d) => console.log('ACK bytes:', d.length));
s.on('error', (e) => console.error('Error:', e.message));
s.on('close', () => console.log('Done — check pm2 logs norma-bridge'));
setTimeout(() => process.exit(0), 8000);
