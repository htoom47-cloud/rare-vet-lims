const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const resultsService = require('./results.service');
const referenceRangesService = require('./reference-ranges.service');
const { mapNormaCode, DEFAULT_CBC_TEST_CODE } = require('../utils/norma-cbc-map');

const findSampleByBarcode = async (barcode) => {
  const id = String(barcode || '').trim();
  if (!id) return null;
  const result = await query(
    `SELECT s.id, s.sample_code, s.barcode, s.status, a.animal_type
     FROM samples s
     LEFT JOIN animals a ON s.animal_id = a.id
     WHERE s.barcode = $1 OR s.sample_code = $1 OR s.barcode ILIKE $2 OR s.sample_code ILIKE $2
     ORDER BY s.created_at DESC LIMIT 1`,
    [id, id]
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
    const param = await resolveParameter(testCode, row.code);
    if (!param) {
      skipped.push(row.code);
      continue;
    }
    values.push({ parameter_id: param.id, value: String(row.value) });
  }

  if (!values.length) {
    const codes = (results || []).map((r) => r.code).join(', ') || 'none';
    throw new AppError(`No matching CBC parameters found in message (received: ${codes})`, 400, 'NO_MAPPED_PARAMS');
  }

  let mergedValues = values;
  try {
    const existing = await resultsService.getBySampleTest(sampleTest.id);
    if (existing?.values?.length) {
      const byParam = new Map(
        existing.values
          .filter((v) => v.value != null && String(v.value).trim() !== '')
          .map((v) => [v.parameter_id, String(v.value)])
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
