/**
 * Norma reference range debug — trace OBX-7 through import, DB, and report.
 */
const { query } = require('../config/database');
const { parseDeviceMessage } = require('../utils/device-parsers');
const { splitSegments } = require('../utils/hl7');
const { resolveNormaResultLimsCode } = require('../utils/norma-cbc-map');
const {
  parseReferenceRange,
  verbatimFromResultNotes,
  resolveReportReferenceDisplay,
  resolveReportReferenceBounds,
} = require('../utils/reference-range');
const { mapNormaSpeciesToRefSpeciesExact, normalizeSpeciesKey } = require('../utils/norma-species-map');
const { buildReportData } = require('./reports.service');
const logger = require('../config/logger');

const AUDIT_SPECIES = ['camel', 'horse', 'sheep', 'goat', 'cattle', 'dog', 'cat'];

const explainReportDifference = (normaRaw, reportRef, storedNotes, dbRefText) => {
  if (!normaRaw && !reportRef) return 'No Norma OBX-7 and no report reference';
  if (!normaRaw && reportRef) {
    return 'Report used non-Norma source (missing OBX-7 in message)';
  }
  if (normaRaw && reportRef === normaRaw) return null;
  if (!reportRef && normaRaw) {
    return 'Report missing reference despite Norma OBX-7 in message (result_values.notes not frozen)';
  }
  if (storedNotes && verbatimFromResultNotes(storedNotes) === reportRef) {
    if (normaRaw !== reportRef) {
      return `Report matches DB notes "${verbatimFromResultNotes(storedNotes)}" but differs from current message OBX-7 "${normaRaw}" (historical snapshot or re-import)`;
    }
    return null;
  }
  if (dbRefText && dbRefText === reportRef && normaRaw !== reportRef) {
    return `Report matches device_reference_ranges.reference_text "${dbRefText}" instead of message OBX-7`;
  }
  if (reportRef && normaRaw) {
    const parsedNorma = parseReferenceRange(normaRaw);
    const parsedReport = parseReferenceRange(reportRef);
    if (parsedNorma?.min != null && parsedReport?.min != null
      && `${parsedNorma.min}-${parsedNorma.max}` === reportRef.replace(/\s/g, '')) {
      return 'Report reformatted Norma range as "min - max" instead of verbatim OBX-7';
    }
    return `Report "${reportRef}" ≠ Norma OBX-7 "${normaRaw}"`;
  }
  return `Mismatch: norma="${normaRaw || '—'}" report="${reportRef || '—'}"`;
};

const buildParameterTrace = ({
  parameterCode,
  species,
  speciesRaw,
  result,
  unit,
  rawObx7,
  parsedLow,
  parsedHigh,
  storedNotes,
  dbRefText,
  dbLow,
  dbHigh,
  reportReference,
}) => {
  const normaRaw = String(rawObx7 || '').trim() || null;
  const storedVerbatim = verbatimFromResultNotes(storedNotes);
  const diffReason = explainReportDifference(normaRaw, reportReference, storedNotes, dbRefText);

  const trace = {
    parameter: parameterCode,
    species,
    speciesRaw: speciesRaw || null,
    rawObx7: normaRaw,
    low: parsedLow ?? null,
    high: parsedHigh ?? null,
    deviceReferenceRanges: dbRefText || null,
    storedInResultValues: storedVerbatim || storedNotes || null,
    storedInDb: storedVerbatim || storedNotes || null,
    reportReference: reportReference || null,
    mismatch: Boolean(diffReason),
    mismatchReason: diffReason,
    // legacy keys
    parameterCode,
    parsedLow: parsedLow ?? null,
    parsedHigh: parsedHigh ?? null,
    deviceRefText: dbRefText || null,
  };

  const status = diffReason ? `MISMATCH: ${diffReason}` : 'OK';
  logger.info(
    '[NormaRef] Parameter=%s | Species=%s | Raw OBX-7=%s | Low=%s | High=%s | device_reference_ranges=%s | stored=%s | Report=%s | %s',
    parameterCode,
    species || '—',
    normaRaw || '—',
    parsedLow ?? '—',
    parsedHigh ?? '—',
    dbRefText || '—',
    storedVerbatim || '—',
    reportReference || '—',
    status
  );
  return trace;
};

const parseObxSegments = (rawMessage) => {
  const segments = splitSegments(String(rawMessage || ''));
  return segments
    .filter((s) => s.startsWith('OBX|'))
    .map((segment) => {
      const fields = segment.split('|');
      const codeParts = String(fields[3] || '').split('^');
      return {
        segment,
        setId: fields[1] || null,
        valueType: fields[2] || null,
        code: codeParts[0] || null,
        name: codeParts[1] || codeParts[0] || null,
        value: fields[5] ?? fields[4] ?? null,
        unit: fields[6] || null,
        referenceRaw: (fields[7] || '').trim() || null,
        flag: fields[8] || null,
      };
    });
};

const resolveSpeciesKey = (parsed) => {
  const raw = parsed?.animalTypeRaw || parsed?.animalType || null;
  return mapNormaSpeciesToRefSpeciesExact(raw) || normalizeSpeciesKey(raw) || null;
};

const loadStoredRefs = async ({ parameterCode, species, unit }) => {
  const device = await query(
    `SELECT reference_text, low_value, high_value, species
     FROM device_reference_ranges
     WHERE device_name ILIKE '%norma%'
       AND parameter_code = $1
       AND species = $2
       AND (unit IS NULL OR unit = '' OR unit = $3)
     ORDER BY last_synced_at DESC LIMIT 1`,
    [parameterCode, species, unit || '']
  );
  return device.rows[0] || null;
};

const traceFromParsed = async (parsed, { sampleId, messageId, rawMessage, reportRowsByCode } = {}) => {
  const species = resolveSpeciesKey(parsed);
  const speciesRaw = parsed?.animalTypeRaw || parsed?.animalType || null;
  const parameters = [];

  for (const row of parsed?.results || []) {
    const code = resolveNormaResultLimsCode(row) || row.limsCode || row.code;
    if (!code) continue;

    let storedNotes = null;
    if (sampleId) {
      const rv = await query(
        `SELECT rv.notes
         FROM result_values rv
         JOIN results r ON r.id = rv.result_id
         JOIN sample_tests st ON st.id = r.sample_test_id
         JOIN test_parameters tp ON tp.id = rv.parameter_id
         WHERE st.sample_id = $1 AND tp.code = $2
         ORDER BY r.created_at DESC LIMIT 1`,
        [sampleId, code]
      );
      storedNotes = rv.rows[0]?.notes || null;
    }

    const dbRef = species
      ? await loadStoredRefs({ parameterCode: code, species, unit: row.unit })
      : null;

    const reportRow = reportRowsByCode?.[code];
    const reportRef = reportRow?.reference ?? null;

    parameters.push(buildParameterTrace({
      parameterCode: code,
      species,
      speciesRaw,
      result: row.value,
      unit: row.unit,
      rawObx7: row.reference,
      parsedLow: row.referenceMin,
      parsedHigh: row.referenceMax,
      storedNotes,
      dbRefText: dbRef?.reference_text || null,
      dbLow: dbRef?.low_value,
      dbHigh: dbRef?.high_value,
      reportReference: reportRef,
    }));
  }

  return {
    messageId: messageId || null,
    sampleId: sampleId || null,
    species,
    speciesRaw,
    speciesMappedExact: Boolean(mapNormaSpeciesToRefSpeciesExact(speciesRaw)),
    rawHl7: rawMessage || null,
    obxSegments: rawMessage ? parseObxSegments(rawMessage) : [],
    parsedResults: parsed?.results || [],
    parameters,
    mismatchCount: parameters.filter((p) => p.mismatch).length,
  };
};

const analyzeMessage = async (messageId) => {
  const msg = await query(
    `SELECT dm.*, s.id AS sample_id
     FROM device_messages dm
     LEFT JOIN samples s ON s.id = dm.sample_id
     WHERE dm.id = $1`,
    [messageId]
  );
  if (!msg.rows[0]) return null;

  const row = msg.rows[0];
  const parsed = typeof row.parsed_data === 'string'
    ? JSON.parse(row.parsed_data)
    : row.parsed_data;
  const rawMessage = row.raw_message;
  const reparsed = rawMessage ? parseDeviceMessage(rawMessage, 'HL7') : parsed;

  let reportRowsByCode = {};
  if (row.sample_id) {
    try {
      const report = await buildReportData(row.sample_id, {
        reportNumber: 'DEBUG',
        verificationCode: 'DEBUG',
        language: 'en',
        generatedBy: 'debug',
      });
      reportRowsByCode = Object.fromEntries(
        (report.results || []).map((r) => [r.code, r])
      );
    } catch {
      /* no validated report yet */
    }
  }

  return traceFromParsed(reparsed || parsed, {
    messageId,
    sampleId: row.sample_id,
    rawMessage,
    reportRowsByCode,
  });
};

const analyzeSample = async (sampleId) => {
  const latest = await query(
    `SELECT dm.id FROM device_messages dm
     WHERE dm.sample_id = $1 AND dm.status = 'imported'
     ORDER BY dm.created_at DESC LIMIT 1`,
    [sampleId]
  );
  if (!latest.rows[0]) {
    const byCode = await query(
      `SELECT dm.id FROM device_messages dm
       JOIN samples s ON s.id = $1
       WHERE dm.parsed_data::text ILIKE '%' || s.sample_code || '%'
       ORDER BY dm.created_at DESC LIMIT 1`,
      [sampleId]
    );
    if (!byCode.rows[0]) return null;
    return analyzeMessage(byCode.rows[0].id);
  }
  return analyzeMessage(latest.rows[0].id);
};

/** Compare Norma vs DB vs report per species from latest imported messages. */
const auditAllSpecies = async () => {
  const report = { species: [], summary: { total: 0, mismatches: 0 } };

  for (const speciesKey of AUDIT_SPECIES) {
    const msg = await query(
      `SELECT dm.id, dm.parsed_data, dm.raw_message
       FROM device_messages dm
       WHERE dm.status = 'imported'
         AND dm.parsed_data IS NOT NULL
         AND (
           dm.parsed_data->>'animalType' = $1
           OR dm.parsed_data->>'animalTypeRaw' ILIKE $2
           OR dm.raw_message ILIKE $3
         )
       ORDER BY dm.created_at DESC LIMIT 1`,
      [speciesKey, `%${speciesKey}%`, `%${speciesKey}%`]
    );

    if (!msg.rows[0]) {
      report.species.push({ species: speciesKey, status: 'no_message', parameters: [] });
      continue;
    }

    const trace = await analyzeMessage(msg.rows[0].id);
    report.species.push({
      species: speciesKey,
      status: trace ? 'ok' : 'error',
      messageId: msg.rows[0].id,
      speciesRaw: trace?.speciesRaw,
      speciesMappedExact: trace?.speciesMappedExact,
      parameters: (trace?.parameters || []).map((p) => ({
        parameterCode: p.parameterCode,
        normaObx7: p.rawObx7,
        dbStored: p.storedInDb,
        deviceRefText: p.deviceRefText,
        reportReference: p.reportReference,
        mismatch: p.mismatch,
        mismatchReason: p.mismatchReason,
      })),
      mismatchCount: trace?.mismatchCount || 0,
    });
    report.summary.total += trace?.parameters?.length || 0;
    report.summary.mismatches += trace?.mismatchCount || 0;
  }

  return report;
};

const logImportDebug = (rows, species, speciesRaw) => {
  for (const row of rows || []) {
    const code = resolveNormaResultLimsCode(row) || row.code;
    buildParameterTrace({
      parameterCode: code,
      species,
      speciesRaw,
      result: row.value,
      unit: row.unit,
      rawObx7: row.reference,
      parsedLow: row.referenceMin,
      parsedHigh: row.referenceMax,
      storedNotes: row.reference ? `Norma: ${row.reference}` : null,
      dbRefText: null,
      dbLow: null,
      dbHigh: null,
      reportReference: null,
    });
  }
};

/** Auto-compare Norma message vs frozen result_values vs report on every buildReportData. */
const auditReportBuild = async (sampleId, sample, sqlRows, { normaAnimalType, normaAnimalTypeRaw } = {}) => {
  const msg = await query(
    `SELECT id, parsed_data, raw_message
     FROM device_messages
     WHERE sample_id = $1 AND status = 'imported'
     ORDER BY created_at DESC LIMIT 1`,
    [sampleId]
  );
  if (!msg.rows[0]) return { audited: false, reason: 'no_imported_message' };

  const parsed = typeof msg.rows[0].parsed_data === 'string'
    ? JSON.parse(msg.rows[0].parsed_data)
    : msg.rows[0].parsed_data;

  const normaSpecies = resolveSpeciesKey(parsed) || normaAnimalType;
  const speciesRaw = parsed?.animalTypeRaw || parsed?.animalType || normaAnimalTypeRaw;
  const limsSpecies = sample?.animal_type || null;

  if (normaSpecies && limsSpecies && String(normaSpecies) !== String(limsSpecies)) {
    logger.warn(
      '[NormaRef] Species mismatch | LIMS animal_type=%s | Norma profile=%s | Norma raw=%s | sampleId=%s',
      limsSpecies,
      normaSpecies,
      speciesRaw || '—',
      sampleId
    );
  }

  const reportByCode = Object.fromEntries(
    (sqlRows || []).map((r) => [
      r.parameter_code,
      {
        reference: resolveReportReferenceDisplay(r) || null,
        rv_notes: r.rv_notes,
        unit: r.unit,
      },
    ])
  );

  const traces = [];
  let mismatchCount = 0;

  for (const row of parsed?.results || []) {
    const code = resolveNormaResultLimsCode(row) || row.limsCode || row.code;
    if (!code) continue;

    const reportRow = reportByCode[code];
    const dbRef = normaSpecies
      ? await loadStoredRefs({ parameterCode: code, species: normaSpecies, unit: row.unit })
      : null;

    const trace = buildParameterTrace({
      parameterCode: code,
      species: normaSpecies,
      speciesRaw,
      result: row.value,
      unit: row.unit,
      rawObx7: row.reference,
      parsedLow: row.referenceMin,
      parsedHigh: row.referenceMax,
      storedNotes: reportRow?.rv_notes || null,
      dbRefText: dbRef?.reference_text || null,
      dbLow: dbRef?.low_value,
      dbHigh: dbRef?.high_value,
      reportReference: reportRow?.reference ?? null,
    });

    traces.push(trace);
    if (trace.mismatch) mismatchCount += 1;
  }

  if (mismatchCount > 0) {
    logger.warn('[NormaRef] Report audit found %d reference mismatch(es) for sample %s', mismatchCount, sampleId);
  } else if (traces.length) {
    logger.info('[NormaRef] Report audit OK — %d parameters match Norma for sample %s', traces.length, sampleId);
  }

  return {
    audited: true,
    sampleId,
    limsSpecies,
    normaSpecies,
    speciesRaw,
    speciesMatch: !normaSpecies || !limsSpecies || String(normaSpecies) === String(limsSpecies),
    mismatchCount,
    parameters: traces,
  };
};

module.exports = {
  AUDIT_SPECIES,
  buildParameterTrace,
  parseObxSegments,
  traceFromParsed,
  analyzeMessage,
  analyzeSample,
  auditAllSpecies,
  auditReportBuild,
  logImportDebug,
  explainReportDifference,
  resolveReportReferenceDisplay,
  resolveReportReferenceBounds,
};
