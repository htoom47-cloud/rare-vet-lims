const arabicReshaper = require('arabic-reshaper');
const fs = require('fs');
const path = require('path');

const FONT = path.join(__dirname, '../../assets/fonts/NotoSansArabic-Regular.ttf');
console.log('font exists:', fs.existsSync(FONT));

const rev = (s) => s.split('').reverse().join('');
const samples = [
  'مركز رعاية النوادر البيطري',
  'تعداد الدم الكامل',
  'كريات الدم البيضاء',
];

samples.forEach((t) => {
  const shaped = arabicReshaper.convertArabic(t);
  console.log('LOGICAL:', t);
  console.log('VISUAL:', rev(shaped));
  console.log('---');
});
