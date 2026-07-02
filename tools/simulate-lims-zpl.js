/** Offline check — same fields as LIMS buildCbcLabelZpl (no imports). */
const sample = {
  barcode: 'BC-260701-961938',
  sample_code: 'SMP-260701-123456',
  animal_code: 'ANM-260701-257040',
  animal_name: 'Test Camel',
  panelKey: 'CBC',
  tests: [{ category_code: 'CBC', test_code: 'CBC-FULL' }],
};

const barcode = String(sample.barcode || sample.sample_code || '').trim();
const animalLine = [sample.animal_code, sample.animal_name].filter(Boolean).join(' · ');
const panelKey = sample.panelKey || 'OTHER';

const zpl = `^XA
^CI28
^MTD
^MD30
^MNY
^MMT
^PW400
^LL200
^LH0,0
^LT0
^LS0
^FWN
^PON
^FO50,20^BY1.5,2,20^BCN,20,N,N,N^FD${barcode}^FS
^FO0,46^FB400,1,0,C,0^A0N,20,18^FD${barcode}^FS
^FO0,68^FB400,1,0,C,0^A0N,20,18^FDCBC^FS
^FO0,90^FB400,1,0,C,0^A0N,20,18^FD${sample.animal_code}^FS
^XZ`;

console.log('=== LIMS label fields (expected) ===');
console.log(JSON.stringify({ barcode, animalLine, panelKey }, null, 2));
console.log('\n=== ZPL length ===', zpl.length);
console.log('\n=== ZPL ===\n', zpl);
