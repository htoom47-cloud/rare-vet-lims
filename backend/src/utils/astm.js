const { parseReferenceRange } = require('./reference-range');
const { mapNormaCode, resolveNormaResultLimsCode } = require('./norma-cbc-map');
const { normalizeResultFlag } = require('./device-parsers/normalize');

function parseAstm(raw) {
  const lines = raw.replace(/\r\n/g, '\r').replace(/\n/g, '\r').split('\r').filter(Boolean);
  let sampleId = null;
  const results = [];

  for (const line of lines) {
    const fields = line.split('|');
    const type = fields[0]?.trim();

    if (type === 'O') {
      sampleId = sampleId || (fields[2] || fields[3] || '').trim() || null;
    }

    if (type === 'R') {
      const code = (fields[2] || '').split('^')[0]?.trim();
      const value = (fields[3] ?? '').trim();
      const unit = (fields[4] || '').trim();
      const refRaw = (fields[5] || '').trim();
      const ref = parseReferenceRange(refRaw);
      const limsCode = resolveNormaResultLimsCode({ code, unit });
      if (code && value !== '') {
        results.push({
          code,
          limsCode,
          parameterName: code,
          value,
          unit,
          reference: refRaw || null,
          referenceMin: ref?.min ?? null,
          referenceMax: ref?.max ?? null,
          flag: normalizeResultFlag((fields[6] || '').trim()),
        });
      }
    }
  }

  return { protocol: 'ASTM', sampleId, results, records: lines.length };
}

module.exports = { parseAstm };
