const { parseReferenceRange } = require('../reference-range');
const { mapNormaCode, resolveNormaResultLimsCode } = require('../norma-cbc-map');
const { normalizeResultFlag } = require('./normalize');

/**
 * Norma CSV export: Code,Value,Unit,RefLow,RefHigh[,Flag]
 * Also accepts header row and semicolon delimiter.
 */
function parseNormaCsv(raw) {
  const text = String(raw || '').trim();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) {
    return { protocol: 'CSV', sampleId: null, animalType: null, results: [], observedAt: null };
  }

  const delimiter = lines[0].includes(';') ? ';' : ',';
  const rows = lines.map((line) => line.split(delimiter).map((c) => c.trim()));
  const header = rows[0].map((h) => h.toLowerCase());
  const hasHeader = header.some((h) => /code|test|parameter/i.test(h));
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const col = (names, row) => {
    for (const name of names) {
      const idx = header.indexOf(name);
      if (hasHeader && idx >= 0) return row[idx] ?? '';
    }
    return '';
  };

  let sampleId = null;
  const results = [];

  for (const row of dataRows) {
    const code = (hasHeader ? col(['code', 'parameter', 'test', 'parameter_code'], row) : row[0]) || '';
    const value = (hasHeader ? col(['value', 'result'], row) : row[1]) || '';
    const unit = (hasHeader ? col(['unit', 'units'], row) : row[2]) || '';
    const refLow = (hasHeader ? col(['reflow', 'low', 'min', 'reference_low'], row) : row[3]) || '';
    const refHigh = (hasHeader ? col(['refhigh', 'high', 'max', 'reference_high'], row) : row[4]) || '';
    const refRaw = refLow && refHigh ? `${refLow}-${refHigh}` : (row[5] || '');
    const ref = parseReferenceRange(refRaw || `${refLow}-${refHigh}`);
    const limsCode = resolveNormaResultLimsCode({ code, unit });

    if (/^SMP-|^BC-/i.test(code)) {
      sampleId = code;
      continue;
    }
    if (!code || value === '') continue;

    results.push({
      code,
      limsCode,
      parameterName: code,
      value,
      unit,
      reference: refRaw || null,
      referenceMin: ref?.min ?? (refLow ? parseFloat(refLow) : null),
      referenceMax: ref?.max ?? (refHigh ? parseFloat(refHigh) : null),
      flag: normalizeResultFlag(hasHeader ? col(['flag', 'status'], row) : row[5]),
    });
  }

  return { protocol: 'CSV', sampleId, animalType: null, results, observedAt: null };
}

module.exports = { parseNormaCsv };
