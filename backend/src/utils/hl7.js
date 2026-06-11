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
      const components = `${fields[3] || ''}^${fields[4] || ''}`
        .split('^')
        .map((s) => s.trim())
        .filter(Boolean);

      const code = components.find((c) => /^[A-Z][A-Z0-9%#.-]{1,9}$/i.test(c))
        || components.find((c) => !/^\d+$/.test(c) && c.length <= 12)
        || components[0];

      const rawValue = (fields[5] ?? fields[4] ?? '').trim().replace(',', '.');
      const numeric = parseFloat(rawValue);
      const unit = (fields[6] || fields[7] || '').trim();

      if (code && rawValue !== '' && !Number.isNaN(numeric)) {
        results.push({ code, value: String(numeric), unit });
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
