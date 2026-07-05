const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const file1 = process.argv[2];
const file2 = process.argv[3];
const output = process.argv[4];

if (!file1 || !file2 || !output) {
  console.error('Usage: node compare-contacts-by-mobile.js <file1> <file2> <output.xlsx>');
  console.error('Result: rows from file2 whose mobile is NOT in file1');
  process.exit(1);
}

function normMobile(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('966') && digits.length >= 12) digits = digits.slice(3);
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 9 && digits.startsWith('5')) digits = `0${digits}`;
  if (digits.length === 10 && digits.startsWith('05')) return digits;
  if (digits.length === 9 && digits.startsWith('5')) return `0${digits}`;
  return digits;
}

function readRows(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.csv') {
    const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    const wb = XLSX.read(text, { type: 'string' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
  }
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

function findMobileKey(row) {
  const keys = Object.keys(row);
  return keys.find((k) => /جوال|mobile|phone|tel|هاتف/i.test(k)) || keys[0];
}

const rows1 = readRows(file1);
const rows2 = readRows(file2);

const key1 = findMobileKey(rows1[0] || {});
const key2 = findMobileKey(rows2[0] || {});

const set1 = new Set(
  rows1.map((r) => normMobile(r[key1])).filter(Boolean)
);

const missing = rows2.filter((r) => {
  const mobile = normMobile(r[key2]);
  return mobile && !set1.has(mobile);
});

const outWb = XLSX.utils.book_new();
const outSheet = XLSX.utils.json_to_sheet(missing.length ? missing : [{}]);
XLSX.utils.book_append_sheet(outWb, outSheet, 'غير موجود في 1');
XLSX.writeFile(outWb, output);

console.log(`File 1: ${rows1.length} rows, key="${key1}"`);
console.log(`File 2: ${rows2.length} rows, key="${key2}"`);
console.log(`In file2 but NOT in file1: ${missing.length}`);
console.log(`Saved: ${output}`);
