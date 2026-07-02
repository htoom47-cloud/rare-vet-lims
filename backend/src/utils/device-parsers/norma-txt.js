const { parseNormaCsv } = require('./norma-csv');

/** Tab- or pipe-delimited Norma text exports — delegates to CSV parser after normalizing. */
function parseNormaTxt(raw) {
  const normalized = String(raw || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\t/g, ',').replace(/\|/g, ','))
    .join('\n');
  const parsed = parseNormaCsv(normalized);
  return { ...parsed, protocol: 'TXT' };
}

module.exports = { parseNormaTxt };
