const path = require('path');
const { uuidv4 } = require('../utils/uuid');
const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const env = require('../config/env');
const logger = require('../config/logger');
const { generateCode, paginate, buildPagination } = require('../utils/helpers');
const { generateReportPDF } = require('../utils/pdf');
const { ensureUploadDir, persistLocalFile, deleteFile, createReadStream, fileExists, readImageBuffer } = require('../config/storage');
const { compareByNormaOrder, filterCbcReportRows } = require('../utils/norma-cbc-map');
const {
  LIMS_REF_SELECT_SQL,
  limsRefLateralJoin,
} = require('./reference-range-engine.service');
const resultEngine = require('./result-engine.service');
const { buildReportSections, filterReportableAttachments, buildApprovalSection } = require('./report-builder.service');
const portalSync = require('./portal-sync.service');
const reportLifecycle = require('./report-lifecycle.service');

const INSTRUMENT_BY_CATEGORY = {
  CBC: 'Norma Icon',
  HEM: 'Norma Icon',
  CHEM: 'Diasys Respons 910',
  BIOCHEM: 'Diasys Respons 910',
  IMMUNO: 'Mini VIDAS',
  ELISA: 'Mini VIDAS',
  PCR: 'PCR',
  MICRO: 'Microscope',
  PARAS: 'Microscope',
  URINE: 'Microscope',
};

const resolveInstrument = (categoryCode, testCode) => {
  const code = String(categoryCode || testCode || '').toUpperCase();
  for (const [key, device] of Object.entries(INSTRUMENT_BY_CATEGORY)) {
    if (code.includes(key)) return device;
  }
  if (/CBC|WBC|RBC|HGB/i.test(String(testCode || ''))) return 'Norma Icon';
  return 'Laboratory Analyzer';
};

const LAB_APPROVER_ROLES = new Set(['lab_specialist', 'lab_technician', 'manager', 'admin']);
const VET_APPROVER_ROLES = new Set(['veterinarian', 'manager', 'admin']);

const extractFilename = (pdfUrl) => (pdfUrl ? pdfUrl.split('/').pop() : null);

const canApproveAsLab = (role) => LAB_APPROVER_ROLES.has(role);
const canApproveAsVet = (role) => VET_APPROVER_ROLES.has(role);

const displayName = (user, isArabic) => {
  if (!user) return null;
  return isArabic ? (user.full_name_ar || user.full_name) : user.full_name;
};

const mapAttachmentForPreview = async (a) => {
  const buffer = await readImageBuffer(a.file_url);
  return {
    fileUrl: buffer?.length
      ? `data:image/jpeg;base64,${buffer.toString('base64')}`
      : a.file_url,
    missing: !buffer?.length,
    caption: a.caption,
    testNameAr: a.test_name_ar,
    testNameEn: a.test_name,
  };
};

const buildApprovalFields = (reportRow, isArabic) => ({
  labApproval: reportRow.lab_specialist_approved_by
    ? {
      approved: true,
      name: displayName(
        { full_name: reportRow.lab_specialist_name, full_name_ar: reportRow.lab_specialist_name_ar },
        isArabic
      ),
      approvedAt: reportRow.lab_specialist_approved_at,
      license: reportRow.lab_specialist_license || env.lab.licenseNumber || null,
      title: 'Laboratory Specialist',
    }
    : { approved: false },
  vetApproval: reportRow.vet_approved_by
    ? {
      approved: true,
      name: displayName(
        { full_name: reportRow.vet_name, full_name_ar: reportRow.vet_name_ar },
        isArabic
      ),
      approvedAt: reportRow.vet_approved_at,
      license: reportRow.vet_license || null,
      title: 'Veterinarian',
    }
    : { approved: false },
});

const REPORT_SELECT = `
  SELECT r.*, s.sample_code, c.full_name as customer_name,
         u.full_name as generated_by_name,
         lab_u.full_name as lab_specialist_name,
         lab_u.full_name_ar as lab_specialist_name_ar,
         vet_u.full_name as vet_name,
         vet_u.full_name_ar as vet_name_ar
  FROM reports r
  LEFT JOIN samples s ON r.sample_id = s.id
  LEFT JOIN customers c ON s.customer_id = c.id
  LEFT JOIN users u ON r.generated_by = u.id
  LEFT JOIN users lab_u ON r.lab_specialist_approved_by = lab_u.id
  LEFT JOIN users vet_u ON r.vet_approved_by = vet_u.id
`;

const list = async ({ page, limit }) => {
  const { offset, page: p, limit: l } = paginate(page, limit);
  const countResult = await query('SELECT COUNT(*) FROM reports');
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await query(
    `${REPORT_SELECT}
     ORDER BY r.created_at DESC LIMIT $1 OFFSET $2`,
    [l, offset]
  );

  return { data: result.rows, pagination: buildPagination(total, p, l) };
};

const getById = async (id) => {
  const result = await query(`${REPORT_SELECT} WHERE r.id = $1`, [id]);
  if (!result.rows[0]) throw new AppError('Report not found', 404, 'NOT_FOUND');
  return result.rows[0];
};

const formatTrendNumber = (value) => {
  if (value == null || value === '') return null;
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  return num;
};

const loadResultTrends = async (animalId, currentSampleId, codes) => {
  const empty = { previousByCode: {}, trendHistory: {} };
  if (!animalId || !codes?.length) return empty;

  const hist = await query(
    `WITH recent_samples AS (
       SELECT s.id, s.completed_date
       FROM samples s
       WHERE s.animal_id = $1 AND s.status = 'completed'
       ORDER BY s.completed_date DESC NULLS LAST
       LIMIT 6
     )
     SELECT tp.code, rv.numeric_value, rv.value, rs.completed_date, rs.id AS sample_id
     FROM recent_samples rs
     JOIN sample_tests st ON st.sample_id = rs.id
     JOIN results res ON res.sample_test_id = st.id AND res.is_validated = true
     JOIN result_values rv ON rv.result_id = res.id
     JOIN test_parameters tp ON rv.parameter_id = tp.id
     WHERE tp.code = ANY($2)
     ORDER BY rs.completed_date ASC, tp.code`,
    [animalId, codes]
  ).catch(() => ({ rows: [] }));

  const trendHistory = {};
  const latestByCode = {};

  hist.rows.forEach((row) => {
    const code = String(row.code || '').toUpperCase();
    const numericValue = formatTrendNumber(row.numeric_value ?? row.value);
    if (!trendHistory[code]) trendHistory[code] = [];
    trendHistory[code].push({
      value: row.value,
      numericValue,
      date: row.completed_date,
      sampleId: row.sample_id,
    });
    latestByCode[code] = { value: row.value, numericValue, sampleId: row.sample_id, date: row.completed_date };
  });

  const previousByCode = {};
  Object.entries(latestByCode).forEach(([code, entry]) => {
    if (entry.sampleId !== currentSampleId) {
      previousByCode[code] = entry;
      return;
    }
    const series = trendHistory[code] || [];
    const prev = [...series].reverse().find((p) => p.sampleId !== currentSampleId);
    if (prev) previousByCode[code] = prev;
  });

  return { previousByCode, trendHistory };
};

const buildReportData = async (sampleId, opts) => {
  const {
    reportNumber, verificationCode, language, generatedBy,
    aiInterpretation, treatmentRecommendations, labApproval, vetApproval,
  } = opts;

  const sampleResult = await query(
    `SELECT s.*, c.full_name as customer_name, c.full_name_ar as customer_name_ar,
            c.mobile as customer_mobile,
            a.animal_code, a.animal_type, a.name_tag as animal_name,
            a.gender as animal_gender, a.rfid_chip as animal_chip,
            a.age as animal_age, a.breed as animal_breed, a.color as animal_color
     FROM samples s
     JOIN customers c ON s.customer_id = c.id
     JOIN animals a ON s.animal_id = a.id
     WHERE s.id = $1`,
    [sampleId]
  );

  if (!sampleResult.rows[0]) {
    throw new AppError('Sample not found', 404, 'NOT_FOUND');
  }

  const sample = sampleResult.rows[0];

  const orderedTestsResult = await query(
    `SELECT DISTINCT ON (t.id) t.id AS test_id, t.code AS test_code, t.name AS test_name, t.name_ar AS test_name_ar,
            tc.code AS category_code, tc.sort_order AS cat_sort, t.sort_order AS test_sort
     FROM sample_tests st
     JOIN tests t ON st.test_id = t.id
     LEFT JOIN test_categories tc ON t.category_id = tc.id
     WHERE st.sample_id = $1 AND st.status != 'cancelled'
     ORDER BY t.id, st.created_at DESC`,
    [sampleId]
  );
  orderedTestsResult.rows.sort((a, b) =>
    (a.cat_sort ?? 999) - (b.cat_sort ?? 999) || (a.test_sort ?? 0) - (b.test_sort ?? 0) || a.test_name.localeCompare(b.test_name)
  );

  const resultsData = await query(
    `SELECT tp.id as parameter_id, tp.code as parameter_code, tp.sort_order,
            t.name as test_name, t.name_ar as test_name_ar, t.code as test_code, t.method as test_method,
            tc.code as category_code,
            tp.name as parameter_name, tp.name_ar as parameter_name_ar,
            rv.value, rv.numeric_value, rv.notes AS rv_notes, tp.unit,
            rv.flag, rv.is_critical, res.doctor_notes,
            ${LIMS_REF_SELECT_SQL}
     FROM sample_tests st
     JOIN tests t ON st.test_id = t.id
     LEFT JOIN test_categories tc ON t.category_id = tc.id
     JOIN results res ON res.sample_test_id = st.id AND res.is_validated = true
     JOIN result_values rv ON rv.result_id = res.id
     JOIN test_parameters tp ON rv.parameter_id = tp.id
     JOIN samples s ON st.sample_id = s.id
     JOIN animals a ON s.animal_id = a.id
     ${limsRefLateralJoin()}
     WHERE st.sample_id = $1 AND st.status != 'cancelled'
     ORDER BY tp.sort_order, tp.id`,
    [sampleId]
  );

  if (!resultsData.rows.length) {
    throw new AppError('No validated results found', 400, 'NO_RESULTS');
  }

  const uniqueByParameter = [];
  const seenParameters = new Set();
  const sortedRows = filterCbcReportRows(
    [...resultsData.rows].sort(compareByNormaOrder)
  );
  for (const row of sortedRows) {
    if (seenParameters.has(row.parameter_id)) continue;
    seenParameters.add(row.parameter_id);
    uniqueByParameter.push(row);
  }

  const isArabic = language === 'ar';

  let displayContext = {};
  try {
    const mastering = require('./parameter-mastering.service');
    displayContext = await mastering.loadReportDisplayContext();
  } catch (err) {
    logger.warn('Report display context load skipped', { error: err.message });
  }

  const results = uniqueByParameter
    .filter((r) => displayContext.showInReportMap?.[r.parameter_id] !== false)
    .map((r) => resultEngine.buildReportResultRow(r, {
      language,
      isArabic,
      instrumentResolver: resolveInstrument,
      displayContext,
    }));

  const attachmentsResult = await query(
    `SELECT ra.file_url, ra.caption, ra.include_in_report,
            t.name as test_name, t.name_ar as test_name_ar, t.code as test_code
     FROM result_attachments ra
     JOIN results res ON ra.result_id = res.id
     JOIN sample_tests st ON res.sample_test_id = st.id
     JOIN tests t ON st.test_id = t.id
     WHERE st.sample_id = $1 AND res.is_validated = true
     ORDER BY ra.sort_order, ra.created_at`,
    [sampleId]
  ).catch((err) => {
    if (err.code === '42P01') {
      logger.warn('result_attachments table missing — report will omit microscope images');
      return { rows: [] };
    }
    throw err;
  });

  const parameterCodes = results.map((r) => r.code).filter(Boolean);
  const { previousByCode, trendHistory } = await loadResultTrends(
    sample.animal_id,
    sampleId,
    parameterCodes
  );

  const panelName = [...new Set(results.map((r) => r.testNameEn).filter(Boolean))].join(' + ')
    || 'Laboratory Panel';

  const reportableAttachments = filterReportableAttachments(attachmentsResult.rows);

  const sections = buildReportSections({
    orderedTests: orderedTestsResult.rows,
    results,
    attachments: attachmentsResult.rows,
    language,
    labApproval: labApproval ?? { approved: false },
    vetApproval: vetApproval ?? { approved: false },
  });

  return {
    reportNumber,
    sampleCode: sample.sample_code,
    barcode: sample.barcode,
    date: sample.completed_date || new Date(),
    collectionDate: sample.collection_date,
    issuedDate: opts.issuedDate || sample.completed_date || new Date(),
    customerName: isArabic
      ? (sample.customer_name_ar || sample.customer_name)
      : sample.customer_name,
    customerMobile: sample.customer_mobile,
    nationalId: '-',
    animalCode: sample.animal_code,
    animalType: sample.animal_type,
    animalName: sample.animal_name,
    animalGender: sample.animal_gender,
    animalChip: sample.animal_chip,
    animalAge: sample.animal_age || '-',
    animalBreed: sample.animal_breed || '-',
    animalColor: sample.animal_color || '-',
    panelName,
    language,
    verificationCode,
    doctorNotes: uniqueByParameter[0]?.doctor_notes,
    aiInterpretation: aiInterpretation ?? null,
    clinicalInterpretation: aiInterpretation ?? null,
    treatmentRecommendations: treatmentRecommendations ?? null,
    labApproval: labApproval ?? { approved: false },
    vetApproval: vetApproval ?? { approved: false },
    results,
    sections,
    previousByCode,
    trendHistory,
    attachments: reportableAttachments,
    approvalSection: buildApprovalSection({
      labApproval: labApproval ?? { approved: false },
      vetApproval: vetApproval ?? { approved: false },
    }),
  };
};

const buildPdfPayload = async (reportRow) => {
  const isArabic = reportRow.language === 'ar';
  const base = await buildReportData(reportRow.sample_id, {
    reportNumber: reportRow.report_number,
    verificationCode: reportRow.qr_verification_code,
    language: reportRow.language,
    generatedBy: reportRow.generated_by,
    aiInterpretation: reportRow.ai_interpretation,
    treatmentRecommendations: reportRow.treatment_recommendations,
    issuedDate: reportRow.created_at,
    ...buildApprovalFields(reportRow, isArabic),
  });
  return { ...base, isFinal: reportRow.is_final !== false };
};

const regeneratePdf = async (reportRow) => {
  try {
    const existingName = extractFilename(reportRow.pdf_url);
    const reportData = await buildPdfPayload(reportRow);
    const localDir = path.join(ensureUploadDir(), 'reports');
    const pdf = await generateReportPDF(reportData, localDir, existingName ? { filename: existingName } : {});

    const saved = await persistLocalFile(pdf.filePath, 'reports', pdf.filename);
    if (saved.url !== reportRow.pdf_url) {
      await query('UPDATE reports SET pdf_url = $1 WHERE id = $2', [saved.url, reportRow.id]);
    }

    if (reportRow.pdf_url && reportRow.pdf_url !== saved.url) {
      await deleteFile(reportRow.pdf_url);
    }
    return saved.url;
  } catch (err) {
    if (err.isOperational) throw err;
    logger.error('Report PDF regeneration failed', {
      reportId: reportRow.id,
      message: err.message,
      stack: err.stack,
    });
    throw new AppError(
      `Could not regenerate report PDF: ${err.message}`,
      500,
      'PDF_REGENERATION_FAILED'
    );
  }
};

const regeneratePdfById = async (reportId) => {
  const reportRow = await getById(reportId);
  const pdfUrl = await regeneratePdf(reportRow);
  if (reportLifecycle.isEnabled()) {
    await reportLifecycle.recordOfficialGeneration(reportId);
    return getById(reportId);
  }
  return { ...reportRow, pdf_url: pdfUrl };
};

const ensurePdfFile = async (reportRow) => {
  if (reportRow.pdf_url && await fileExists(reportRow.pdf_url)) {
    return reportRow.pdf_url;
  }
  return regeneratePdf(reportRow);
};

const generate = async (sampleId, userId, userRole, language = 'ar', options = {}) => {
  try {
  const { reconcileSampleStatuses } = require('./samples.service');
  await reconcileSampleStatuses();

  const sampleResult = await query(
    'SELECT id FROM samples WHERE id = $1 AND status = $2',
    [sampleId, 'completed']
  );
  if (!sampleResult.rows[0]) {
    throw new AppError('Sample not found or not completed', 400, 'INVALID_SAMPLE');
  }

  const reportNumber = generateCode('RPT');
  const verificationCode = uuidv4().slice(0, 12).toUpperCase();
  const treatmentRecommendations = (options.treatment_recommendations || '').trim();

  const approveLab = options.approve_lab && canApproveAsLab(userRole);
  const approveVet = options.approve_vet && canApproveAsVet(userRole);

  const userResult = await query(
    'SELECT full_name, full_name_ar FROM users WHERE id = $1',
    [userId]
  );
  const user = userResult.rows[0];
  const isArabic = language === 'ar';
  const now = new Date();

  const labApproval = approveLab
    ? { approved: true, name: displayName(user, isArabic), approvedAt: now }
    : { approved: false };
  const vetApproval = approveVet
    ? { approved: true, name: displayName(user, isArabic), approvedAt: now }
    : { approved: false };

  const reportData = await buildReportData(sampleId, {
    reportNumber,
    verificationCode,
    language,
    generatedBy: userId,
    treatmentRecommendations,
    labApproval,
    vetApproval,
  });
  reportData.isFinal = true;

  const outputDir = path.join(ensureUploadDir(), 'reports');
  const pdf = await generateReportPDF(reportData, outputDir);
  await persistLocalFile(pdf.filePath, 'reports', pdf.filename);

  const result = await query(
    `INSERT INTO reports (
       id, report_number, sample_id, pdf_url, qr_verification_code, generated_by, language,
       ai_interpretation, treatment_recommendations,
       lab_specialist_approved_by, lab_specialist_approved_at,
       vet_approved_by, vet_approved_at,
       is_final
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8, $9, $10, $11, $12, true)
     RETURNING *`,
    [
      uuidv4(), reportNumber, sampleId, pdf.url, verificationCode, userId, language,
      treatmentRecommendations || null,
      approveLab ? userId : null,
      approveLab ? now : null,
      approveVet ? userId : null,
      approveVet ? now : null,
    ]
  );

  await reportLifecycle.recordInitialGeneration(result.rows[0].id);
  return getById(result.rows[0].id);
  } catch (err) {
    if (err.isOperational) throw err;
    logger.error('Report generation failed', {
      sampleId,
      message: err.message,
      stack: err.stack,
    });
    throw new AppError(
      `Could not generate report PDF: ${err.message}`,
      500,
      'PDF_GENERATION_FAILED'
    );
  }
};

const approve = async (reportId, userId, userRole, type) => {
  const report = await getById(reportId);

  if (type === 'lab') {
    if (!canApproveAsLab(userRole)) {
      throw new AppError('Only lab specialists can approve as lab specialist', 403, 'FORBIDDEN');
    }
    if (report.lab_specialist_approved_by) {
      throw new AppError('Lab specialist approval already recorded', 400, 'ALREADY_APPROVED');
    }
    await query(
      `UPDATE reports SET lab_specialist_approved_by = $1, lab_specialist_approved_at = NOW() WHERE id = $2`,
      [userId, reportId]
    );
  } else if (type === 'vet') {
    if (!canApproveAsVet(userRole)) {
      throw new AppError('Only veterinarians can approve as veterinarian', 403, 'FORBIDDEN');
    }
    if (report.vet_approved_by) {
      throw new AppError('Veterinarian approval already recorded', 400, 'ALREADY_APPROVED');
    }
    await query(
      `UPDATE reports SET vet_approved_by = $1, vet_approved_at = NOW() WHERE id = $2`,
      [userId, reportId]
    );
  } else {
    throw new AppError('Invalid approval type', 400, 'INVALID_TYPE');
  }

  const updated = await getById(reportId);
  await regeneratePdf(updated);
  if (reportLifecycle.isEnabled()) {
    await reportLifecycle.recordOfficialGeneration(reportId);
    return getById(reportId);
  }
  return updated;
};

const servePdf = async (filename, res) => {
  const report = await query(`${REPORT_SELECT} WHERE r.pdf_url LIKE $1`, [`%${filename}`]);
  if (!report.rows[0]) throw new AppError('Report not found', 404, 'NOT_FOUND');

  const pdfUrl = await ensurePdfFile(report.rows[0]);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

  const stream = await createReadStream(pdfUrl);
  await new Promise((resolve, reject) => {
    stream.on('error', reject);
    stream.on('end', resolve);
    stream.pipe(res);
  });
};

const getPreview = async (id) => {
  const reportRow = await getById(id);
  const base = await buildPdfPayload(reportRow);

  const metaResult = await query(
    `SELECT s.barcode, s.collection_date, s.received_date, s.department, s.notes as sample_notes,
            s.completed_date, s.status as sample_status,
            a.age, a.color, a.breed, a.weight,
            inv.invoice_number as order_number,
            cb.full_name as collected_by_name, cb.full_name_ar as collected_by_name_ar
     FROM samples s
     JOIN animals a ON s.animal_id = a.id
     LEFT JOIN invoices inv ON inv.sample_id = s.id
     LEFT JOIN users cb ON s.created_by = cb.id
     WHERE s.id = $1`,
    [reportRow.sample_id]
  );
  const meta = metaResult.rows[0] || {};

  const isArabic = reportRow.language === 'ar';
  const verifyUrl = `${env.appUrl}/verify/${reportRow.qr_verification_code}`;

  const unified = portalSync.buildUnifiedReportView({
    id: reportRow.id,
    sampleId: reportRow.sample_id,
    pdfUrl: reportRow.pdf_url,
    reportNumber: base.reportNumber,
    orderNumber: meta.order_number || base.sampleCode,
    sampleCode: base.sampleCode,
    barcode: meta.barcode,
    status: reportRow.is_final ? 'final' : 'preliminary',
    language: reportRow.language,
    issuedAt: reportRow.created_at,
    requestedAt: meta.collection_date || reportRow.created_at,
    verificationCode: reportRow.qr_verification_code,
    verifyUrl,
    lab: {
      name: env.lab.name,
      nameAr: env.lab.nameAr,
      subtitle: env.lab.subtitle,
      subtitleAr: env.lab.subtitleAr,
      address: env.lab.address,
      phone: env.lab.phone,
      email: env.lab.email,
    },
    customer: {
      name: base.customerName,
      mobile: base.customerMobile,
    },
    animal: {
      code: base.animalCode,
      type: base.animalType,
      name: base.animalName,
      gender: base.animalGender,
      chip: base.animalChip,
      age: meta.age,
      breed: meta.breed || base.animalBreed,
      color: meta.color || base.animalColor,
      weight: meta.weight,
    },
    sample: {
      id: base.sampleCode,
      type: meta.department || 'Blood',
      collectionDate: meta.collection_date,
      receivedDate: meta.received_date,
      condition: meta.sample_notes ? meta.sample_notes : (meta.sample_status === 'completed' ? 'Acceptable' : 'Pending'),
      collectedBy: isArabic
        ? (meta.collected_by_name_ar || meta.collected_by_name || '-')
        : (meta.collected_by_name || '-'),
    },
    results: base.results,
    sections: base.sections || [],
    attachments: await Promise.all((base.attachments || []).map(mapAttachmentForPreview)),
    approvalSection: base.approvalSection || buildApprovalSection({
      labApproval: base.labApproval,
      vetApproval: base.vetApproval,
    }),
    interpretation: base.aiInterpretation,
    recommendations: base.treatmentRecommendations,
    doctorNotes: base.doctorNotes,
    approvals: {
      lab: base.labApproval,
      vet: base.vetApproval,
    },
    generatedBy: reportRow.generated_by_name,
  }, reportRow, { hasValidatedResults: true });

  if (reportLifecycle.isEnabled()) {
    unified.smartLifecycle = await reportLifecycle.getReportLifecycleStatus(
      reportRow,
      reportRow.language || 'ar'
    );
  }

  return unified;
};

const getLifecycleStatus = async (id) => {
  const reportRow = await getById(id);
  return reportLifecycle.getReportLifecycleStatus(reportRow, reportRow.language || 'ar');
};

const verify = async (code) => {
  const result = await query(
    `SELECT r.*, s.sample_code, c.full_name as customer_name
     FROM reports r JOIN samples s ON r.sample_id = s.id
     JOIN customers c ON s.customer_id = c.id
     WHERE r.qr_verification_code = $1 OR r.report_number = $1`,
    [code]
  );

  if (!result.rows[0]) throw new AppError('Report not found', 404, 'NOT_FOUND');
  return {
    valid: true,
    report_number: result.rows[0].report_number,
    sample_code: result.rows[0].sample_code,
    customer_name: result.rows[0].customer_name,
    generated_at: result.rows[0].created_at,
    is_final: result.rows[0].is_final,
  };
};

const updateNotes = async (reportId, { treatment_recommendations, ai_interpretation } = {}) => {
  const report = await getById(reportId);
  const fields = [];
  const params = [];
  let idx = 1;

  if (treatment_recommendations !== undefined) {
    fields.push(`treatment_recommendations = $${idx++}`);
    params.push(treatment_recommendations || null);
  }
  if (ai_interpretation !== undefined) {
    fields.push(`ai_interpretation = $${idx++}`);
    params.push(ai_interpretation || null);
  }

  if (fields.length === 0) return report;

  params.push(reportId);
  await query(
    `UPDATE reports SET ${fields.join(', ')} WHERE id = $${idx}`,
    params
  );

  if (reportLifecycle.isEnabled()) {
    await reportLifecycle.markReportNeedsUpdate(reportId, 'Report notes updated');
  }

  return getById(reportId);
};

module.exports = {
  list, getPreview, getLifecycleStatus, generate, approve, verify, servePdf, regeneratePdfById, buildReportData, updateNotes,
};
