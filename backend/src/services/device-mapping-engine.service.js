/**
 * Device Mapping Engine — single source for Norma/device OBX → LIMS parameter mapping.
 *
 * Validation layer only: does not replace ingest flow; ensures WBC ≠ LYM% etc.
 * Reference ranges are handled separately by reference-range-engine.service.js.
 */
const { query } = require('../config/database');
const {
  mapNormaCode,
  resolveNormaResultLimsCode,
  NORMA_CBC_PCT_BY_ABS,
  DEFAULT_CBC_TEST_CODE,
} = require('../utils/norma-cbc-map');
const { mapMindrayDeviceCodeToLims } = require('../utils/mindray-chem-map');

const VALUE_TYPES = {
  COUNT: 'count',
  NUMERIC: 'numeric',
  PERCENTAGE: 'percentage',
  QUAL: 'qual',
};

/** Expected value_type per LIMS CBC parameter code (Norma iVet). */
const NORMA_CBC_VALUE_TYPES = {
  WBC: VALUE_TYPES.COUNT,
  LYM: VALUE_TYPES.COUNT,
  MON: VALUE_TYPES.COUNT,
  NEU: VALUE_TYPES.COUNT,
  EOS: VALUE_TYPES.COUNT,
  BAS: VALUE_TYPES.COUNT,
  LYM_PCT: VALUE_TYPES.PERCENTAGE,
  MON_PCT: VALUE_TYPES.PERCENTAGE,
  NEU_PCT: VALUE_TYPES.PERCENTAGE,
  EOS_PCT: VALUE_TYPES.PERCENTAGE,
  BAS_PCT: VALUE_TYPES.PERCENTAGE,
  RBC: VALUE_TYPES.COUNT,
  HGB: VALUE_TYPES.NUMERIC,
  HCT: VALUE_TYPES.PERCENTAGE,
  MCV: VALUE_TYPES.NUMERIC,
  MCH: VALUE_TYPES.NUMERIC,
  MCHC: VALUE_TYPES.NUMERIC,
  'RDW-SD': VALUE_TYPES.NUMERIC,
  'RDW-CV': VALUE_TYPES.PERCENTAGE,
  PLT: VALUE_TYPES.COUNT,
  MPV: VALUE_TYPES.NUMERIC,
  PCT: VALUE_TYPES.PERCENTAGE,
  'PDW-SD': VALUE_TYPES.NUMERIC,
  'PDW-CV': VALUE_TYPES.PERCENTAGE,
  'PLC-R': VALUE_TYPES.PERCENTAGE,
  'PLC-C': VALUE_TYPES.COUNT,
};

const PCT_CODES = new Set(Object.values(NORMA_CBC_PCT_BY_ABS));
const COUNT_CODES = new Set(['WBC', 'RBC', 'PLT', 'LYM', 'MON', 'NEU', 'EOS', 'BAS', 'PLC-C']);

const isKnownLimsParameterCode = (code) => Boolean(code && NORMA_CBC_VALUE_TYPES[code]);

const normalizeDeviceParameterCode = (code) => {
  if (code == null || code === '') return '';
  return String(code).trim();
};

const inferValueType = (systemParameterCode, { unit, deviceParameterCode } = {}) => {
  if (systemParameterCode && NORMA_CBC_VALUE_TYPES[systemParameterCode]) {
    return NORMA_CBC_VALUE_TYPES[systemParameterCode];
  }
  const raw = String(deviceParameterCode || systemParameterCode || '').toUpperCase();
  const u = String(unit || '').trim();
  if (u === '%' || raw.includes('%') || raw.endsWith('P') && PCT_CODES.has(`${raw.replace(/P$/, '')}_PCT`)) {
    return VALUE_TYPES.PERCENTAGE;
  }
  if (COUNT_CODES.has(systemParameterCode)) return VALUE_TYPES.COUNT;
  return VALUE_TYPES.NUMERIC;
};

/** Sync LIMS code resolution (no DB) — used by enrichment helpers. */
const resolveSystemParameterCodeSync = (deviceResult = {}) => {
  const candidate = resolveNormaResultLimsCode(deviceResult) || mapNormaCode(deviceResult.code);
  return isKnownLimsParameterCode(candidate) ? candidate : null;
};

/**
 * Resolve mapping row from DB with static Norma fallback.
 * @returns {Promise<object|null>}
 */
const resolveDeviceParameterMapping = async (
  deviceId,
  deviceParameterCode,
  context = {}
) => {
  const raw = normalizeDeviceParameterCode(deviceParameterCode);
  if (!raw) return null;

  const deviceName = context.deviceName || context.device_name;
  const unit = context.unit;

  const params = [raw];
  let sql = `
    SELECT dpm.*, tp.code AS system_parameter_code, tp.id AS system_parameter_id
    FROM device_parameter_mappings dpm
    JOIN test_parameters tp ON tp.id = dpm.system_parameter_id
    WHERE dpm.is_active = true AND UPPER(dpm.device_parameter_code) = UPPER($1)`;

  if (deviceId) {
    params.push(deviceId);
    sql += ` AND dpm.device_id = $${params.length}`;
  } else if (deviceName) {
    params.push(`%${deviceName}%`);
    sql += ` AND dpm.device_name ILIKE $${params.length}`;
  }

  sql += ' ORDER BY dpm.updated_at DESC LIMIT 1';
  const db = await query(sql, params);

  if (db.rows[0]) {
    const row = db.rows[0];
    return {
      source: 'database',
      device_parameter_code: raw,
      normalized_device_code: raw.toUpperCase(),
      system_parameter_code: row.system_parameter_code,
      system_parameter_id: row.system_parameter_id,
      value_type: row.value_type || inferValueType(row.system_parameter_code, { unit, deviceParameterCode: raw }),
      unit: row.unit || unit || null,
    };
  }

  const resolvedCode = resolveSystemParameterCodeSync({
    code: raw,
    unit,
    limsCode: context.limsCode,
  });

  if (!resolvedCode && deviceName && /mindray/i.test(deviceName)) {
    const mindrayLims = mapMindrayDeviceCodeToLims(raw);
    if (mindrayLims) {
      return {
        source: 'static-mindray',
        device_parameter_code: raw,
        normalized_device_code: raw.toUpperCase(),
        system_parameter_code: mindrayLims,
        system_parameter_id: null,
        value_type: inferValueType(mindrayLims, { unit, deviceParameterCode: raw }),
        unit: unit || null,
      };
    }
  }

  if (!resolvedCode) {
    return {
      source: 'unknown',
      device_parameter_code: raw,
      normalized_device_code: raw.toUpperCase(),
      system_parameter_code: null,
      system_parameter_id: null,
      value_type: null,
      unit: unit || null,
    };
  }

  return {
    source: 'static-norma',
    device_parameter_code: raw,
    normalized_device_code: raw.toUpperCase(),
    system_parameter_code: resolvedCode,
    system_parameter_id: null,
    value_type: inferValueType(resolvedCode, { unit, deviceParameterCode: raw }),
    unit: unit || null,
  };
};

const resolveSystemParameterId = async (testCode, systemParameterCode) => {
  if (!testCode || !systemParameterCode) return null;
  const result = await query(
    `SELECT tp.id, tp.code, tp.name, tp.unit
     FROM test_parameters tp
     JOIN tests t ON tp.test_id = t.id
     WHERE t.code = $1 AND UPPER(tp.code) = UPPER($2)
     LIMIT 1`,
    [testCode, systemParameterCode]
  );
  return result.rows[0] || null;
};

/**
 * Map one device result row → LIMS parameter (value separate from reference).
 */
const mapDeviceResultToSystemParameter = async (deviceResult = {}, context = {}) => {
  const testCode = context.testCode || context.test_code || DEFAULT_CBC_TEST_CODE;
  const deviceParameterCode = deviceResult.code || deviceResult.device_parameter_code || deviceResult.limsCode;
  const mapping = await resolveDeviceParameterMapping(
    context.deviceId || context.device_id,
    deviceParameterCode,
    {
      deviceName: context.deviceName || context.device_name,
      unit: deviceResult.unit,
      limsCode: deviceResult.limsCode,
    }
  );

  if (!mapping?.system_parameter_code) {
    return {
      status: mapping?.source === 'unknown' ? 'ignored' : 'error',
      device_parameter_code: normalizeDeviceParameterCode(deviceParameterCode),
      system_parameter_code: null,
      system_parameter_id: null,
      value_type: null,
      value: deviceResult.value != null ? String(deviceResult.value) : null,
      unit: deviceResult.unit || null,
      reference: deviceResult.reference ?? null,
      device_flag: deviceResult.flag || null,
      mapping,
      error: mapping?.source === 'unknown'
        ? `Unknown device parameter code: ${deviceParameterCode}`
        : 'No system parameter mapping',
    };
  }

  const param = await resolveSystemParameterId(testCode, mapping.system_parameter_code);
  if (!param) {
    return {
      status: 'ignored',
      device_parameter_code: normalizeDeviceParameterCode(deviceParameterCode),
      system_parameter_code: mapping.system_parameter_code,
      system_parameter_id: null,
      value_type: mapping.value_type,
      value: deviceResult.value != null ? String(deviceResult.value) : null,
      unit: deviceResult.unit || null,
      reference: deviceResult.reference ?? null,
      device_flag: deviceResult.flag || null,
      mapping,
      error: `LIMS parameter ${mapping.system_parameter_code} not on test ${testCode}`,
    };
  }

  return {
    status: 'mapped',
    device_parameter_code: normalizeDeviceParameterCode(deviceParameterCode),
    system_parameter_code: param.code,
    system_parameter_id: param.id,
    value_type: mapping.value_type || inferValueType(param.code, deviceResult),
    value: deviceResult.value != null ? String(deviceResult.value) : null,
    unit: deviceResult.unit || param.unit || null,
    reference: deviceResult.reference ?? null,
    device_flag: deviceResult.flag || null,
    mapping,
    error: null,
  };
};

/**
 * Validate mapped result — blocks WBC↔LYM% confusion and wrong value types.
 * @returns {{ valid: boolean, ignored?: boolean, reason?: string }}
 */
const validateMappedDeviceResult = (mappedResult = {}) => {
  if (!mappedResult || mappedResult.status === 'ignored') {
    return { valid: false, ignored: true, reason: mappedResult?.error || 'Ignored' };
  }

  if (mappedResult.status !== 'mapped' || !mappedResult.system_parameter_code) {
    return { valid: false, ignored: false, reason: mappedResult?.error || 'Not mapped' };
  }

  const code = mappedResult.system_parameter_code;
  const expectedType = NORMA_CBC_VALUE_TYPES[code] || mappedResult.value_type;
  const actualType = mappedResult.value_type || inferValueType(code, mappedResult);

  if (expectedType && actualType && expectedType !== actualType) {
    return {
      valid: false,
      ignored: false,
      reason: `value_type mismatch for ${code}: expected ${expectedType}, got ${actualType}`,
    };
  }

  const deviceRaw = String(mappedResult.device_parameter_code || '').toUpperCase();

  if (mappedResult.mapping?.source !== 'database'
    && mappedResult.mapping?.source !== 'static-mindray') {
    const expectedCode = resolveSystemParameterCodeSync({
      code: mappedResult.device_parameter_code,
      unit: mappedResult.unit,
      limsCode: mappedResult.device_parameter_code,
    });
    if (expectedCode && expectedCode !== code) {
      return {
        valid: false,
        ignored: false,
        reason: `Device code ${deviceRaw} resolves to ${expectedCode}, not ${code}`,
      };
    }
  }

  const isPctDevice = deviceRaw.includes('%') || deviceRaw.endsWith('P')
    || ['LYMP', 'MONP', 'NEUP', 'EOSP', 'BASP'].includes(deviceRaw);
  const isCountDevice = deviceRaw.includes('#')
    || (!isPctDevice && COUNT_CODES.has(deviceRaw));

  if (isPctDevice && COUNT_CODES.has(code) && !PCT_CODES.has(code)) {
    return {
      valid: false,
      ignored: false,
      reason: `Percent device code ${deviceRaw} must not map to count parameter ${code}`,
    };
  }

  if (isCountDevice && PCT_CODES.has(code)) {
    return {
      valid: false,
      ignored: false,
      reason: `Count device code ${deviceRaw} must not map to percent parameter ${code}`,
    };
  }

  if (mappedResult.value != null && mappedResult.value !== '') {
    const num = parseFloat(mappedResult.value);
    if (Number.isNaN(num) && actualType !== VALUE_TYPES.QUAL) {
      return { valid: false, ignored: false, reason: `Non-numeric value for ${code}` };
    }
  }

  return { valid: true };
};

/** Sync map for enrichment paths (no DB parameter id lookup). */
const mapDeviceResultToSystemParameterSync = (deviceResult = {}) => {
  const systemCode = resolveSystemParameterCodeSync(deviceResult);
  if (!systemCode) {
    const raw = normalizeDeviceParameterCode(deviceResult.code);
    return {
      status: 'ignored',
      device_parameter_code: raw,
      system_parameter_code: null,
      value_type: null,
      error: raw ? `Unknown device parameter code: ${raw}` : 'Missing device parameter code',
    };
  }
  return {
    status: 'mapped',
    device_parameter_code: normalizeDeviceParameterCode(deviceResult.code),
    system_parameter_code: systemCode,
    value_type: inferValueType(systemCode, deviceResult),
    value: deviceResult.value != null ? String(deviceResult.value) : null,
    unit: deviceResult.unit || null,
    reference: deviceResult.reference ?? null,
  };
};

module.exports = {
  VALUE_TYPES,
  NORMA_CBC_VALUE_TYPES,
  isKnownLimsParameterCode,
  normalizeDeviceParameterCode,
  resolveDeviceParameterMapping,
  resolveSystemParameterCodeSync,
  mapDeviceResultToSystemParameter,
  mapDeviceResultToSystemParameterSync,
  validateMappedDeviceResult,
  inferValueType,
};
