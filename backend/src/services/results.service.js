const path = require('path');
const { query, getClient } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const {
  compareByNormaOrder,
  getNormaPanelRow,
  DEFAULT_CBC_TEST_CODE,
} = require('../utils/norma-cbc-map');
const resultEngine = require('./result-engine.service');
const { getLimsReferenceRange, LIMS_REF_SELECT_SQL, limsRefLateralJoin } = require('./reference-ranges.service');
const { mapRawRowsToCbcDisplay, enrichCbcReferences } = require('./cbc-result-display.service');
const { uuidv4 } = require('../utils/uuid');
const { saveFile, deleteFile } = require('../config/storage');
const { normalizeMicroscopeImage } = require('../utils/image-normalize');
const autoInvoice = require('./auto-invoice.service');

const formatQualValue = (value, unit) => {
  if (unit !== 'qual' || !value) return value;
  const normalized = resultEngine.normalizeResultValue(value, resultEngine.VALUE_TYPES.QUAL);
  return normalized.displayValue ?? value;
};

const getAttachments = async (resultId) => {
  const result = await query(
    `SELECT ra.*, u.full_name as uploaded_by_name
     FROM result_attachments ra
     LEFT JOIN users u ON ra.uploaded_by = u.id
     WHERE ra.result_id = $1
     ORDER BY ra.sort_order, ra.created_at`,
    [resultId]
  );
  return result.rows;
};

const formatCbcResultValues = (rawValues) => mapRawRowsToCbcDisplay(rawValues);

const resolveResultReference = (row) => {
  const evaluated = resultEngine.evaluateResult(row);
  return evaluated.reference || null;
};

const getBySampleTest = async (sampleTestId) => {
  const result = await query(
    `SELECT r.id AS result_id, r.sample_test_id, r.is_validated, r.doctor_notes, r.technician_notes, r.has_critical,
            rv.parameter_id, rv.value, rv.numeric_value, rv.flag, rv.is_critical, rv.notes AS rv_notes,
            tp.name AS parameter_name, tp.name_ar AS parameter_name_ar, tp.code AS parameter_code, tp.unit, tp.sort_order,
            t.code AS test_code,
            a.animal_type, a.gender AS animal_gender, a.age AS animal_age,
            ${LIMS_REF_SELECT_SQL}
     FROM results r
     LEFT JOIN result_values rv ON r.id = rv.result_id
     LEFT JOIN test_parameters tp ON rv.parameter_id = tp.id
     LEFT JOIN sample_tests st ON r.sample_test_id = st.id
     JOIN tests t ON st.test_id = t.id
     JOIN samples s ON st.sample_id = s.id
     JOIN animals a ON s.animal_id = a.id
     ${limsRefLateralJoin()}
     WHERE r.sample_test_id = $1
     ORDER BY tp.sort_order, tp.id`,
    [sampleTestId]
  );

  if (!result.rows.length) return null;

  const head = result.rows[0];
  const seen = new Set();
  const values = [];
  for (const row of result.rows) {
    if (!row.parameter_id || seen.has(row.parameter_id)) continue;
    seen.add(row.parameter_id);
    const panelRow = getNormaPanelRow(row.parameter_code);
    values.push({
      parameter_id: row.parameter_id,
      parameter_name: panelRow?.symbol || row.parameter_name,
      parameter_name_ar: row.parameter_name_ar,
      parameter_code: row.parameter_code,
      norma_section: panelRow?.section || null,
      value: row.value,
      numeric_value: row.numeric_value,
      unit: row.unit,
      flag: row.flag,
      is_critical: row.is_critical,
      reference: resolveResultReference(row),
      sort_order: row.sort_order,
    });
  }

  const isCbc = head.test_code === DEFAULT_CBC_TEST_CODE;
  let sortedValues = isCbc
    ? formatCbcResultValues(values)
    : values.sort(compareByNormaOrder);

  if (isCbc) {
    sortedValues = await enrichCbcReferences(sortedValues, {
      animal_type: head.animal_type,
      gender: head.animal_gender,
      age: head.animal_age,
    });
  }

  return {
    id: head.result_id,
    sample_test_id: sampleTestId,
    is_validated: head.is_validated,
    doctor_notes: head.doctor_notes,
    technician_notes: head.technician_notes,
    has_critical: head.has_critical,
    values: sortedValues,
    attachments: await getAttachments(head.result_id),
  };
};

const enterResults = async (data, userId) => {
  const client = await getClient();
  let committed = false;
  try {
    await client.query('BEGIN');

    const stResult = await client.query(
      `SELECT st.*, s.animal_id, a.animal_type, a.gender, a.age
       FROM sample_tests st
       JOIN samples s ON st.sample_id = s.id
       JOIN animals a ON s.animal_id = a.id WHERE st.id = $1`,
      [data.sample_test_id]
    );

    if (!stResult.rows[0]) throw new AppError('Sample test not found', 404, 'NOT_FOUND');

    const { animal_type, gender, age } = stResult.rows[0];
    let hasCritical = false;

    let resultId;
    const existing = await client.query('SELECT id FROM results WHERE sample_test_id = $1', [data.sample_test_id]);

    if (existing.rows[0]) {
      resultId = existing.rows[0].id;
      const validatedRow = await client.query(
        'SELECT is_validated FROM results WHERE id = $1',
        [resultId]
      );
      if (validatedRow.rows[0]?.is_validated) {
        if (!data.allow_validated_edit) {
          throw new AppError('Results are approved — unapprove first or use edit permission', 403, 'VALIDATED_LOCKED');
        }
        await client.query(
          `UPDATE results SET is_validated = false, validated_by = NULL, validated_at = NULL WHERE id = $1`,
          [resultId]
        );
        await client.query(
          `UPDATE sample_tests SET status = 'running', completed_at = NULL WHERE id = $1`,
          [data.sample_test_id]
        );
        const stRow = await client.query(
          'SELECT sample_id FROM sample_tests WHERE id = $1',
          [data.sample_test_id]
        );
        await client.query(
          `UPDATE samples SET status = 'running', completed_date = NULL, updated_at = NOW()
           WHERE id = $1 AND status = 'completed'`,
          [stRow.rows[0].sample_id]
        );
      }
      await client.query('DELETE FROM result_values WHERE result_id = $1', [resultId]);
      await client.query(
        `UPDATE results SET technician_notes = $1, entered_by = $2, updated_at = NOW() WHERE id = $3`,
        [data.technician_notes ?? null, userId, resultId]
      );
    } else {
      resultId = uuidv4();
      await client.query(
        `INSERT INTO results (id, sample_test_id, entered_by, technician_notes) VALUES ($1, $2, $3, $4)`,
        [resultId, data.sample_test_id, userId, data.technician_notes ?? null]
      );
    }

    for (const val of data.values) {
      const raw = String(val.value ?? '').trim();

      const paramMeta = await client.query(
        'SELECT unit, code FROM test_parameters WHERE id = $1',
        [val.parameter_id]
      );
      const unit = paramMeta.rows[0]?.unit;
      const parameterCode = paramMeta.rows[0]?.code;
      const range = await getLimsReferenceRange(val.parameter_id, animal_type, {
        sex: gender,
        age,
      });

      const evaluated = resultEngine.evaluateResult(
        { value: raw, unit, parameter_code: parameterCode },
        { referenceRange: range ? {
          source: 'lims',
          min_value: range.min_value,
          max_value: range.max_value,
          critical_low: range.critical_low,
          critical_high: range.critical_high,
          text_reference: range.text_reference,
          notes: range.notes,
        } : null }
      );

      const storeFlag = evaluated.flag === resultEngine.RESULT_FLAGS.CRITICAL
        ? (evaluated.detailFlag || resultEngine.RESULT_FLAGS.CRIT_HIGH)
        : (evaluated.detailFlag || evaluated.flag || '');
      if (evaluated.isCritical) hasCritical = true;

      const storeValue = unit === 'qual'
        ? (evaluated.displayValue ?? raw)
        : (evaluated.value ?? raw);

      await client.query(
        `INSERT INTO result_values (id, result_id, parameter_id, value, numeric_value, flag, is_critical, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          uuidv4(),
          resultId,
          val.parameter_id,
          storeValue,
          evaluated.numericValue,
          storeFlag === resultEngine.RESULT_FLAGS.NORMAL_WITHOUT_REF ? '' : storeFlag,
          evaluated.isCritical,
          val.notes ?? null,
        ]
      );
    }

    await client.query(
      `UPDATE results SET has_critical = $1 WHERE id = $2`,
      [hasCritical, resultId]
    );

    await client.query(
      `UPDATE sample_tests SET status = 'running', technician_id = $1, started_at = COALESCE(started_at, NOW()) WHERE id = $2`,
      [userId, data.sample_test_id]
    );

    await client.query(
      `UPDATE samples SET status = 'running', updated_at = NOW()
       WHERE id = (SELECT sample_id FROM sample_tests WHERE id = $1) AND status IN ('received', 'pending')`,
      [data.sample_test_id]
    );

    await client.query('COMMIT');
    committed = true;
    const stRow2 = await client.query('SELECT sample_id FROM sample_tests WHERE id = $1', [data.sample_test_id]);
    if (stRow2.rows[0]?.sample_id) {
      const lifecycle = require('./report-lifecycle.service');
      await lifecycle.markReportsNeedsUpdateBySampleId(stRow2.rows[0].sample_id, 'RESULTS');
    }
    return getBySampleTest(data.sample_test_id);
  } catch (err) {
    if (!committed) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    }
    throw err;
  } finally {
    client.release();
  }
};

const validateResults = async (sampleTestId, userId, doctorNotes, values) => {
  if (values?.length) {
    await enterResults({ sample_test_id: sampleTestId, values }, userId);
  }
  const result = await query(
    `UPDATE results SET is_validated = true, validated_by = $1, validated_at = NOW(), doctor_notes = $2
     WHERE sample_test_id = $3 RETURNING *`,
    [userId, doctorNotes, sampleTestId]
  );

  if (!result.rows[0]) throw new AppError('Results not found', 404, 'NOT_FOUND');

  await query(
    `UPDATE sample_tests SET status = 'completed', completed_at = NOW() WHERE id = $1`,
    [sampleTestId]
  );

  const st = await query('SELECT sample_id FROM sample_tests WHERE id = $1', [sampleTestId]);
  const sampleId = st.rows[0].sample_id;
  const pending = await query(
    `SELECT COUNT(*) FROM sample_tests WHERE sample_id = $1 AND status NOT IN ('completed', 'cancelled')`,
    [sampleId]
  );

  if (parseInt(pending.rows[0].count, 10) === 0) {
    await query(`UPDATE samples SET status = 'completed', completed_date = NOW(), updated_at = NOW() WHERE id = $1`, [sampleId]);
    await autoInvoice.tryAutoInvoice(sampleId, userId, 'validation');
  }

  const lifecycle = require('./report-lifecycle.service');
  await lifecycle.markReportsNeedsUpdateBySampleId(sampleId, 'VALIDATION');

  return getBySampleTest(sampleTestId);
};

const unvalidateResults = async (sampleTestId) => {
  const client = await getClient();
  let committed = false;
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE results
       SET is_validated = false, validated_by = NULL, validated_at = NULL
       WHERE sample_test_id = $1 AND is_validated = true
       RETURNING id`,
      [sampleTestId]
    );
    if (!result.rows[0]) {
      throw new AppError('Validated results not found', 404, 'NOT_FOUND');
    }

    await client.query(
      `UPDATE sample_tests SET status = 'running', completed_at = NULL WHERE id = $1`,
      [sampleTestId]
    );

    const st = await client.query('SELECT sample_id FROM sample_tests WHERE id = $1', [sampleTestId]);
    await client.query(
      `UPDATE samples SET status = 'running', completed_date = NULL, updated_at = NOW()
       WHERE id = $1 AND status = 'completed'`,
      [st.rows[0].sample_id]
    );

    await client.query('COMMIT');
    committed = true;
    if (st.rows[0]?.sample_id) {
      const lifecycle = require('./report-lifecycle.service');
      await lifecycle.markReportsNeedsUpdateBySampleId(st.rows[0].sample_id, 'RESULTS');
    }
    return getBySampleTest(sampleTestId);
  } catch (err) {
    if (!committed) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    }
    throw err;
  } finally {
    client.release();
  }
};

const approveBatch = async (items, userId) => {
  const approved = [];
  for (const item of items) {
    await enterResults(item, userId);
    approved.push(await validateResults(item.sample_test_id, userId, item.doctor_notes ?? ''));
  }
  return approved;
};

const getPreviousResults = async (animalId, parameterId, limit = 5) => {
  const result = await query(
    `SELECT rv.value, rv.numeric_value, rv.flag, r.created_at, s.sample_code, tp.name as parameter_name
     FROM result_values rv
     JOIN results r ON rv.result_id = r.id
     JOIN sample_tests st ON r.sample_test_id = st.id
     JOIN samples s ON st.sample_id = s.id
     JOIN test_parameters tp ON rv.parameter_id = tp.id
     WHERE s.animal_id = $1 AND rv.parameter_id = $2 AND r.is_validated = true
     ORDER BY r.created_at DESC LIMIT $3`,
    [animalId, parameterId, limit]
  );
  return result.rows;
};

const getCriticalAlerts = async () => {
  const result = await query(
    `SELECT r.*, s.sample_code, c.full_name as customer_name, a.animal_code, t.name as test_name
     FROM results r
     JOIN sample_tests st ON r.sample_test_id = st.id
     JOIN samples s ON st.sample_id = s.id
     JOIN customers c ON s.customer_id = c.id
     JOIN animals a ON s.animal_id = a.id
     JOIN tests t ON st.test_id = t.id
     WHERE r.has_critical = true AND r.is_validated = false
     ORDER BY r.created_at DESC`
  );
  return result.rows;
};

const ensureResultId = async (client, sampleTestId, userId) => {
  const existing = await client.query('SELECT id FROM results WHERE sample_test_id = $1', [sampleTestId]);
  if (existing.rows[0]) return existing.rows[0].id;

  const resultId = uuidv4();
  await client.query(
    `INSERT INTO results (id, sample_test_id, entered_by) VALUES ($1, $2, $3)`,
    [resultId, sampleTestId, userId]
  );
  return resultId;
};

const addAttachment = async (sampleTestId, file, userId, { caption, parameter_id } = {}) => {
  const client = await getClient();
  let committed = false;
  try {
    await client.query('BEGIN');
    const st = await client.query('SELECT id FROM sample_tests WHERE id = $1', [sampleTestId]);
    if (!st.rows[0]) throw new AppError('Sample test not found', 404, 'NOT_FOUND');

    if (!file?.buffer?.length) {
      throw new AppError('Empty or unreadable image file', 400, 'VALIDATION_ERROR');
    }

    const resultId = await ensureResultId(client, sampleTestId, userId);
    let safeName = file.originalname || file.mimetype?.replace('/', '.') || 'microscope.jpg';
    if (!path.extname(safeName)) {
      const mime = String(file.mimetype || '').toLowerCase();
      const ext = mime.includes('png') ? '.png'
        : mime.includes('webp') ? '.webp'
          : mime.includes('gif') ? '.gif'
            : mime.includes('heic') ? '.heic'
              : mime.includes('heif') ? '.heif'
                : '.jpg';
      safeName = `${safeName}${ext}`;
    }

    let normalized;
    try {
      normalized = await normalizeMicroscopeImage(file.buffer, safeName);
    } catch (normErr) {
      throw new AppError(normErr.message || 'Unsupported image format', 400, 'VALIDATION_ERROR');
    }

    let saved;
    try {
      saved = await saveFile(normalized.buffer, 'microscope', normalized.filename);
    } catch (storageErr) {
      throw new AppError(
        `Could not store microscope image: ${storageErr.message}`,
        500,
        'STORAGE_ERROR'
      );
    }

    const paramId = parameter_id && String(parameter_id).trim() ? String(parameter_id).trim() : null;

    const attachmentId = uuidv4();
    await client.query(
      `INSERT INTO result_attachments (id, result_id, parameter_id, file_url, caption, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [attachmentId, resultId, paramId, saved.url, caption || null, userId]
    );

    await client.query(
      `UPDATE sample_tests SET status = 'running', technician_id = $1, started_at = COALESCE(started_at, NOW()) WHERE id = $2`,
      [userId, sampleTestId]
    );

    await client.query('COMMIT');
    committed = true;
    return getBySampleTest(sampleTestId);
  } catch (err) {
    if (!committed) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    }
    if (err.code === '42P01') {
      throw new AppError('Image attachments table is missing — contact admin to run migration', 503, 'SCHEMA_MISSING');
    }
    if (err.code === '22P02') {
      throw new AppError('Invalid parasite parameter for this image', 400, 'VALIDATION_ERROR');
    }
    if (err.code === '23503') {
      throw new AppError('Invalid parasite parameter for this image', 400, 'VALIDATION_ERROR');
    }
    if (err.isOperational) throw err;
    throw new AppError('Could not attach microscope image', 500, 'UPLOAD_FAILED');
  } finally {
    client.release();
  }
};

const removeAttachment = async (attachmentId) => {
  const existing = await query('SELECT file_url FROM result_attachments WHERE id = $1', [attachmentId]);
  if (!existing.rows[0]) throw new AppError('Attachment not found', 404, 'NOT_FOUND');

  await deleteFile(existing.rows[0].file_url);
  await query('DELETE FROM result_attachments WHERE id = $1', [attachmentId]);
  return { deleted: true };
};

const updateAttachment = async (attachmentId, { caption, include_in_report }) => {
  const existing = await query('SELECT id FROM result_attachments WHERE id = $1', [attachmentId]);
  if (!existing.rows[0]) throw new AppError('Attachment not found', 404, 'NOT_FOUND');

  const result = await query(
    `UPDATE result_attachments
     SET caption = COALESCE($1, caption),
         include_in_report = COALESCE($2, include_in_report)
     WHERE id = $3 RETURNING *`,
    [caption, include_in_report, attachmentId]
  );

  const sampleRow = await query(
    `SELECT st.sample_id
     FROM result_attachments ra
     JOIN results res ON res.id = ra.result_id
     JOIN sample_tests st ON st.id = res.sample_test_id
     WHERE ra.id = $1`,
    [attachmentId]
  );
  if (sampleRow.rows[0]?.sample_id) {
    const lifecycle = require('./report-lifecycle.service');
    await lifecycle.markReportsNeedsUpdateBySampleId(sampleRow.rows[0].sample_id, 'ATTACHMENTS');
  }

  return result.rows[0];
};

const clearSampleTestResults = async (sampleTestId) => {
  const st = await query(
    `SELECT st.id, st.sample_id, st.status, t.code AS test_code
     FROM sample_tests st JOIN tests t ON st.test_id = t.id WHERE st.id = $1`,
    [sampleTestId]
  );
  if (!st.rows[0]) throw new AppError('Sample test not found', 404, 'NOT_FOUND');

  const result = await query(
    'SELECT id, is_validated FROM results WHERE sample_test_id = $1',
    [sampleTestId]
  );
  const resultId = result.rows[0]?.id;

  if (result.rows[0]?.is_validated) {
    throw new AppError('Results are approved — unapprove first before clearing', 403, 'VALIDATED_LOCKED');
  }

  if (resultId) {
    const attachments = await query('SELECT id, file_url FROM result_attachments WHERE result_id = $1', [resultId]);
    for (const att of attachments.rows) {
      try { await deleteFile(att.file_url); } catch { /* ignore missing file */ }
    }
    await query('DELETE FROM results WHERE id = $1', [resultId]);
  }

  await query(
    `UPDATE sample_tests SET status = 'pending', started_at = NULL, completed_at = NULL, technician_id = NULL
     WHERE id = $1`,
    [sampleTestId]
  );

  const running = await query(
    `SELECT COUNT(*)::int AS n FROM sample_tests st
     JOIN results r ON r.sample_test_id = st.id
     WHERE st.sample_id = $1`,
    [st.rows[0].sample_id]
  );
  if (running.rows[0].n === 0) {
    await query(
      `UPDATE samples SET status = 'received', updated_at = NOW()
       WHERE id = $1 AND status = 'running'`,
      [st.rows[0].sample_id]
    );
  }

  return { sample_test_id: sampleTestId, test_code: st.rows[0].test_code, cleared: Boolean(resultId) };
};

const clearSampleResultsByCode = async (sampleCode, testCode = 'CBC-FULL') => {
  const sample = await query(
    `SELECT s.id FROM samples s WHERE s.sample_code = $1 OR s.barcode = $1 LIMIT 1`,
    [sampleCode]
  );
  if (!sample.rows[0]) throw new AppError('Sample not found', 404, 'NOT_FOUND');

  const st = await query(
    `SELECT st.id FROM sample_tests st JOIN tests t ON st.test_id = t.id
     WHERE st.sample_id = $1 AND t.code = $2 LIMIT 1`,
    [sample.rows[0].id, testCode]
  );
  if (!st.rows[0]) throw new AppError(`Test ${testCode} not on sample`, 404, 'NOT_FOUND');

  return clearSampleTestResults(st.rows[0].id);
};

module.exports = {
  getBySampleTest,
  enterResults,
  approveBatch,
  validateResults,
  unvalidateResults,
  getPreviousResults,
  getCriticalAlerts,
  addAttachment,
  updateAttachment,
  removeAttachment,
  getAttachments,
  clearSampleTestResults,
  clearSampleResultsByCode,
};
