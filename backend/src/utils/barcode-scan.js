/** Shared barcode / sample-ID rules — print, scan, Norma HL7, LIMS lookup. */

const extractDigits = (value) => String(value || '').replace(/\D/g, '');

/** Human-readable ID on label and in LIMS lists (digits preferred). */
const displaySampleId = (input) => {
  const norm = normalizeSampleScanId(input);
  if (!norm) return '';
  const digits = extractDigits(norm);
  if (digits.length >= 10 && digits.length <= 14) return digits;
  return norm;
};

/**
 * Normalize scanner / Norma input before DB lookup.
 * Strips Code128-C leading 0 when odd-length codes were encoded.
 */
const normalizeSampleScanId = (input) => {
  const trimmed = String(input || '').trim();
  if (!trimmed) return null;

  const digits = extractDigits(trimmed);
  if (!digits) {
    return /^(SMP|BC)-/i.test(trimmed) ? trimmed.toUpperCase() : trimmed;
  }

  if (digits.length === 13 && digits.startsWith('0')) {
    return digits.slice(1);
  }

  if (digits.length >= 10 && digits.length <= 14) return digits;
  if (/^(SMP|BC)-/i.test(trimmed)) return trimmed.toUpperCase();
  return trimmed;
};

/** Code128-C payload (even digit count). Display uses displaySampleId — never add pad there. */
const encodeCode128C = (input) => {
  let digits = extractDigits(displaySampleId(input));
  if (!digits) return '';
  if (digits.length % 2 === 1) digits = `0${digits}`;
  return digits;
};

const isUnifiedDigitsId = (input) => /^\d{12}$/.test(displaySampleId(input));

/** True when printed ID and Norma scan resolve to the same sample key. */
const scanMatchesStored = (stored, scanned) => {
  const a = normalizeSampleScanId(stored);
  const b = normalizeSampleScanId(scanned);
  if (!a || !b) return false;
  if (a === b) return true;
  const da = extractDigits(a);
  const db = extractDigits(b);
  return da.length >= 10 && da === db;
};

module.exports = {
  extractDigits,
  displaySampleId,
  normalizeSampleScanId,
  encodeCode128C,
  isUnifiedDigitsId,
  scanMatchesStored,
};
