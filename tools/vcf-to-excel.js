const fs = require('fs');
const path = require('path');

const input = process.argv[2];
const output = process.argv[3];

if (!input || !output) {
  console.error('Usage: node vcf-to-excel.js <input.vcf> <output.csv>');
  process.exit(1);
}

const text = fs.readFileSync(input, 'utf8');
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

const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
const lines = ['\uFEFFالاسم,رقم الجوال', ...rows.map((r) => `${esc(r.name)},${esc(r.phone)}`)];
fs.writeFileSync(output, lines.join('\r\n'), 'utf8');

console.log(`Contacts: ${rows.length}`);
console.log(`Saved: ${output}`);
