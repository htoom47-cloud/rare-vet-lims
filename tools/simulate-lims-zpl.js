/** Offline check — mirrors LIMS buildCbcLabelZpl v5 layout. */
const sample = {
  barcode: 'BC-260701-961938',
  sample_code: 'SMP-260701-914973',
  animal_code: 'ANM-260701-257040',
  animal_name: 'راجح',
  name_tag: 'راجح',
  panelKey: 'CBC',
  tests: [
    { category_code: 'CBC', test_code: 'CBC-FULL', test_name: 'Complete Blood Count' },
    { category_code: 'CHEM', test_code: 'CHEM-PANEL', test_name: 'Chemistry Panel' },
  ],
};

const LABEL_WIDTH = 400;
const LABEL_HEIGHT = 200;
const LAYOUT = { barcodeY: 8, barcodeHeight: 68, digitsY: 80, sampleY: 96, animalY: 112, testY: 128 };

const thermalScanDigits = (barcode) => {
  let digits = String(barcode || '').replace(/\D/g, '');
  if (digits.length % 2 === 1) digits = `0${digits}`;
  return digits;
};

const barcodeDisplayDigits = (barcode) => String(barcode || '').replace(/\D/g, '');

const content = {
  barcode: sample.barcode,
  barcodeDigits: barcodeDisplayDigits(sample.barcode),
  sampleLine: `رقم العينة: ${sample.sample_code}`,
  animalLine: `اسم الحيوان: ${sample.animal_name}`,
  testLine: 'نوع الفحص: CBC + Chemistry',
};

const digits = thermalScanDigits(content.barcode);
const zpl = `^XA
^CI28
^PW${LABEL_WIDTH}
^LL${LABEL_HEIGHT}
^FO50,${LAYOUT.barcodeY}^BY3,3,${LAYOUT.barcodeHeight}^BCN,${LAYOUT.barcodeHeight},N,N,N^FD>;>8${digits}^FS
^FO0,${LAYOUT.digitsY}^FB400,1,0,C,0^A0N,16,15^FD${content.barcodeDigits}^FS
^FO0,${LAYOUT.sampleY}^FB400,1,0,C,0^A0N,13,13^FD${content.sampleLine}^FS
^FO0,${LAYOUT.animalY}^FB400,1,0,C,0^A0N,13,12^FD${content.animalLine}^FS
^FO0,${LAYOUT.testY}^FB400,1,0,C,0^A0N,13,13^FD${content.testLine}^FS
^XZ`;

console.log('=== LIMS label v5 (expected) ===');
console.log(JSON.stringify(content, null, 2));
console.log('\n=== ZPL length ===', zpl.length);
console.log('\n=== ZPL preview ===\n', zpl);
