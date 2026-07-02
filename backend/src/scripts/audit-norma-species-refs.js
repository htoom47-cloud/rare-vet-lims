/**
 * Species reference audit — Norma OBX-7 vs DB vs report per parameter.
 * Usage: node src/scripts/audit-norma-species-refs.js
 *        API_URL=... ADMIN_INITIAL_PASSWORD=... node src/scripts/audit-norma-species-refs.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const normaRefDebug = require('../services/norma-ref-debug.service');

async function main() {
  console.log('\n=== Norma species reference audit ===\n');
  const report = await normaRefDebug.auditAllSpecies();

  for (const block of report.species) {
    console.log(`\n--- ${block.species.toUpperCase()} (${block.status}) ---`);
    if (block.status === 'no_message') {
      console.log('  No imported Norma message found for this species.');
      continue;
    }
    console.log(`  Raw species in HL7: ${block.speciesRaw || '—'}`);
    console.log(`  Exact alias match: ${block.speciesMappedExact ? 'yes' : 'no'}`);
    console.log(`  Message ID: ${block.messageId || '—'}`);
    console.log(`  Mismatches: ${block.mismatchCount}`);

    for (const p of block.parameters || []) {
      const mark = p.mismatch ? '✗' : '✓';
      console.log(`  ${mark} ${p.parameterCode}`);
      console.log(`      Norma OBX-7:  ${p.normaObx7 || '—'}`);
      console.log(`      DB stored:    ${p.dbStored || '—'}`);
      console.log(`      Device table: ${p.deviceRefText || '—'}`);
      console.log(`      Report:       ${p.reportReference || '—'}`);
      if (p.mismatchReason) console.log(`      Reason:       ${p.mismatchReason}`);
    }
  }

  console.log(`\nTotal parameters: ${report.summary.total}, mismatches: ${report.summary.mismatches}\n`);

  const outPath = path.join(__dirname, '../../audit-norma-species-refs.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Written: ${outPath}\n`);
  process.exit(report.summary.mismatches > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
