const { parseReferenceRange } = require('./reference-range');
const { mapNormaCode, mapNormaIndex, resolveNormaResultLimsCode } = require('./norma-cbc-map');
const { mapNormaSpeciesToRefSpeciesExact, extractAnimalTypeFromSegments, extractSpeciesRawFromSegments } = require('./norma-species-map');
const { normalizeResultFlag, parseDeviceTimestamp } = require('./device-parsers/normalize');

const HL7_VALUE_TYPES = new Set(['NM', 'SN', 'CE', 'ST', 'TX', 'FT', 'IS', 'ED', 'RP', 'DT', 'TM']);

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

const { normalizeSampleScanId } = require('./barcode-scan');

const normalizeSampleId = (id) => {
  const value = normalizeSampleScanId(id) || String(id || '').trim();
  return value || null;
};

const extractFromRaw = (raw) => {
  const patterns = [
    /\b(BC-\d{6}-\d+)\b/i,
    /\b(SMP-\d{6}-\d+)\b/i,
    /\b(SMP-[A-Z0-9-]+)\b/i,
    /\b(BC-[A-Z0-9-]+)\b/i,
    /\b(\d{12})\b/,
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

/** WBC diff sent as LYM + unit % → store refs on LYM_PCT parameter. */
const resolveLimsCodeForObx = (limsCode, codeRaw, unit) => {
  if (!limsCode) return null;
  return resolveNormaResultLimsCode({ limsCode, code: codeRaw, unit });
};

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

/** Strip Norma display prefixes (*, <, >) before parsing numeric OBX values. */
const sanitizeObxValue = (raw) => {
  let s = String(raw ?? '').trim().replace(',', '.');
  s = s.replace(/^[*<>\s]+/, '').replace(/\s+%\s*$/, '');
  return s;
};

/** Norma iVet reports HGB/MCHC in g/L — store as sent (matches Norma screen). */
const normalizeNormaValue = (code, rawValue, unit) => {
  const cleaned = sanitizeObxValue(rawValue);
  const n = parseFloat(cleaned);
  if (Number.isNaN(n)) return { value: rawValue, unit };
  return { value: String(n), unit };
};

function parseHl7(raw) {
  const segments = splitSegments(raw);
  let sampleId = extractFromRaw(raw);
  const animalTypeRaw = extractSpeciesRawFromSegments(segments);
  const animalType = mapNormaSpeciesToRefSpeciesExact(animalTypeRaw)
    || extractAnimalTypeFromSegments(segments);
  const results = [];
  let observedAt = null;

  for (const segment of segments) {
    const fields = segment.split('|');
    const type = fields[0];

    if (type === 'MSH' && fields[6]) {
      observedAt = observedAt || parseDeviceTimestamp(fields[6]);
    }

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
      for (const idx of [7, 8, 6]) {
        if (fields[idx]) {
          observedAt = parseDeviceTimestamp(fields[idx]) || observedAt;
          break;
        }
      }
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
      const limsCodeBase = codeRaw ? mapNormaCode(codeRaw) : null;

      const rawValue = sanitizeObxValue(fields[5] ?? fields[4] ?? '');
      const numeric = parseFloat(rawValue);
      const unit = (fields[6] || '').trim();
      const refRaw = (fields[7] || '').trim();
      const ref = parseReferenceRange(refRaw);
      const limsCode = resolveLimsCodeForObx(limsCodeBase, codeRaw, unit);
      const normalized = limsCode ? normalizeNormaValue(limsCode, rawValue, unit) : { value: rawValue, unit };
      const obxParts = String(fields[3] || '').split('^');
      const parameterName = obxParts[1] || obxParts[0] || codeRaw;
      const resultAt = parseDeviceTimestamp(fields[14])
        || parseDeviceTimestamp(fields[15])
        || observedAt;

      if (limsCode && rawValue !== '' && !Number.isNaN(numeric)) {
        results.push({
          code: codeRaw,
          limsCode,
          parameterName,
          value: normalized.value,
          unit: normalized.unit || unit,
          reference: refRaw || null,
          referenceMin: ref?.min ?? null,
          referenceMax: ref?.max ?? null,
          flag: normalizeResultFlag((fields[8] || '').trim()),
          observedAt: resultAt,
        });
      }
    }
  }

  return {
    protocol: 'HL7',
    sampleId: normalizeSampleId(sampleId),
    animalType: animalType || null,
    animalTypeRaw: animalTypeRaw || null,
    observedAt,
    results,
    segments: segments.length,
  };
}

module.exports = { parseHl7, splitSegments, normalizeSampleId, extractFromRaw, sanitizeObxValue };
