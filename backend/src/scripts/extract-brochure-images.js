/**
 * Extract homepage images from lab-profile.pdf (full-page raster per page).
 * Usage: node src/scripts/extract-brochure-images.js [pdfPath] [outDir]
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function getPageRgba(doc, pageNum) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const page = await doc.getPage(pageNum);
  const ops = await page.getOperatorList();
  const { OPS } = pdfjs;

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    if (fn !== OPS.paintImageXObject && fn !== OPS.paintInlineImageXObject) continue;

    const img = await new Promise((resolve, reject) => {
      if (fn === OPS.paintImageXObject) {
        page.objs.get(ops.argsArray[i][0], resolve, reject);
      } else {
        resolve(ops.argsArray[i][0]);
      }
    });

    if (!img?.data || !img.width || !img.height) continue;

    const channels = img.kind === 2 ? 3 : 4;
    return sharp(Buffer.from(img.data), {
      raw: { width: img.width, height: img.height, channels },
    }).png().toBuffer();
  }

  throw new Error(`No raster image on page ${pageNum}`);
}

async function main() {
  const pdfPath = process.argv[2] || path.join(__dirname, '../../../frontend-portal/public/lab-profile.pdf');
  const outDir = process.argv[3] || path.join(__dirname, '../../../frontend-portal/public/images');
  const animalsDir = path.join(outDir, 'animals');
  fs.mkdirSync(animalsDir, { recursive: true });

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;

  const page1 = await getPageRgba(doc, 1);
  const page2 = await getPageRgba(doc, 2);
  const meta1 = await sharp(page1).metadata();
  const w = meta1.width;
  const h = meta1.height;

  // Crops aligned to the official brochure artwork (1376×768 source pages).
  const crops = [
    { file: 'lab-hero-bg.jpg', buf: page1, extract: { left: 0, top: 0, width: w, height: Math.round(h * 0.82) } },
    { file: 'animals/horse.jpg', buf: page1, extract: { left: Math.round(w * 0.72), top: Math.round(h * 0.1), width: Math.round(w * 0.27), height: Math.round(h * 0.82) } },
    { file: 'animals/camel.jpg', buf: page1, extract: { left: Math.round(w * 0.47), top: Math.round(h * 0.17), width: Math.round(w * 0.24), height: Math.round(h * 0.76) } },
    // Page 2 has no sheep photo — use the desert caravan (livestock/herd) from the brochure.
    { file: 'animals/sheep.jpg', buf: page2, extract: { left: Math.round(w * 0.52), top: Math.round(h * 0.74), width: Math.round(w * 0.44), height: Math.round(h * 0.22) } },
    { file: 'lab-bg-texture.jpg', buf: page1, extract: { left: 0, top: 0, width: w, height: Math.round(h * 0.55) } },
  ];

  for (const { file, buf, extract } of crops) {
    const out = path.join(outDir, file);
    await sharp(buf)
      .extract(extract)
      .jpeg({ quality: 90, mozjpeg: true })
      .toFile(out);
    console.log('OK', file, fs.statSync(out).size);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
