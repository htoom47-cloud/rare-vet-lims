const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const resultsService = require('./results.service');
const { mapNormaCode, DEFAULT_CBC_TEST_CODE } = require('../utils/norma-cbc-map');

const findSampleByBarcode = async (barcode) => {
  const id = String(barcode || '').trim();
  if (!id) return null;
  const result = await query(
    `SELECT id, sample_code, barcode, status FROM samples
     WHERE barcode = $1 OR sample_code = $1 OR sample_code ILIKE $2
     ORDER BY created_at DESC LIMIT 1`,
    [id, `%${id}%`]
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

const importCbcResults = async ({ sampleId, results, testCode = DEFAULT_CBC_TEST_CODE, deviceName }) => {
  const sampleTest = await findSampleTest(sampleId, testCode);
  if (!sampleTest) {
    throw new AppError(`No ${testCode} test on this sample — add CBC to the invoice first`, 404, 'NO_CBC_TEST');
  }

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
    throw new AppError('No matching CBC parameters found in message', 400, 'NO_MAPPED_PARAMS');
  }

  const saved = await resultsService.enterResults({
    sample_test_id: sampleTest.id,
    technician_notes: `Imported from ${deviceName || 'Norma CBC'} (${new Date().toISOString()})`,
    values,
  }, null);

  await query(
    `UPDATE samples SET status = 'running' WHERE id = $1 AND status IN ('pending', 'received')`,
    [sampleId]
  );

  return {
    sample_test_id: sampleTest.id,
    test_code: testCode,
    imported: values.length,
    skipped,
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
  });

  return {
    sample_id: sample.id,
    sample_code: sample.sample_code,
    barcode: parsed.sampleId,
    ...importResult,
  };
};

module.exports = { findSampleByBarcode, importFromParsed, importCbcResults };
