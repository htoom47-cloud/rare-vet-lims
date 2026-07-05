const fs = require('fs');
const path = require('path');
const { createCanvas, Image } = require('canvas');

async function main() {
  const pdfPath = process.argv[2];
  const outPath = process.argv[3];
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const page = await doc.getPage(1);
  const scale = 1.5;
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext('2d');
  const renderContext = {
    canvasContext: ctx,
    viewport,
    // pdfjs needs node-canvas Image for embedded bitmaps (logo, QR)
    image: Image,
  };
  await page.render(renderContext).promise;
  fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
  console.log('OK', outPath);
}

main().catch((e) => { console.error(e); process.exit(1); });
