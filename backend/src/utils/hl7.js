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

function parseHl7(raw) {
  const segments = splitSegments(raw);
  let sampleId = null;
  const results = [];

  for (const segment of segments) {
    const fields = segment.split('|');
    const type = fields[0];

    if (type === 'PID' && !sampleId) {
      sampleId = (fields[3] || fields[2] || '').split('^')[0] || null;
    }

    if (type === 'OBR') {
      sampleId = sampleId
        || (fields[2] || '').split('^')[0]
        || (fields[3] || '').split('^')[0]
        || (fields[4] || '').split('^')[0]
        || null;
    }

    if (type === 'OBX') {
      const idField = fields[3] || '';
      const code = idField.split('^')[0]?.trim();
      const value = (fields[5] ?? '').trim();
      const unit = (fields[6] || '').trim();
      if (code && value !== '') {
        results.push({ code, value, unit });
      }
    }
  }

  return { protocol: 'HL7', sampleId, results, segments: segments.length };
}

module.exports = { parseHl7, splitSegments };
