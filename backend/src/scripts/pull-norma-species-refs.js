/**
 * Pull Norma OBX-7 reference ranges into test_reference_ranges for every animal type.
 *
 * Uses the latest successful Norma import per species (camel, horse, sheep, goat).
 * Run one CBC per species on Norma (select species on device before run) so HL7 carries that profile.
 *
 * Usage:
 *   node src/scripts/pull-norma-species-refs.js
 *   node src/scripts/pull-norma-species-refs.js --export
 *   node src/scripts/pull-norma-species-refs.js horse
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { query, pool } = require('../config/database');
const { ANIMAL_TYPE_CODES, ANIMAL_TYPE_LABELS } = require('../constants/animal-types');
const { syncFromParsedResults } = require('../services/reference-ranges.service');
const { extractRefProfileFromResults, countRefsInResults } = require('../utils/norma-ref-extract');
const { mapNormaSpeciesToLims } = require('../utils/norma-species-map');
const logger = require('../config/logger');

const DEFAULT_TEST_CODE = 'CBC-FULL';
const SPECIES_CODES = ANIMAL_TYPE_CODES.filter((c) => c !== 'other');

const parseJson = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
};

const resolveMessageAnimalType = (parsed, limsAnimalType) => {
  const imp = parsed?.import || {};
  const candidates = [
    imp.reference_animal_type,
    parsed?.animalType,
    imp.norma_animal_type,
    mapNormaSpeciesToLims(parsed?.animalType),
    limsAnimalType,
  ];
  for (const raw of candidates) {
    const mapped = mapNormaSpeciesToLims(raw) || (SPECIES_CODES.includes(raw) ? raw : null);
    if (mapped) return mapped;
  }
  return null;
};

const loadLatestNormaImports = async () => {
  const rows = await query(
    `SELECT dm.id, dm.created_at, dm.parsed_data, dm.sample_id,
            s.animal_type AS lims_animal_type, s.sample_code
     FROM device_messages dm
     JOIN device_integrations di ON di.id = dm.device_id
     LEFT JOIN samples s ON s.id = dm.sample_id
     WHERE di.name ILIKE '%norma%'
       AND dm.status = 'imported'
       AND dm.parsed_data IS NOT NULL
     ORDER BY dm.created_at DESC`
  );

  const latestBySpecies = new Map();
  for (const row of rows.rows) {
    const parsed = parseJson(row.parsed_data);
    if (!parsed?.results?.length) continue;
    if (!countRefsInResults(parsed.results)) continue;

    const animalType = resolveMessageAnimalType(parsed, row.lims_animal_type);
    if (!animalType || animalType === 'other') continue;
    if (latestBySpecies.has(animalType)) continue;

    latestBySpecies.set(animalType, {
      messageId: row.id,
      createdAt: row.created_at,
      sampleCode: row.sample_code || parsed.sampleId || '—',
      animalType,
      parsed,
      refCount: countRefsInResults(parsed.results),
      profile: extractRefProfileFromResults(parsed.results),
    });
  }
  return latestBySpecies;
};

const formatExportBlock = (profiles) => {
  const lines = ['const NORMA_CBC_REFERENCES = {'];
  for (const [species, profile] of Object.entries(profiles)) {
    lines.push(`  ${species}: {`);
    for (const [code, ref] of Object.entries(profile)) {
      lines.push(`    ${JSON.stringify(code)}: mk(${ref.min}, ${ref.max}),`);
    }
    lines.push('  },');
  }
  lines.push('};');
  return lines.join('\n');
};

async function main() {
  const args = process.argv.slice(2);
  const exportOnly = args.includes('--export');
  const filterSpecies = args.find((a) => !a.startsWith('--') && SPECIES_CODES.includes(a.toLowerCase()));

  const latestBySpecies = await loadLatestNormaImports();
  const targets = filterSpecies ? [filterSpecies.toLowerCase()] : SPECIES_CODES;

  console.log('\n=== Norma reference pull (OBX-7 per species) ===\n');

  const exported = {};
  let totalUpdated = 0;

  for (const species of targets) {
    const label = ANIMAL_TYPE_LABELS[species]?.ar || species;
    const entry = latestBySpecies.get(species);

    if (!entry) {
      console.log(`  ✗ ${species} (${label}) — لا توجد رسالة Norma مستوردة بهذا النوع`);
      console.log('      → شغّل CBC على Norma بعد اختيار نفس نوع الحيوان في الجهاز');
      continue;
    }

    exported[species] = entry.profile;

    if (exportOnly) {
      console.log(`  • ${species} (${label}) — ${entry.refCount} معدلات من ${entry.sampleCode} @ ${entry.createdAt.toISOString()}`);
      continue;
    }

    const sync = await syncFromParsedResults({
      results: entry.parsed.results,
      testCode: DEFAULT_TEST_CODE,
      animalType: species,
      overwriteNorma: true,
    });

    totalUpdated += sync.updated;
    console.log(
      `  ✓ ${species} (${label}) — ${sync.updated} محدّث، ${sync.skipped} متخطى`
      + ` | ${entry.refCount} في HL7 | عينة ${entry.sampleCode}`
    );
  }

  if (exportOnly) {
    console.log('\n--- Export (paste into norma-cbc-references.js) ---\n');
    console.log(formatExportBlock(exported));
    return;
  }

  console.log(`\n=== تم — ${totalUpdated} معدل محفوظ في قاعدة البيانات ===`);

  const missing = targets.filter((s) => !latestBySpecies.has(s));
  if (missing.length) {
    console.log('\nأنواع لم تُجلب بعد:', missing.join(', '));
    console.log('لكل نوع: سجّل عينة في LIMS → اختر نفس النوع على Norma → شغّل CBC → أعد هذا السكربت.');
  }
}

main()
  .catch((err) => {
    logger.error('pull-norma-species-refs failed', { error: err.message });
    process.exit(1);
  })
  .finally(() => pool.end());
