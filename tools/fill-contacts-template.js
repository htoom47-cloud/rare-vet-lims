const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const vcfPath = process.argv[2];
const templatePath = process.argv[3];
const outputPath = process.argv[4] || templatePath.replace(/\.xlsx$/i, '-filled.xlsx');

if (!vcfPath || !templatePath) {
  console.error('Usage: node fill-contacts-template.js <contacts.vcf> <template.xlsx> [output.xlsx]');
  process.exit(1);
}

function parseVcf(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const cards = text.split(/BEGIN:VCARD/i).slice(1);
  const rows = [];
  const seen = new Set();

  function normPhone(telLine) {
    const waid = telLine.match(/waid=(\d+)/i);
    let digits = waid ? waid[1] : telLine.replace(/\D/g, '');
    if (digits.startsWith('966') && digits.length >= 12) digits = `0${digits.slice(3)}`;
    else if (digits.length === 9 && digits.startsWith('5')) digits = `0${digits}`;
    return digits;
  }

  for (const card of cards) {
    const fn = (card.match(/^FN:(.+)$/m) || [])[1]?.trim();
    const telRaw = (card.match(/^TEL[^\n]*/m) || [])[0];
    if (!fn || !telRaw) continue;
    const phone = normPhone(telRaw);
    const key = `${fn}|${phone}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ name: fn, phone });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  return rows;
}

const contacts = parseVcf(vcfPath);
const workbook = XLSX.readFile(templatePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

const headerRow = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })[0] || [];
const mobileCol = headerRow.findIndex((h) => String(h).includes('جوال') || String(h).toLowerCase().includes('mobile'));
const nameCol = headerRow.findIndex((h) => String(h).includes('اسم') || String(h).toLowerCase().includes('name'));

const colMobile = mobileCol >= 0 ? mobileCol : 0;
const colName = nameCol >= 0 ? nameCol : 1;

const aoa = [headerRow.length ? headerRow : ['رقم الجوال', 'الاسم']];
for (const c of contacts) {
  const row = [];
  row[colMobile] = c.phone;
  row[colName] = c.name;
  aoa.push(row);
}

const newSheet = XLSX.utils.aoa_to_sheet(aoa);
workbook.Sheets[sheetName] = newSheet;
XLSX.writeFile(workbook, outputPath);

console.log(`Contacts: ${contacts.length}`);
console.log(`Saved: ${outputPath}`);
