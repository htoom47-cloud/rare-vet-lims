const path = require('path');
const sharp = require('sharp');
const UTIF = require('utif2');

const sniffFormat = (buffer) => {
  if (!buffer?.length) return 'unknown';
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'png';
  if (buffer[0] === 0x47 && buffer[1] === 0x49) return 'gif';
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF') return 'webp';
  if (buffer[0] === 0x49 && buffer[1] === 0x49) return 'tiff';
  if (buffer[0] === 0x4d && buffer[1] === 0x4d) return 'tiff';
  const ftyp = buffer.slice(4, 12).toString('ascii');
  if (ftyp.includes('ftyp') || ftyp.includes('heic') || ftyp.includes('mif1')) return 'heic';
  return 'unknown';
};

const tiffToJpeg = async (buffer) => {
  const ifds = UTIF.decode(buffer);
  if (!ifds?.length) throw new Error('Invalid TIFF image');

  const ifd = ifds[0];
  UTIF.decodeImage(buffer, ifd);
  const rgba = UTIF.toRGBA8(ifd);

  let width = ifd.width || ifd.t256?.[0];
  let height = ifd.height || ifd.t257?.[0];
  if (!width || !height) {
    const meta = await sharp(buffer, { failOn: 'none' }).metadata();
    width = meta.width;
    height = meta.height;
  }
  if (!width || !height) {
    const pixels = rgba.length / 4;
    height = Math.round(Math.sqrt(pixels));
    width = Math.round(pixels / height);
  }

  return sharp(Buffer.from(rgba), { raw: { width, height, channels: 4 } })
    .jpeg({ quality: 88 })
    .toBuffer();
};

const toBrowserJpeg = async (buffer) => {
  const format = sniffFormat(buffer);
  if (format === 'jpeg') return buffer;
  if (format === 'tiff') return tiffToJpeg(buffer);
  return sharp(buffer, { failOn: 'none' }).rotate().jpeg({ quality: 88 }).toBuffer();
};

/** Convert phone/microscope uploads to JPEG for browser + PDF. */
const normalizeMicroscopeImage = async (buffer, originalName = 'microscope.jpg') => {
  if (!buffer?.length) {
    throw new Error('Empty image file');
  }

  const format = sniffFormat(buffer);
  if (format === 'jpeg') {
    const base = (originalName || 'microscope').replace(/\.[^.]+$/, '') || 'microscope';
    return { buffer, filename: `${base}.jpg`, mime: 'image/jpeg' };
  }

  if (format === 'png') {
    const base = (originalName || 'microscope').replace(/\.[^.]+$/, '') || 'microscope';
    return { buffer, filename: `${base}.png`, mime: 'image/png' };
  }

  try {
    const out = await toBrowserJpeg(buffer);
    const base = (originalName || 'microscope').replace(/\.[^.]+$/, '') || 'microscope';
    return { buffer: out, filename: `${base}.jpg`, mime: 'image/jpeg' };
  } catch (err) {
    throw new Error(`Unsupported image format (${format}) — please use JPEG or PNG`);
  }
};

module.exports = { normalizeMicroscopeImage, sniffFormat, toBrowserJpeg };
