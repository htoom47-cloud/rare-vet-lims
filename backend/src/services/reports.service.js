const path = require('path');
const { uuidv4 } = require('../utils/uuid');
const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { generateCode, paginate, buildPagination } = require('../utils/helpers');
const { generateReportPDF } = require('../utils/pdf');
const { ensureUploadDir, persistLocalFile, deleteFile, createReadStream, serveUploads } = require('../config/storage');
const { compareByNormaOrder } = require('../utils/norma-cbc-map');

const LAB_APPROVER_ROLES = new Set(['lab_specialist', 'lab_technician', 'manager', 'admin']);
const VET_APPROVER_ROLES = new Set(['veterinarian', 'manager', 'admin']);

const extractFilename = (pdfUrl) => (pdfUrl ? pdfUrl.split('/').pop() : null);

const canApproveAsLab = (role) => LAB_APPROVER_ROLES.has(role);
const canApproveAsVet = (role) => VET_APPROVER_ROLES.has(role);

const displayName = (user, isArabic) => {
  if (!user) return null;
  return isArabic ? (user.full_name_ar || user.full_name) : user.full_name;
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

const buildReportData = async (sampleId, opts) => {
  const {
    reportNumber, verificationCode, language, generatedBy,
    aiInterpretation, treatmentRecommendations, labApproval, vetApproval,
  } = opts;

  const sampleResult = await query(
    `SELECT s.*, c.full_name as customer_name, c.full_name_ar as customer_name_ar,
            c.mobile as customer_mobile,
            a.animal_code, a.animal_type, a.name_tag as animal_name,
            a.gender as animal_gender, a.rfid_chip as animal_chip
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

  const resultsData = await query(
    `SELECT tp.id as parameter_id, tp.code as parameter_code, tp.sort_order,
            t.name as test_name, t.name_ar as test_name_ar, t.code as test_code,
            tp.name as parameter_name, tp.name_ar as parameter_name_ar,
            rv.value, rv.numeric_value, tp.unit, tr.min_value, tr.max_value, rv.flag, rv.is_critical, res.doctor_notes
     FROM sample_tests st
     JOIN tests t ON st.test_id = t.id
     JOIN results res ON res.sample_test_id = st.id AND res.is_validated = true
     JOIN result_values rv ON rv.result_id = res.id
     JOIN test_parameters tp ON rv.parameter_id = tp.id
     LEFT JOIN LATERAL (
       SELECT min_value, max_value
       FROM test_reference_ranges
       WHERE parameter_id = tp.id AND (animal_type = $2 OR animal_type IS NULL)
       ORDER BY CASE WHEN animal_type = $2 THEN 0 ELSE 1 END
       LIMIT 1
     ) tr ON true
     WHERE st.sample_id = $1
     ORDER BY tp.sort_order, tp.id`,
    [sampleId, sample.animal_type]
  );

  if (!resultsData.rows.length) {
    throw new AppError('No validated results found', 400, 'NO_RESULTS');
  }

  const formatNumber = (value) => {
    if (value == null || value === '') return null;
    const num = Number(value);
    if (Number.isNaN(num)) return String(value);
    return Number.isInteger(num) ? String(num) : num.toFixed(2).replace(/\.?0+$/, '');
  };

  const uniqueByParameter = [];
  const seenParameters = new Set();
  const sortedRows = [...resultsData.rows].sort(compareByNormaOrder);
  for (const row of sortedRows) {
    if (seenParameters.has(row.parameter_id)) continue;
    seenParameters.add(row.parameter_id);
    uniqueByParameter.push(row);
  }

  const isArabic = language === 'ar';
  const results = uniqueByParameter.map((r) => ({
    code: r.parameter_code,
    nameAr: r.parameter_name_ar || r.parameter_name || r.test_name,
    nameEn: r.parameter_name || r.test_name,
    testNameAr: r.test_name_ar || r.test_name,
    testNameEn: r.test_name,
    value: formatNumber(r.numeric_value ?? r.value) ?? '-',
    numericValue: r.numeric_value != null ? Number(r.numeric_value) : null,
    unit: r.unit,
    minValue: r.min_value != null ? Number(r.min_value) : null,
    maxValue: r.max_value != null ? Number(r.max_value) : null,
    reference: r.min_value != null
      ? `${formatNumber(r.min_value)} - ${formatNumber(r.max_value)}`
      : '-',
    flag: r.flag,
    isCritical: r.is_critical,
  }));

  return {
    reportNumber,
    sampleCode: sample.sample_code,
    date: sample.completed_date || new Date(),
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
    language,
    verificationCode,
    doctorNotes: uniqueByParameter[0]?.doctor_notes,
    aiInterpretation: aiInterpretation ?? null,
    treatmentRecommendations: treatmentRecommendations ?? null,
    labApproval: labApproval ?? { approved: false },
    vetApproval: vetApproval ?? { approved: false },
    results,
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
    ...buildApprovalFields(reportRow, isArabic),
  });
  return base;
};

const regeneratePdf = async (reportRow) => {
  const filename = extractFilename(reportRow.pdf_url);
  if (!filename) throw new AppError('Report file not found', 404, 'NOT_FOUND');

  if (reportRow.pdf_url) {
    await deleteFile(reportRow.pdf_url);
  }

  const reportData = await buildPdfPayload(reportRow);
  const localDir = path.join(ensureUploadDir(), 'reports');
  const pdf = await generateReportPDF(reportData, localDir, { filename });
  await persistLocalFile(pdf.filePath, 'reports', pdf.filename);
  return reportRow.pdf_url;
};

const ensurePdfFile = async (reportRow) => regeneratePdf(reportRow);

const generate = async (sampleId, userId, userRole, language = 'ar', options = {}) => {
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

  return getById(result.rows[0].id);
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
  return updated;
};

const servePdf = async (filename, res) => {
  const report = await query(`${REPORT_SELECT} WHERE r.pdf_url LIKE $1`, [`%${filename}`]);
  if (!report.rows[0]) throw new AppError('Report not found', 404, 'NOT_FOUND');

  await ensurePdfFile(report.rows[0]);
  const pdfUrl = report.rows[0].pdf_url;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

  const stream = await createReadStream(pdfUrl);
  await new Promise((resolve, reject) => {
    stream.on('error', reject);
    stream.on('end', resolve);
    stream.pipe(res);
  });
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

module.exports = { list, generate, approve, verify, servePdf };
