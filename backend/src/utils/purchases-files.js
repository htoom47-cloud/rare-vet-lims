const path = require('path');
const { AppError } = require('../middleware/errorHandler');

const MAX_BYTES = 8 * 1024 * 1024;
const BLOCKED_EXT = /\.(exe|bat|cmd|com|msi|dll|js|mjs|cjs|html|htm|svg|sh|ps1|php|jar)$/i;

const sniffPurchaseFile = (buffer, originalName = '') => {
  if (!buffer || !buffer.length) {
    throw new AppError('Empty file', 400, 'INVALID_FILE');
  }
  if (buffer.length > MAX_BYTES) {
    throw new AppError('File exceeds 8 MB', 400, 'FILE_TOO_LARGE');
  }
  if (BLOCKED_EXT.test(originalName)) {
    throw new AppError('Executable or script files are not allowed', 400, 'FILE_TYPE_BLOCKED');
  }

  if (buffer.length >= 5 && buffer.slice(0, 5).toString('ascii') === '%PDF-') {
    return { mime: 'application/pdf', ext: '.pdf' };
  }
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return { mime: 'image/jpeg', ext: '.jpg' };
  }
  if (buffer.length >= 8
    && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return { mime: 'image/png', ext: '.png' };
  }
  if (buffer.length >= 12
    && buffer.slice(0, 4).toString('ascii') === 'RIFF'
    && buffer.slice(8, 12).toString('ascii') === 'WEBP') {
    return { mime: 'image/webp', ext: '.webp' };
  }

  throw new AppError('Only JPEG, PNG, WEBP, or PDF files are allowed', 400, 'FILE_TYPE_BLOCKED');
};

const safeOriginalName = (name) => path.basename(String(name || 'attachment')).slice(0, 255);

module.exports = { sniffPurchaseFile, safeOriginalName, MAX_BYTES, BLOCKED_EXT };
