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

const resolveTiffSize = async (ifd, buffer) => {
  let width = ifd.width || ifd.t256?.[0];
  let height = ifd.height || ifd.t257?.[0];
  if (!width || !height) {
    const meta = await sharp(buffer, { failOn: 'none' }).metadata();
    width = meta.width;
    height = meta.height;
  }
  return { width, height };
};

/** Build RGBA from grayscale microscope TIFF (UTIF toRGBA8 often returns black for these). */
const grayscaleTiffToRgba = (ifd, width, height) => {
  const bits = (ifd.t258 && ifd.t258[0]) || 8;
  const photometric = (ifd.t262 && ifd.t262[0]) ?? 1;
  const raw = ifd.data;
  if (!raw?.length) return null;

  const pixels = width * height;
  const samplesPerPixel = (ifd.t277 && ifd.t277[0]) || Math.round(raw.length / pixels);
  if (samplesPerPixel !== 1 || raw.length < pixels) return null;

  const gray = new Uint8Array(pixels);
  const minIsWhite = photometric === 0;

  if (bits <= 8) {
    for (let i = 0; i < pixels; i += 1) {
      gray[i] = raw[i];
    }
  } else {
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    const step = Math.max(1, Math.floor(bits / 8));
    for (let i = 0; i < pixels; i += 1) {
      let v = step === 2 ? view.getUint16(i * 2, true) : raw[i];
      gray[i] = bits > 8 ? Math.round(v / (2 ** (bits - 8))) : v;
    }
  }

  let min = 255;
  let max = 0;
  for (let i = 0; i < pixels; i += 1) {
    let v = gray[i];
    if (minIsWhite) v = 255 - v;
    gray[i] = v;
    if (v < min) min = v;
    if (v > max) max = v;
  }

  if (max === 0 && min === 0) return null;

  const rgba = new Uint8Array(pixels * 4);
  if (max === min) {
    for (let i = 0; i < pixels; i += 1) {
      rgba[i * 4] = max;
      rgba[i * 4 + 1] = max;
      rgba[i * 4 + 2] = max;
      rgba[i * 4 + 3] = 255;
    }
    return rgba;
  }

  const range = max - min;
  for (let i = 0; i < pixels; i += 1) {
    const v = Math.round(((gray[i] - min) * 255) / range);
    rgba[i * 4] = v;
    rgba[i * 4 + 1] = v;
    rgba[i * 4 + 2] = v;
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
};

const isMostlyBlackJpeg = async (buffer) => {
  try {
    const stats = await sharp(buffer).stats();
    return stats.channels.every((c) => c.mean < 3);
  } catch {
    return false;
  }
};

const tiffToJpeg = async (buffer) => {
  const ifds = UTIF.decode(buffer);
  if (!ifds?.length) throw new Error('Invalid TIFF image');

  const ifd = ifds[0];
  UTIF.decodeImage(buffer, ifd);
  const { width, height } = await resolveTiffSize(ifd, buffer);
  if (!width || !height) throw new Error('Invalid TIFF dimensions');

  let rgba = grayscaleTiffToRgba(ifd, width, height);
  if (!rgba) {
    rgba = UTIF.toRGBA8(ifd);
  }

  const out = await sharp(Buffer.from(rgba), { raw: { width, height, channels: 4 } })
    .jpeg({ quality: 88 })
    .toBuffer();

  if (await isMostlyBlackJpeg(out)) {
    throw new Error('Microscope image could not be converted — export as JPEG from the camera app');
  }
  return out;
};

const toBrowserJpeg = async (buffer) => {
  const format = sniffFormat(buffer);
  if (format === 'jpeg') {
    if (await isMostlyBlackJpeg(buffer)) {
      throw new Error('Image appears blank — please retake or use JPEG format');
    }
    return buffer;
  }
  if (format === 'tiff') return tiffToJpeg(buffer);
  const out = await sharp(buffer, { failOn: 'none' }).rotate().jpeg({ quality: 88 }).toBuffer();
  if (await isMostlyBlackJpeg(out)) {
    throw new Error('Image appears blank after conversion');
  }
  return out;
};

/** Convert phone/microscope uploads to JPEG for browser + PDF. */
const normalizeMicroscopeImage = async (buffer, originalName = 'microscope.jpg') => {
  if (!buffer?.length) {
    throw new Error('Empty image file');
  }

  const format = sniffFormat(buffer);
  if (format === 'jpeg') {
    if (await isMostlyBlackJpeg(buffer)) {
      throw new Error('Image appears blank — please retake or use JPEG format');
    }
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
    throw new Error(err.message || `Unsupported image format (${format})`);
  }
};

module.exports = { normalizeMicroscopeImage, sniffFormat, toBrowserJpeg, isMostlyBlackJpeg };
