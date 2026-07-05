/** Barcode / sample-ID rules — must match backend/src/utils/barcode-scan.js */

export const extractDigits = (value) => String(value || '').replace(/\D/g, '');

export const displaySampleId = (input) => {
  const norm = normalizeSampleScanId(input);
  if (!norm) return '';
  const digits = extractDigits(norm);
  if (digits.length >= 8 && digits.length <= 14) return digits;
  return norm;
};

export const normalizeSampleScanId = (input) => {
  const trimmed = String(input || '').trim();
  if (!trimmed) return null;

  const digits = extractDigits(trimmed);
  if (!digits) {
    return /^(SMP|BC)-/i.test(trimmed) ? trimmed.toUpperCase() : trimmed;
  }

  if (digits.length === 13 && digits.startsWith('0')) {
    return digits.slice(1);
  }

  if (digits.length >= 8 && digits.length <= 14) return digits;
  if (/^(SMP|BC)-/i.test(trimmed)) return trimmed.toUpperCase();
  return trimmed;
};

export const encodeCode128C = (input) => {
  let digits = extractDigits(displaySampleId(input));
  if (!digits) return '';
  if (digits.length % 2 === 1) digits = `0${digits}`;
  return digits;
};

export const scanMatchesStored = (stored, scanned) => {
  const a = normalizeSampleScanId(stored);
  const b = normalizeSampleScanId(scanned);
  if (!a || !b) return false;
  if (a === b) return true;
  const da = extractDigits(a);
  const db = extractDigits(b);
  return da.length >= 8 && da === db;
};
