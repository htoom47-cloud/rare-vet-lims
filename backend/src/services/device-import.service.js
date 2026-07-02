const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const resultsService = require('./results.service');
const { mapNormaCode, DEFAULT_CBC_TEST_CODE, NORMA_CBC_PCT_BY_ABS, resolveNormaResultLimsCode } = require('../utils/norma-cbc-map');
const { barcodeLookupSql, barcodeLookupOrderSql } = require('../utils/barcode-lookup');
const { normalizeSampleScanId } = require('../utils/barcode-scan');
const { normaReferenceNote } = require('../utils/reference-range');
const { mapNormaSpeciesToRefSpeciesExact, normalizeSpeciesKey } = require('../utils/norma-species-map');
const normaRefDebug = require('./norma-ref-debug.service');
const logger = require('../config/logger');

const resultLimsCode = (row) => resolveNormaResultLimsCode(row) || row.code;

/** Copy Norma OBX-7 notes onto enriched rows that lack them (computed % / #). */
const attachNormaNotesFromResults = (results, values, paramIdToCode) => {
  const noteByCode = new Map();
  for (const row of results) {
    const note = normaReferenceNote(row.reference);
    if (note) noteByCode.set(resultLimsCode(row), note);
  }

  for (const v of values) {
    if (v.notes) continue;
    const code = paramIdToCode.get(v.parameter_id);
    if (!code) continue;

    let note = noteByCode.get(code);
    if (!note && NORMA_CBC_PCT_BY_ABS[code]) {
      note = noteByCode.get(NORMA_CBC_PCT_BY_ABS[code]);
    }
    if (!note) {
      const absCode = Object.entries(NORMA_CBC_PCT_BY_ABS).find(([, pct]) => pct === code)?.[0];
      if (absCode) note = noteByCode.get(absCode);
    }
    if (note) v.notes = note;
  }
};

const enrichPctFromAbs = async (results, values, testCode) => {
  const byCode = Object.fromEntries(results.map((r) => [resultLimsCode(r), r]));
  const wbc = parseFloat(byCode.WBC?.value);
  if (Number.isNaN(wbc) || wbc <= 0) return values;

  const filled = new Set(
    values.filter((v) => String(v.value ?? '').trim() !== '').map((v) => v.parameter_id)
  );

  for (const [absCode, pctCode] of Object.entries(NORMA_CBC_PCT_BY_ABS)) {
    const pctParam = await resolveParameter(testCode, pctCode);
    if (!pctParam || filled.has(pctParam.id)) continue;

    const abs = parseFloat(byCode[absCode]?.value);
    if (Number.isNaN(abs)) continue;

    const computed = Math.round((abs / wbc * 100) * 10) / 10;
    values.push({ parameter_id: pctParam.id, value: String(computed) });
    filled.add(pctParam.id);
  }

  return values;
};

/** When Norma sends WBC + diff % only, compute # = WBC × % / 100. */
const enrichDiffAbsFromPct = async (results, values, testCode) => {
  const byCode = Object.fromEntries(results.map((r) => [resultLimsCode(r), r]));
  const wbc = parseFloat(byCode.WBC?.value);
  if (Number.isNaN(wbc)) return values;

  const filled = new Set(
    values.filter((v) => String(v.value ?? '').trim() !== '').map((v) => v.parameter_id)
  );

  for (const [absCode, pctCode] of Object.entries(NORMA_CBC_PCT_BY_ABS)) {
    const absParam = await resolveParameter(testCode, absCode);
    if (!absParam || filled.has(absParam.id)) continue;

    const pct = parseFloat(byCode[pctCode]?.value);
    if (Number.isNaN(pct)) continue;

    const computed = Math.round((wbc * pct / 100) * 100) / 100;
    values.push({ parameter_id: absParam.id, value: String(computed) });
    filled.add(absParam.id);
  }

  return values;
};

/** PLC-C (#) = PLT × PLC-R (%) / 100 when Norma sends ratio only. */
const enrichPlcFromPlt = async (results, values, testCode) => {
  const byCode = Object.fromEntries(results.map((r) => [resultLimsCode(r), r]));
  const plt = parseFloat(byCode.PLT?.value);
  const plcr = parseFloat(byCode['PLC-R']?.value);
  if (Number.isNaN(plt) || Number.isNaN(plcr)) return values;

  const filled = new Set(
    values.filter((v) => String(v.value ?? '').trim() !== '').map((v) => v.parameter_id)
  );

  const plcCParam = await resolveParameter(testCode, 'PLC-C');
  if (!plcCParam || filled.has(plcCParam.id)) return values;

  const computed = Math.round((plt * plcr / 100) * 100) / 100;
  values.push({ parameter_id: plcCParam.id, value: String(computed) });
  return values;
};

const findSampleByBarcode = async (barcode) => {
  const raw = String(barcode || '').trim();
  if (!raw) return null;
  const id = normalizeSampleScanId(raw) || raw;
  const result = await query(
    `SELECT s.id, s.sample_code, s.barcode, s.status, a.animal_type
     FROM samples s
     LEFT JOIN animals a ON s.animal_id = a.id
     WHERE ${barcodeLookupSql('s')}
     ORDER BY ${barcodeLookupOrderSql('s')} LIMIT 1`,
    [id]
  );
  return result.rows[0] || null;
};

const findSampleTest = async (sampleId, testCode = DEFAULT_CBC_TEST_CODE) => {
  const result = await query(
    `SELECT st.id, t.code as test_code, t.name as test_name
     FROM sample_tests st
     JOIN tests t ON st.test_id = t.id
     WHERE st.sample_id = $1 AND t.code = $2
     LIMIT 1`,
    [sampleId, testCode]
  );
  return result.rows[0] || null;
};

const resolveParameter = async (testCode, deviceCode) => {
  const limsCode = mapNormaCode(deviceCode);
  const result = await query(
    `SELECT tp.id, tp.code, tp.name
     FROM test_parameters tp
     JOIN tests t ON tp.test_id = t.id
     WHERE t.code = $1 AND tp.code = $2
     LIMIT 1`,
    [testCode, limsCode]
  );
  return result.rows[0] || null;
};

const resolveNormaSpecies = (parsed, limsAnimalType) => {
  const raw = parsed?.animalTypeRaw || parsed?.animalType || null;
  const exact = mapNormaSpeciesToRefSpeciesExact(raw);
  if (exact) return { species: exact, speciesRaw: raw, exactMatch: true };
  const normalized = normalizeSpeciesKey(raw);
  if (normalized) {
    return { species: normalized, speciesRaw: raw, exactMatch: false };
  }
  if (limsAnimalType) {
    return {
      species: mapNormaSpeciesToRefSpeciesExact(limsAnimalType) || limsAnimalType,
      speciesRaw: raw,
      exactMatch: Boolean(mapNormaSpeciesToRefSpeciesExact(limsAnimalType)),
    };
  }
  return { species: null, speciesRaw: raw, exactMatch: false };
};

const importCbcResults = async ({
  sampleId, results, testCode = DEFAULT_CBC_TEST_CODE, deviceName, parsed,
}) => {
  const sampleTest = await findSampleTest(sampleId, testCode);
  if (!sampleTest) {
    throw new AppError(`No ${testCode} test on this sample — add CBC to the invoice first`, 404, 'NO_CBC_TEST');
  }

  const sampleRow = await query(
    'SELECT a.animal_type FROM samples s JOIN animals a ON a.id = s.animal_id WHERE s.id = $1',
    [sampleId]
  );
  const limsAnimalType = sampleRow.rows[0]?.animal_type || null;
  const { species, speciesRaw, exactMatch } = resolveNormaSpecies(parsed, limsAnimalType);

  if (!exactMatch && speciesRaw) {
    logger.warn('Norma species not in exact alias table — storing raw species key', {
      speciesRaw,
      resolved: species,
      sampleId,
    });
  }

  normaRefDebug.logImportDebug(results, species, speciesRaw);

  const values = [];
  const skipped = [];
  const paramIdToCode = new Map();

  for (const row of results) {
    const limsCode = resultLimsCode(row);
    const param = await resolveParameter(testCode, limsCode);
    if (!param) {
      skipped.push(row.code || row.limsCode);
      continue;
    }
    paramIdToCode.set(param.id, limsCode);
    const refNote = normaReferenceNote(row.reference);
    values.push({
      parameter_id: param.id,
      value: String(row.value),
      notes: refNote || undefined,
      device_flag: row.flag || undefined,
    });
  }

  await enrichDiffAbsFromPct(results, values, testCode);
  await enrichPctFromAbs(results, values, testCode);
  await enrichPlcFromPlt(results, values, testCode);
  attachNormaNotesFromResults(results, values, paramIdToCode);

  if (!values.length) {
    const codes = (results || []).map((r) => r.code).join(', ') || 'none';
    throw new AppError(`No matching CBC parameters found in message (received: ${codes})`, 400, 'NO_MAPPED_PARAMS');
  }

  let mergedValues = values;
  try {
    const existingRaw = await query(
      `SELECT rv.parameter_id, rv.value, rv.notes
       FROM results r
       JOIN result_values rv ON rv.result_id = r.id
       WHERE r.sample_test_id = $1
         AND rv.value IS NOT NULL AND TRIM(rv.value) <> ''`,
      [sampleTest.id]
    );
    if (existingRaw.rows.length) {
      const byParam = new Map(
        existingRaw.rows.map((row) => [
          row.parameter_id,
          { value: String(row.value), notes: row.notes || null },
        ])
      );
      for (const v of values) {
        const prev = byParam.get(v.parameter_id);
        byParam.set(v.parameter_id, {
          value: v.value,
          notes: v.notes != null ? v.notes : (prev?.notes ?? null),
          device_flag: v.device_flag,
        });
      }
      mergedValues = [...byParam.entries()].map(([parameter_id, { value, notes, device_flag }]) => ({
        parameter_id,
        value,
        ...(notes ? { notes } : {}),
        ...(device_flag ? { device_flag } : {}),
      }));
    }
  } catch {
    /* first import */
  }

  const saved = await resultsService.enterResults({
    sample_test_id: sampleTest.id,
    technician_notes: `Imported from ${deviceName || 'Norma CBC'} (${new Date().toISOString()})`,
    values: mergedValues,
    from_norma: true,
  }, null);

  await query(
    `UPDATE samples SET status = 'running' WHERE id = $1 AND status IN ('pending', 'received')`,
    [sampleId]
  );

  return {
    sample_test_id: sampleTest.id,
    test_code: testCode,
    imported: mergedValues.length,
    added: values.length,
    skipped,
    reference_animal_type: species,
    norma_animal_type: species,
    norma_species_raw: speciesRaw,
    species_exact_match: exactMatch,
    lims_animal_type: limsAnimalType,
    species_mismatch: Boolean(speciesRaw && limsAnimalType && species !== limsAnimalType),
    result: saved,
  };
};

const importFromParsed = async (parsed, device) => {
  const testCode = device?.config?.test_code || DEFAULT_CBC_TEST_CODE;
  const sample = await findSampleByBarcode(parsed.sampleId);

  if (!sample) {
    throw new AppError(`Sample not found for barcode: ${parsed.sampleId}`, 404, 'SAMPLE_NOT_FOUND');
  }

  const importResult = await importCbcResults({
    sampleId: sample.id,
    results: parsed.results,
    testCode,
    deviceName: device?.name,
    parsed,
  });

  return {
    sample_id: sample.id,
    sample_code: sample.sample_code,
    barcode: parsed.sampleId,
    ...importResult,
  };
};

module.exports = { findSampleByBarcode, importFromParsed, importCbcResults };
