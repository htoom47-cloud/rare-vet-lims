const { parseHl7 } = require('../hl7');
const { parseAstm } = require('../astm');
const { parseNormaCsv } = require('./norma-csv');
const { parseNormaTxt } = require('./norma-txt');

const detectFormat = (raw, protocolHint) => {
  const hint = String(protocolHint || '').toUpperCase();
  if (hint === 'HL7') return 'HL7';
  if (hint === 'ASTM') return 'ASTM';
  if (hint === 'CSV') return 'CSV';
  if (hint === 'TXT') return 'TXT';

  const trimmed = String(raw || '').trim();
  if (trimmed.startsWith('MSH|') || trimmed.includes('\rOBX|') || trimmed.includes('\nOBX|')) return 'HL7';
  if (trimmed.startsWith('H|') || trimmed.startsWith('1H|') || /^H\|/.test(trimmed)) return 'ASTM';
  if (/^Code[,;]/i.test(trimmed) || /^[A-Z]{2,}[,;]/m.test(trimmed)) return 'CSV';
  if (trimmed.includes('\t')) return 'TXT';
  return 'HL7';
};

/** Unified device message parser — HL7, ASTM, CSV, TXT. */
function parseDeviceMessage(raw, protocolHint) {
  const format = detectFormat(raw, protocolHint);
  switch (format) {
    case 'ASTM':
      return parseAstm(raw);
    case 'CSV':
      return parseNormaCsv(raw);
    case 'TXT':
      return parseNormaTxt(raw);
    case 'HL7':
    default:
      return parseHl7(raw);
  }
}

module.exports = { parseDeviceMessage, detectFormat, parseNormaCsv, parseNormaTxt };
