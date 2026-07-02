const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const resultsService = require('./results.service');
const referenceRangesService = require('./reference-ranges.service');
const { mapNormaCode, DEFAULT_CBC_TEST_CODE, NORMA_CBC_PCT_BY_ABS, resolveNormaResultLimsCode } = require('../utils/norma-cbc-map');
const { barcodeLookupSql } = require('../utils/barcode-lookup');

const resultLimsCode = (row) => resolveNormaResultLimsCode(row) || row.code;

/** When Norma sends WBC + diff # only, compute % = abs / WBC × 100. */
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
  const id = String(barcode || '').trim();
  if (!id) return null;
  const result = await query(
    `SELECT s.id, s.sample_code, s.barcode, s.status, a.animal_type
     FROM samples s
     LEFT JOIN animals a ON s.animal_id = a.id
     WHERE ${barcodeLookupSql('s')}
     ORDER BY s.created_at DESC LIMIT 1`,
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

const importCbcResults = async ({ sampleId, animalType, results, testCode = DEFAULT_CBC_TEST_CODE, deviceName }) => {
  const sampleTest = await findSampleTest(sampleId, testCode);
  if (!sampleTest) {
    throw new AppError(`No ${testCode} test on this sample — add CBC to the invoice first`, 404, 'NO_CBC_TEST');
  }

  const refSync = await referenceRangesService.syncFromParsedResults({
    results,
    testCode,
    animalType: animalType || 'camel',
  });
  await referenceRangesService.syncNormaProfileForAnimal(testCode, animalType || 'camel');

  const values = [];
  const skipped = [];

  for (const row of results) {
    const param = await resolveParameter(testCode, resultLimsCode(row));
    if (!param) {
      skipped.push(row.code || row.limsCode);
      continue;
    }
    values.push({ parameter_id: param.id, value: String(row.value) });
  }

  await enrichDiffAbsFromPct(results, values, testCode);
  await enrichPctFromAbs(results, values, testCode);
  await enrichPlcFromPlt(results, values, testCode);

  if (!values.length) {
    const codes = (results || []).map((r) => r.code).join(', ') || 'none';
    throw new AppError(`No matching CBC parameters found in message (received: ${codes})`, 400, 'NO_MAPPED_PARAMS');
  }

  let mergedValues = values;
  try {
    const existingRaw = await query(
      `SELECT rv.parameter_id, rv.value
       FROM results r
       JOIN result_values rv ON rv.result_id = r.id
       WHERE r.sample_test_id = $1
         AND rv.value IS NOT NULL AND TRIM(rv.value) <> ''`,
      [sampleTest.id]
    );
    if (existingRaw.rows.length) {
      const byParam = new Map(
        existingRaw.rows.map((row) => [row.parameter_id, String(row.value)])
      );
      for (const v of values) byParam.set(v.parameter_id, v.value);
      mergedValues = [...byParam.entries()].map(([parameter_id, value]) => ({ parameter_id, value }));
    }
  } catch {
    /* first import */
  }

  const saved = await resultsService.enterResults({
    sample_test_id: sampleTest.id,
    technician_notes: `Imported from ${deviceName || 'Norma CBC'} (${new Date().toISOString()})`,
    values: mergedValues,
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
    reference_ranges_synced: refSync.updated,
    reference_ranges_skipped: refSync.skipped,
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
    animalType: sample.animal_type,
    results: parsed.results,
    testCode,
    deviceName: device?.name,
  });

  return {
    sample_id: sample.id,
    sample_code: sample.sample_code,
    barcode: parsed.sampleId,
    ...importResult,
  };
};

module.exports = { findSampleByBarcode, importFromParsed, importCbcResults };
