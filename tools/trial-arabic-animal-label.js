/**
 * Trial labels for Arabic animal name on Zebra.
 *
 * Critical: keep ZPL file pure ASCII (encode Arabic as ^FH hex).
 * Raw UTF-8 Arabic bytes in the file can break Code128 on ZD421.
 *
 * Usage:
 *   node tools/trial-arabic-animal-label.js --control --send   # barcode only (English)
 *   node tools/trial-arabic-animal-label.js --name "راجح" --send
 */
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const LABEL_WIDTH = 400;
const LABEL_HEIGHT = 200;
const LAYOUT = {
  barcodeY: 24,
  barcodeHeight: 40,
  digitsY: 68,
  sampleY: 102,
  testY: 138,
  animalY: 174,
};

const args = process.argv.slice(2);
const nameIdx = args.indexOf('--name');
const animalName = nameIdx >= 0 ? String(args[nameIdx + 1] || '').trim() : 'راجح';
const doSend = args.includes('--send');
const controlOnly = args.includes('--control');
const openHtml = !args.includes('--no-open');

const sample = {
  barcode: '260712686909',
  sample_code: '26000035',
  testLine: 'Parasitology',
  animal_name: animalName,
};

const encodeCode128C = (barcode) => {
  let digits = String(barcode || '').replace(/\D/g, '');
  if (digits.length % 2 === 1) digits = `0${digits}`;
  return digits;
};

/** Encode Unicode text as ZPL ^FH hex (UTF-8) so the .zpl file stays ASCII-safe. */
const toZplUtf8HexField = (text) => {
  const buf = Buffer.from(String(text || ''), 'utf8');
  if (!buf.length) return '';
  const hex = [...buf].map((b) => `_${b.toString(16).toUpperCase().padStart(2, '0')}`).join('');
  return `^FH^FD${hex}^FS`;
};

const barcodeBlock = () => {
  const digits = encodeCode128C(sample.barcode);
  const displayDigits = String(sample.barcode).replace(/\D/g, '');
  const moduleWidth = 3;
  const pairs = digits.length / 2;
  const w = (11 + pairs * 11 + 11 + 13) * moduleWidth;
  const x = Math.max(10, Math.floor((LABEL_WIDTH - w) / 2));
  return [
    `^FO${x},${LAYOUT.barcodeY}^BY${moduleWidth},3,${LAYOUT.barcodeHeight}^BCN,${LAYOUT.barcodeHeight},N,N,N^FD>;>8${digits}^FS`,
    `^FO0,${LAYOUT.digitsY}^FB${LABEL_WIDTH},1,0,C,0^A0N,30,28^FD${displayDigits}^FS`,
    `^FO0,${LAYOUT.sampleY}^FB${LABEL_WIDTH},1,0,C,0^A0N,24,22^FDSample ${sample.sample_code}^FS`,
    `^FO0,${LAYOUT.testY}^FB${LABEL_WIDTH},1,0,C,0^A0N,24,24^FD${sample.testLine}^FS`,
  ];
};

/** Production-like English label — proves barcode path works. */
const buildControlZpl = () => [
  '^XA',
  '^FX LIMS trial control English barcode',
  '^CI0',
  '^MTD',
  '^MD35',
  '^MNW',
  '^PR3',
  `^PW${LABEL_WIDTH}`,
  `^LL${LABEL_HEIGHT}`,
  '^LH0,0',
  '^LT0',
  '^LS0',
  '^FWN',
  '^PON',
  ...barcodeBlock(),
  `^FO0,${LAYOUT.animalY}^FB${LABEL_WIDTH},1,0,C,0^A0N,24,22^FDCamel^FS`,
  '^XZ',
].join('\n');

/**
 * Arabic name as hex under ^CI28 — file remains ASCII so Code128 is not corrupted.
 * Note: built-in ^A0N may still lack Arabic glyphs (blank name); barcode must print.
 */
const buildArabicHexZpl = () => {
  const arabicField = toZplUtf8HexField(sample.animal_name);
  return [
    '^XA',
    '^FX LIMS trial Arabic name as FH hex ASCII-safe',
    '^CI0',
    '^MTD',
    '^MD35',
    '^MNW',
    '^PR3',
    `^PW${LABEL_WIDTH}`,
    `^LL${LABEL_HEIGHT}`,
    '^LH0,0',
    '^LT0',
    '^LS0',
    '^FWN',
    '^PON',
    ...barcodeBlock(),
    '^CI28',
    arabicField
      ? `^FO0,${LAYOUT.animalY}^FB${LABEL_WIDTH},1,0,C,0^A0N,24,22${arabicField}`
      : '',
    '^XZ',
  ].filter(Boolean).join('\n');
};

const buildPreviewHtml = () => `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>تجربة ملصق — اسم الحيوان بالعربي</title>
  <style>
    body { font-family: "Segoe UI", Tahoma, sans-serif; background: #f3f4f6; padding: 24px; }
    .label {
      width: 50mm; height: 25mm; margin: 16px auto; background: #fff;
      border: 1px solid #ccc; box-sizing: border-box; padding: 2mm 1mm;
      display: flex; flex-direction: column; align-items: center; justify-content: space-between;
      font-family: Consolas, monospace; direction: ltr;
    }
    .digits { font-size: 11px; font-weight: 700; }
    .line { font-size: 9px; text-align: center; width: 100%; }
    .animal-ar { font-family: Tahoma, sans-serif; font-size: 10px; font-weight: 700; direction: rtl; }
    button { padding: 10px 18px; font-size: 14px; cursor: pointer; }
    @media print {
      body { background: #fff; padding: 0; }
      h1, p, .actions { display: none !important; }
      .label { margin: 0; border: none; }
    }
  </style>
</head>
<body>
  <h1>معاينة: ${sample.animal_name}</h1>
  <div class="label">
    <div class="digits">${sample.barcode}</div>
    <div class="line">Sample ${sample.sample_code}</div>
    <div class="line">${sample.testLine}</div>
    <div class="line animal-ar">${sample.animal_name}</div>
  </div>
  <div class="actions"><button type="button" onclick="window.print()">طباعة من المتصفح</button></div>
</body>
</html>`;

const outDir = path.join(__dirname, 'zpl-log');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const mode = controlOnly ? 'control' : 'arabic-hex';
const zpl = controlOnly ? buildControlZpl() : buildArabicHexZpl();
const zplPath = path.join(outDir, controlOnly ? 'trial-control-barcode.zpl' : 'trial-arabic-animal.zpl');
const htmlPath = path.join(outDir, 'trial-arabic-animal.html');

// Write as latin1/ascii-safe bytes only (no UTF-8 BOM, no raw Arabic bytes)
fs.writeFileSync(zplPath, Buffer.from(zpl, 'ascii'));
if (!controlOnly) fs.writeFileSync(htmlPath, buildPreviewHtml(), 'utf8');

const nonAscii = [...zpl].some((ch) => ch.charCodeAt(0) > 127);
console.log('Mode:', mode);
console.log('Animal name (source):', sample.animal_name);
console.log('ZPL ASCII-safe:', !nonAscii);
console.log('Wrote ZPL:', zplPath);
if (nonAscii) {
  console.error('ERROR: ZPL contains non-ASCII — refusing send');
  process.exit(1);
}

if (openHtml && !controlOnly) {
  try {
    spawn('cmd', ['/c', 'start', '', htmlPath], { detached: true, stdio: 'ignore' }).unref();
  } catch { /* ignore */ }
}

if (doSend) {
  const ps1 = path.join(__dirname, 'send-zebra-raw.ps1');
  execSync(
    `powershell -NoProfile -ExecutionPolicy Bypass -File "${ps1}" -ZplFile "${zplPath}"`,
    { stdio: 'inherit' }
  );
  console.log(controlOnly
    ? 'Sent CONTROL label (English Camel). Barcode must appear.'
    : 'Sent ARABIC-HEX label. Check barcode + whether Arabic glyphs appear.');
} else {
  console.log('Add --send to print. Use --control --send first to verify barcode.');
}
