const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { generateCode, paginate, buildPagination } = require('../utils/helpers');
const { generateReportPDF } = require('../utils/pdf');
const { ensureUploadDir } = require('../config/storage');
const { generateInterpretation } = require('./ai-interpretation.service');

const extractFilename = (pdfUrl) => (pdfUrl ? pdfUrl.split('/').pop() : null);

const list = async ({ page, limit }) => {
  const { offset, page: p, limit: l } = paginate(page, limit);
  const countResult = await query('SELECT COUNT(*) FROM reports');
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await query(
    `SELECT r.*, s.sample_code, c.full_name as customer_name, u.full_name as generated_by_name
     FROM reports r
     LEFT JOIN samples s ON r.sample_id = s.id
     LEFT JOIN customers c ON s.customer_id = c.id
     LEFT JOIN users u ON r.generated_by = u.id
     ORDER BY r.created_at DESC LIMIT $1 OFFSET $2`,
    [l, offset]
  );

  return { data: result.rows, pagination: buildPagination(total, p, l) };
};

const buildReportData = async (sampleId, opts) => {
  const {
    reportNumber, verificationCode, language, generatedBy,
    aiInterpretation, treatmentRecommendations,
  } = opts;

  const sampleResult = await query(
    `SELECT s.*, c.full_name as customer_name, c.full_name_ar as customer_name_ar,
            a.animal_code, a.animal_type, a.name_tag as animal_name, a.gender as animal_gender
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
    `SELECT tp.id as parameter_id, t.name as test_name, tp.name as parameter_name, tp.name_ar as parameter_name_ar,
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
     ORDER BY tp.id`,
    [sampleId, sample.animal_type]
  );

  if (!resultsData.rows.length) {
    throw new AppError('No validated results found', 400, 'NO_RESULTS');
  }

  const userResult = generatedBy
    ? await query('SELECT full_name, full_name_ar FROM users WHERE id = $1', [generatedBy])
    : { rows: [] };

  const formatNumber = (value) => {
    if (value == null || value === '') return null;
    const num = Number(value);
    if (Number.isNaN(num)) return String(value);
    return Number.isInteger(num) ? String(num) : num.toFixed(2).replace(/\.?0+$/, '');
  };

  const uniqueByParameter = [];
  const seenParameters = new Set();
  for (const row of resultsData.rows) {
    if (seenParameters.has(row.parameter_id)) continue;
    seenParameters.add(row.parameter_id);
    uniqueByParameter.push(row);
  }

  const isArabic = language === 'ar';
  const results = uniqueByParameter.map((r) => ({
    name: isArabic
      ? (r.parameter_name_ar || r.parameter_name || r.test_name)
      : (r.parameter_name || r.test_name),
    value: formatNumber(r.numeric_value ?? r.value) ?? '-',
    unit: r.unit,
    reference: r.min_value != null
      ? `${formatNumber(r.min_value)} - ${formatNumber(r.max_value)}`
      : '-',
    flag: r.flag,
    isCritical: r.is_critical,
  }));

  const specialist = userResult.rows[0];
  return {
    reportNumber,
    sampleCode: sample.sample_code,
    date: sample.completed_date || new Date(),
    customerName: isArabic
      ? (sample.customer_name_ar || sample.customer_name)
      : sample.customer_name,
    animalCode: sample.animal_code,
    animalType: sample.animal_type,
    animalName: sample.animal_name,
    animalGender: sample.animal_gender,
    language,
    verificationCode,
    specialistName: isArabic
      ? (specialist?.full_name_ar || specialist?.full_name)
      : specialist?.full_name,
    doctorNotes: uniqueByParameter[0]?.doctor_notes,
    aiInterpretation: aiInterpretation ?? null,
    treatmentRecommendations: treatmentRecommendations ?? null,
    results,
  };
};

const previewInterpretation = async (sampleId, language = 'ar') => {
  const data = await buildReportData(sampleId, {
    reportNumber: 'PREVIEW',
    verificationCode: 'PREVIEW',
    language,
    generatedBy: null,
  });
  return generateInterpretation(data.results, language, data.animalType);
};

const ensurePdfFile = async (reportRow) => {
  const filename = extractFilename(reportRow.pdf_url);
  if (!filename) throw new AppError('Report file not found', 404, 'NOT_FOUND');

  const filePath = path.join(ensureUploadDir(), 'reports', filename);
  if (fs.existsSync(filePath)) {
    await fs.promises.unlink(filePath);
  }

  const reportData = await buildReportData(reportRow.sample_id, {
    reportNumber: reportRow.report_number,
    verificationCode: reportRow.qr_verification_code,
    language: reportRow.language,
    generatedBy: reportRow.generated_by,
    aiInterpretation: reportRow.ai_interpretation,
    treatmentRecommendations: reportRow.treatment_recommendations,
  });

  const pdf = await generateReportPDF(
    reportData,
    path.join(ensureUploadDir(), 'reports'),
    { filename }
  );
  return pdf.filePath;
};

const generate = async (sampleId, userId, language = 'ar', options = {}) => {
  const sampleResult = await query(
    'SELECT id FROM samples WHERE id = $1 AND status = $2',
    [sampleId, 'completed']
  );
  if (!sampleResult.rows[0]) {
    throw new AppError('Sample not found or not completed', 400, 'INVALID_SAMPLE');
  }

  const reportNumber = generateCode('RPT');
  const verificationCode = uuidv4().slice(0, 12).toUpperCase();

  const baseData = await buildReportData(sampleId, {
    reportNumber,
    verificationCode,
    language,
    generatedBy: userId,
  });

  const aiInterpretation = generateInterpretation(baseData.results, language, baseData.animalType);
  const treatmentRecommendations = (options.treatment_recommendations || '').trim();

  const reportData = {
    ...baseData,
    aiInterpretation,
    treatmentRecommendations,
  };

  const outputDir = path.join(ensureUploadDir(), 'reports');
  const pdf = await generateReportPDF(reportData, outputDir);

  const result = await query(
    `INSERT INTO reports (report_number, sample_id, pdf_url, qr_verification_code, generated_by, language,
                         ai_interpretation, treatment_recommendations, is_final)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true) RETURNING *`,
    [reportNumber, sampleId, pdf.url, verificationCode, userId, language, aiInterpretation, treatmentRecommendations || null]
  );

  return { ...result.rows[0], pdf_url: pdf.url };
};

const servePdf = async (filename, res) => {
  const report = await query('SELECT * FROM reports WHERE pdf_url LIKE $1', [`%${filename}`]);
  if (!report.rows[0]) throw new AppError('Report not found', 404, 'NOT_FOUND');

  const filePath = await ensurePdfFile(report.rows[0]);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
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

module.exports = { list, generate, verify, servePdf, previewInterpretation };
