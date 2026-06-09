const { query, getClient } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { evaluateFlag } = require('../utils/helpers');

const getBySampleTest = async (sampleTestId) => {
  const result = await query(
    `SELECT r.*, rv.*, tp.name as parameter_name, tp.code as parameter_code, tp.unit,
            tr.min_value, tr.max_value, tr.critical_low, tr.critical_high
     FROM results r
     LEFT JOIN result_values rv ON r.id = rv.result_id
     LEFT JOIN test_parameters tp ON rv.parameter_id = tp.id
     LEFT JOIN test_reference_ranges tr ON tr.parameter_id = tp.id
     LEFT JOIN samples s ON s.id = (SELECT sample_id FROM sample_tests WHERE id = $1)
     LEFT JOIN animals a ON s.animal_id = a.id AND (tr.animal_type = a.animal_type OR tr.animal_type IS NULL)
     WHERE r.sample_test_id = $1`,
    [sampleTestId]
  );

  if (!result.rows.length) return null;

  const grouped = {
    id: result.rows[0].id,
    sample_test_id: sampleTestId,
    is_validated: result.rows[0].is_validated,
    doctor_notes: result.rows[0].doctor_notes,
    technician_notes: result.rows[0].technician_notes,
    has_critical: result.rows[0].has_critical,
    values: result.rows.filter((r) => r.parameter_id).map((r) => ({
      parameter_id: r.parameter_id,
      parameter_name: r.parameter_name,
      parameter_code: r.parameter_code,
      value: r.value,
      numeric_value: r.numeric_value,
      unit: r.unit,
      flag: r.flag,
      is_critical: r.is_critical,
      reference: r.min_value != null ? `${r.min_value} - ${r.max_value}` : null,
    })),
  };

  return grouped;
};

const enterResults = async (data, userId) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const stResult = await client.query(
      `SELECT st.*, s.animal_id, a.animal_type FROM sample_tests st
       JOIN samples s ON st.sample_id = s.id
       JOIN animals a ON s.animal_id = a.id WHERE st.id = $1`,
      [data.sample_test_id]
    );

    if (!stResult.rows[0]) throw new AppError('Sample test not found', 404, 'NOT_FOUND');

    const { animal_type } = stResult.rows[0];
    let hasCritical = false;

    let resultId;
    const existing = await client.query('SELECT id FROM results WHERE sample_test_id = $1', [data.sample_test_id]);

    if (existing.rows[0]) {
      resultId = existing.rows[0].id;
      await client.query('DELETE FROM result_values WHERE result_id = $1', [resultId]);
      await client.query(
        `UPDATE results SET technician_notes = $1, entered_by = $2, updated_at = NOW() WHERE id = $3`,
        [data.technician_notes, userId, resultId]
      );
    } else {
      const r = await client.query(
        `INSERT INTO results (sample_test_id, entered_by, technician_notes) VALUES ($1, $2, $3) RETURNING id`,
        [data.sample_test_id, userId, data.technician_notes]
      );
      resultId = r.rows[0].id;
    }

    for (const val of data.values) {
      const numericValue = parseFloat(val.value);
      const isNumeric = !isNaN(numericValue);

      let flag = '';
      let isCritical = false;

      if (isNumeric) {
        const rangeResult = await client.query(
          `SELECT * FROM test_reference_ranges WHERE parameter_id = $1 AND (animal_type = $2 OR animal_type IS NULL) LIMIT 1`,
          [val.parameter_id, animal_type]
        );
        const range = rangeResult.rows[0];
        if (range) {
          const evaluated = evaluateFlag(numericValue, range.min_value, range.max_value, range.critical_low, range.critical_high);
          flag = evaluated.flag;
          isCritical = evaluated.isCritical;
          if (isCritical) hasCritical = true;
        }
      }

      await client.query(
        `INSERT INTO result_values (result_id, parameter_id, value, numeric_value, flag, is_critical)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [resultId, val.parameter_id, val.value, isNumeric ? numericValue : null, flag, isCritical]
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
      `UPDATE samples SET status = 'running' WHERE id = (SELECT sample_id FROM sample_tests WHERE id = $1) AND status IN ('received', 'pending')`,
      [data.sample_test_id]
    );

    await client.query('COMMIT');
    return getBySampleTest(data.sample_test_id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const validateResults = async (sampleTestId, userId, doctorNotes) => {
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
  const pending = await query(
    `SELECT COUNT(*) FROM sample_tests WHERE sample_id = $1 AND status != 'completed'`,
    [st.rows[0].sample_id]
  );

  if (parseInt(pending.rows[0].count, 10) === 0) {
    await query(`UPDATE samples SET status = 'completed', completed_date = NOW() WHERE id = $1`, [st.rows[0].sample_id]);
  }

  return getBySampleTest(sampleTestId);
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

module.exports = { getBySampleTest, enterResults, validateResults, getPreviousResults, getCriticalAlerts };
