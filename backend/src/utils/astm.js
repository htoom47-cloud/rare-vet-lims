const { parseReferenceRange } = require('./reference-range');
const { normalizeResultFlag } = require('./device-parsers/normalize');

/** First non-empty ASTM component (handles ^^^GLU^Glucose). */
const firstComponent = (field) => {
  const parts = String(field || '').split('^').map((p) => p.trim()).filter(Boolean);
  return parts[0] || '';
};

/** H / 1H / P / 2P → record letter. */
const recordType = (rawType) => {
  const s = String(rawType || '').trim();
  const letter = s.replace(/^\d+/, '').charAt(0);
  return letter ? letter.toUpperCase() : '';
};

/** DiaSys may omit R-record method name; following C comments can name it (e.g. GLUC GOD). */
const inferCodeFromComments = (lines, startIndex) => {
  for (let j = startIndex + 1; j < lines.length; j += 1) {
    const type = recordType(String(lines[j] || '').split('|')[0]);
    if (type === 'R' || type === 'O' || type === 'P' || type === 'L' || type === 'H') break;
    if (type !== 'C') continue;
    const text = String(lines[j] || '');
    if (/GLUC/i.test(text)) return 'GLU';
    if (/UREA|URE\b/i.test(text)) return 'UREA';
    if (/CREA/i.test(text)) return 'CREAJ';
  }
  return '';
};

function parseAstm(raw) {
  const lines = raw.replace(/\r\n/g, '\r').replace(/\n/g, '\r').split('\r').filter(Boolean);
  let sampleId = null;
  const results = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fields = line.split('|');
    const type = recordType(fields[0]);

    if (type === 'O') {
      const orderId = firstComponent(fields[2]) || firstComponent(fields[3]);
      sampleId = sampleId || orderId || null;
    }

    if (type === 'P' && !sampleId) {
      const patientId = firstComponent(fields[3]) || firstComponent(fields[2]);
      sampleId = patientId || null;
    }

    if (type === 'R') {
      let code = firstComponent(fields[2]);
      const value = (fields[3] ?? '').trim();
      const unit = (fields[4] || '').trim();
      const refRaw = (fields[5] || '').trim();
      const ref = parseReferenceRange(refRaw);
      if (!code && value !== '') {
        code = inferCodeFromComments(lines, i);
      }
      if (code && value !== '') {
        results.push({
          code,
          limsCode: null,
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

module.exports = { parseAstm, firstComponent, recordType };
