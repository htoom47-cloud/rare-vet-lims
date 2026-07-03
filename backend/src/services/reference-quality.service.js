/**
 * Reference range & parameter display quality audit (Admin).
 */
const { query } = require('../config/database');
const { validateMinMax } = require('./parameter-display.utils');

const runQualityAudit = async ({ species, test_id, limit = 500 } = {}) => {
  const params = [];
  const where = ['tp.is_active = true', 'COALESCE(tp.show_in_report, true) = true'];
  if (test_id) {
    params.push(test_id);
    where.push(`tp.test_id = $${params.length}`);
  }

  const parameters = await query(
    `SELECT tp.id, tp.code, tp.name, tp.name_ar, tp.unit, tp.device_code, tp.short_code,
            t.id AS test_id, t.code AS test_code, t.name AS test_name
     FROM test_parameters tp
     JOIN tests t ON t.id = tp.test_id
     WHERE ${where.join(' AND ')}
     ORDER BY t.code, tp.sort_order, tp.code
     LIMIT ${Math.min(limit, 1000)}`,
    params
  );

  const ranges = await query(
    `SELECT trr.*, tp.code AS parameter_code, t.code AS test_code
     FROM test_reference_ranges trr
     JOIN test_parameters tp ON tp.id = trr.parameter_id
     JOIN tests t ON t.id = tp.test_id
     WHERE trr.is_active = true
     ${species ? 'AND trr.animal_type = $1' : ''}`,
    species ? [species] : []
  );

  const mappings = await query(
    `SELECT dpm.system_parameter_id, dpm.device_parameter_code, dpm.device_name, dpm.is_active
     FROM device_parameter_mappings dpm
     WHERE dpm.is_active = true`
  );

  const mappingByParam = new Map();
  mappings.rows.forEach((m) => {
    if (!mappingByParam.has(m.system_parameter_id)) {
      mappingByParam.set(m.system_parameter_id, m.device_parameter_code);
    }
  });

  const rangesByParamSpecies = new Map();
  const duplicateKeys = new Set();
  const invertedRanges = [];
  const unitMismatches = [];

  ranges.rows.forEach((r) => {
    const key = `${r.parameter_id}|${r.animal_type}|${r.device_id || ''}|${r.sex || ''}`;
    if (rangesByParamSpecies.has(key)) duplicateKeys.add(key);
    rangesByParamSpecies.set(key, r);

    const inv = validateMinMax(r.min_value, r.max_value);
    if (inv) {
      invertedRanges.push({
        id: r.id,
        parameter_code: r.parameter_code,
        test_code: r.test_code,
        animal_type: r.animal_type,
        min_value: r.min_value,
        max_value: r.max_value,
      });
    }

    if (r.unit && r.parameter_code) {
      const param = parameters.rows.find((p) => p.id === r.parameter_id);
      if (param?.unit && param.unit !== 'qual' && r.unit !== param.unit) {
        unitMismatches.push({
          range_id: r.id,
          parameter_code: r.parameter_code,
          range_unit: r.unit,
          parameter_unit: param.unit,
        });
      }
    }
  });

  const missingArabic = [];
  const missingDeviceCode = [];
  const missingRange = [];

  const speciesList = species
    ? [species]
    : ['camel', 'horse', 'sheep', 'goat', 'cattle', 'other'];

  parameters.rows.forEach((p) => {
    if (!p.name_ar || !String(p.name_ar).trim()) {
      missingArabic.push({ parameter_id: p.id, code: p.code, test_code: p.test_code });
    }
    const mapped = mappingByParam.get(p.id) || p.device_code || p.short_code;
    if (!mapped) {
      missingDeviceCode.push({ parameter_id: p.id, code: p.code, test_code: p.test_code });
    }
    for (const sp of speciesList) {
      const hasRange = ranges.rows.some(
        (r) => r.parameter_id === p.id && r.animal_type === sp
      );
      if (!hasRange) {
        missingRange.push({
          parameter_id: p.id,
          code: p.code,
          test_code: p.test_code,
          animal_type: sp,
        });
      }
    }
  });

  const flagWithoutRange = await query(
    `SELECT DISTINCT tp.code AS parameter_code, t.code AS test_code, rv.flag, s.sample_code
     FROM result_values rv
     JOIN results res ON res.id = rv.result_id AND res.is_validated = true
     JOIN test_parameters tp ON tp.id = rv.parameter_id
     JOIN tests t ON t.id = tp.test_id
     JOIN sample_tests st ON st.id = res.sample_test_id
     JOIN samples s ON s.id = st.sample_id
     WHERE rv.flag IN ('HIGH', 'LOW', 'CRIT_HIGH', 'CRIT_LOW')
       AND NOT EXISTS (
         SELECT 1 FROM test_reference_ranges trr
         WHERE trr.parameter_id = rv.parameter_id
           AND trr.is_active = true
           AND (trr.min_value IS NOT NULL AND trr.max_value IS NOT NULL
                OR trr.text_reference IS NOT NULL AND TRIM(trr.text_reference) <> '')
       )
     LIMIT 100`
  ).catch(() => ({ rows: [] }));

  const duplicates = [...duplicateKeys].map((key) => {
    const [parameter_id, animal_type, device_id, sex] = key.split('|');
    return { parameter_id, animal_type, device_id: device_id || null, sex: sex || null };
  });

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      missingRange: missingRange.length,
      invertedRanges: invertedRanges.length,
      unitMismatches: unitMismatches.length,
      flagWithoutRange: flagWithoutRange.rows.length,
      duplicateRanges: duplicates.length,
      missingArabic: missingArabic.length,
      missingDeviceCode: missingDeviceCode.length,
    },
    missingRange: missingRange.slice(0, 200),
    invertedRanges,
    unitMismatches,
    flagWithoutRange: flagWithoutRange.rows,
    duplicateRanges: duplicates,
    missingArabic,
    missingDeviceCode,
  };
};

module.exports = { runQualityAudit, validateMinMax };
