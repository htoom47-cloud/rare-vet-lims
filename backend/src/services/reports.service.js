const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { generateCode, paginate, buildPagination } = require('../utils/helpers');
const { generateReportPDF } = require('../utils/pdf');
const { ensureUploadDir } = require('../config/storage');
const env = require('../config/env');

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

const generate = async (sampleId, userId, language = 'en') => {
  const sampleResult = await query(
    `SELECT s.*, c.full_name as customer_name, a.animal_code, a.animal_type, a.name_tag as animal_name, a.gender as animal_gender
     FROM samples s
     JOIN customers c ON s.customer_id = c.id
     JOIN animals a ON s.animal_id = a.id
     WHERE s.id = $1 AND s.status = 'completed'`,
    [sampleId]
  );

  if (!sampleResult.rows[0]) {
    throw new AppError('Sample not found or not completed', 400, 'INVALID_SAMPLE');
  }

  const sample = sampleResult.rows[0];

  const resultsData = await query(
    `SELECT t.name as test_name, tp.name as parameter_name, rv.value, tp.unit,
            tr.min_value, tr.max_value, rv.flag, rv.is_critical, r.doctor_notes
     FROM sample_tests st
     JOIN tests t ON st.test_id = t.id
     JOIN results res ON res.sample_test_id = st.id
     JOIN result_values rv ON rv.result_id = res.id
     JOIN test_parameters tp ON rv.parameter_id = tp.id
     LEFT JOIN test_reference_ranges tr ON tr.parameter_id = tp.id AND (tr.animal_type = $2 OR tr.animal_type IS NULL)
     LEFT JOIN results r ON r.sample_test_id = st.id
     WHERE st.sample_id = $1 AND res.is_validated = true`,
    [sampleId, sample.animal_type]
  );

  if (!resultsData.rows.length) {
    throw new AppError('No validated results found', 400, 'NO_RESULTS');
  }

  const reportNumber = generateCode('RPT');
  const verificationCode = uuidv4().slice(0, 12).toUpperCase();

  const userResult = await query('SELECT full_name FROM users WHERE id = $1', [userId]);

  const reportData = {
    reportNumber,
    sampleCode: sample.sample_code,
    date: sample.completed_date || new Date(),
    customerName: sample.customer_name,
    animalCode: sample.animal_code,
    animalType: sample.animal_type,
    animalName: sample.animal_name,
    animalGender: sample.animal_gender,
    language,
    verificationCode,
    specialistName: userResult.rows[0]?.full_name,
    doctorNotes: resultsData.rows[0]?.doctor_notes,
    results: resultsData.rows.map((r) => ({
      name: r.parameter_name || r.test_name,
      value: r.value,
      unit: r.unit,
      reference: r.min_value != null ? `${r.min_value} - ${r.max_value}` : '-',
      flag: r.flag,
      isCritical: r.is_critical,
    })),
  };

  const outputDir = path.join(ensureUploadDir(), 'reports');
  const pdf = await generateReportPDF(reportData, outputDir);

  const result = await query(
    `INSERT INTO reports (report_number, sample_id, pdf_url, qr_verification_code, generated_by, language, is_final)
     VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING *`,
    [reportNumber, sampleId, pdf.url, verificationCode, userId, language]
  );

  return { ...result.rows[0], pdf_url: pdf.url };
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

module.exports = { list, generate, verify };
