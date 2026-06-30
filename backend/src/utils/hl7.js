const { parseReferenceRange } = require('./reference-range');
const { mapNormaCode, mapNormaIndex } = require('./norma-cbc-map');

function splitSegments(raw) {
  return raw
    .replace(/\x0b/g, '')
    .replace(/\x1c\x0d/g, '')
    .replace(/\r\n/g, '\r')
    .replace(/\n/g, '\r')
    .split('\r')
    .map((s) => s.trim())
    .filter(Boolean);
}

const pickId = (field) => {
  if (!field) return null;
  const primary = String(field).split('^')[0]?.trim();
  return primary || null;
};

const normalizeSampleId = (id) => {
  const value = String(id || '').trim();
  return value || null;
};

const extractFromRaw = (raw) => {
  const patterns = [
    /\b(BC-\d{6}-\d+)\b/i,
    /\b(SMP-\d{6}-\d+)\b/i,
    /\b(SMP-[A-Z0-9-]+)\b/i,
    /\b(BC-[A-Z0-9-]+)\b/i,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match) return match[1];
  }
  return null;
};

const firstId = (...candidates) => {
  for (const candidate of candidates) {
    const id = normalizeSampleId(candidate);
    if (id) return id;
  }
  return null;
};

const HL7_VALUE_TYPES = new Set(['NM', 'SN', 'CE', 'ST', 'TX', 'FT', 'IS', 'ED', 'RP', 'DT', 'TM']);

const extractObxCode = (fields) => {
  const obx3Parts = String(fields[3] || '').split('^').map((s) => s.trim()).filter(Boolean);
  const extraParts = String(fields[4] || '').split('^').map((s) => s.trim()).filter(Boolean);
  const parts = [...obx3Parts, ...extraParts];

  // Prefer text name in OBX-3 (e.g. 12^HGB^Norma or ^HGB^)
  for (const part of parts) {
    if (/^\d+$/.test(part)) continue;
    if (HL7_VALUE_TYPES.has(part.toUpperCase())) continue;
    const mapped = mapNormaCode(part);
    if (mapped && !/^\d+$/.test(part)) return part;
    if (/^[A-Z][A-Z0-9%#.-]{1,16}$/i.test(part)) return part;
  }

  for (const part of obx3Parts) {
    if (/^\d+$/.test(part)) {
      const mapped = mapNormaIndex(Number(part));
      if (mapped) return mapped;
    }
  }

  return null;
};

/** Norma iVet reports HGB/MCHC in g/L — store as sent (matches Norma screen). */
const normalizeNormaValue = (code, rawValue, unit) => {
  const n = parseFloat(String(rawValue).replace(',', '.'));
  if (Number.isNaN(n)) return { value: rawValue, unit };
  return { value: String(n), unit };
};

function parseHl7(raw) {
  const segments = splitSegments(raw);
  let sampleId = extractFromRaw(raw);
  const results = [];

  for (const segment of segments) {
    const fields = segment.split('|');
    const type = fields[0];

    if (type === 'PID') {
      sampleId = sampleId || firstId(
        pickId(fields[3]),
        pickId(fields[2]),
        pickId(fields[4]),
        pickId(fields[18]),
        pickId(fields[19])
      );
    }

    if (type === 'ORC') {
      sampleId = sampleId || firstId(
        pickId(fields[2]),
        pickId(fields[3]),
        pickId(fields[4])
      );
    }

    if (type === 'OBR') {
      sampleId = sampleId || firstId(
        pickId(fields[2]),
        pickId(fields[3]),
        pickId(fields[4]),
        pickId(fields[18]),
        pickId(fields[19]),
        pickId(fields[20])
      );
    }

    if (type === 'SPM') {
      sampleId = sampleId || firstId(
        pickId(fields[2]),
        pickId(fields[1]),
        pickId(fields[4])
      );
    }

    if (type === 'PV1') {
      sampleId = sampleId || firstId(pickId(fields[19]));
    }

    if (type === 'OBX') {
      const codeRaw = extractObxCode(fields);
      const limsCode = codeRaw ? mapNormaCode(codeRaw) : null;

      const rawValue = (fields[5] ?? fields[4] ?? '').trim().replace(',', '.');
      const numeric = parseFloat(rawValue);
      const unit = (fields[6] || '').trim();
      const refRaw = (fields[7] || '').trim();
      const ref = parseReferenceRange(refRaw);
      const normalized = limsCode ? normalizeNormaValue(limsCode, rawValue, unit) : { value: rawValue, unit };

      if (limsCode && rawValue !== '' && !Number.isNaN(numeric)) {
        results.push({
          code: codeRaw,
          limsCode,
          value: normalized.value,
          unit: normalized.unit || unit,
          reference: refRaw || null,
          referenceMin: ref?.min ?? null,
          referenceMax: ref?.max ?? null,
          flag: (fields[8] || '').trim() || null,
        });
      }
    }
  }

  return {
    protocol: 'HL7',
    sampleId: normalizeSampleId(sampleId),
    results,
    segments: segments.length,
  };
}

module.exports = { parseHl7, splitSegments, normalizeSampleId, extractFromRaw };
