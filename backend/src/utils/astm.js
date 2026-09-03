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
    if (/\bBUN\b/i.test(text) || /UREA|URE\b/i.test(text)) return 'BUN';
    if (/CREA/i.test(text)) return 'CREAJ';
  }
  return '';
};

/** Digit count of a sample/order token (ignores BC-/SMP- prefixes). */
const sampleIdDigitCount = (value) => String(value || '').replace(/\D/g, '').length;

/**
 * Specimen ID is on the O record. DiaSys also puts a short patient token on P
 * (e.g. 553). Prefer the O barcode when it looks like a LIMS ID (8–14 digits).
 */
const pickAstmSampleId = (orderId, patientId) => {
  const order = String(orderId || '').trim();
  const patient = String(patientId || '').trim();
  const orderDigits = sampleIdDigitCount(order);
  const patientDigits = sampleIdDigitCount(patient);
  if (orderDigits >= 8 && orderDigits <= 14) return order;
  if (patientDigits >= 8 && patientDigits <= 14) return patient;
  return order || patient || null;
};

function parseAstm(raw) {
  const lines = raw.replace(/\r\n/g, '\r').replace(/\n/g, '\r').split('\r').filter(Boolean);
  let orderId = null;
  let patientId = null;
  const results = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fields = line.split('|');
    const type = recordType(fields[0]);

    if (type === 'O') {
      orderId = orderId || firstComponent(fields[2]) || firstComponent(fields[3]) || null;
    }

    if (type === 'P') {
      patientId = patientId || firstComponent(fields[3]) || firstComponent(fields[2]) || null;
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

  return {
    protocol: 'ASTM',
    sampleId: pickAstmSampleId(orderId, patientId),
    results,
    records: lines.length,
  };
}

module.exports = { parseAstm, firstComponent, recordType };
