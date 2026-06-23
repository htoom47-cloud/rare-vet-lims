const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const env = require('../config/env');
const logger = require('../config/logger');
const { AppError } = require('../middleware/errorHandler');
const { hashToken, normalizeMobileDigits, paginate, buildPagination } = require('../utils/helpers');
const { formatToE164 } = require('../utils/phone');
const reportsService = require('./reports.service');
const notificationProvider = require('./notification-providers');

const OTP_TTL_MINUTES = 10;
const OTP_COOLDOWN_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;

const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

const findCustomerByMobile = async (mobile) => {
  const digits = normalizeMobileDigits(mobile);
  if (digits.length < 9) return null;

  const result = await query(
    `SELECT id, full_name, full_name_ar, mobile, city, farm_company
     FROM customers
     WHERE is_active = true
       AND regexp_replace(mobile, '[^0-9]', '', 'g') LIKE $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [`%${digits.slice(-9)}`]
  );

  return result.rows[0] || null;
};

const requestOtp = async (mobile) => {
  const customer = await findCustomerByMobile(mobile);
  if (!customer) {
    throw new AppError('No account found for this mobile number', 404, 'CUSTOMER_NOT_FOUND');
  }

  const recent = await query(
    `SELECT created_at FROM customer_otp_codes
     WHERE customer_id = $1 AND used_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [customer.id]
  );

  if (recent.rows[0]) {
    const elapsed = (Date.now() - new Date(recent.rows[0].created_at).getTime()) / 1000;
    if (elapsed < OTP_COOLDOWN_SECONDS) {
      throw new AppError('Please wait before requesting a new code', 429, 'OTP_COOLDOWN');
    }
  }

  const otp = generateOtp();
  const otpHash = hashToken(otp);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await query(
    `INSERT INTO customer_otp_codes (customer_id, otp_hash, expires_at) VALUES ($1, $2, $3)`,
    [customer.id, otpHash, expiresAt]
  );

  const message = [
    `${env.lab.nameAr}`,
    `رمز الدخول إلى بوابة العميل: ${otp}`,
    `الرابط: ${env.portalAppUrl}`,
    `صالح لمدة ${OTP_TTL_MINUTES} دقائق.`,
    '',
    `${env.lab.name}`,
    `Your client portal code: ${otp}`,
    `URL: ${env.portalAppUrl}`,
    `Valid for ${OTP_TTL_MINUTES} minutes.`,
  ].join('\n');

  const e164 = formatToE164(customer.mobile);
  let sent = false;

  if (env.notifications.sms && e164) {
    try {
      await notificationProvider.send({ channel: 'sms', recipient: e164, body: message });
      sent = true;
    } catch (err) {
      logger.warn('Portal OTP SMS failed', { error: err.message, customerId: customer.id });
    }
  }

  if (!sent && env.nodeEnv !== 'production') {
    logger.info('Portal OTP (dev)', { mobile: customer.mobile, otp });
  }

  const response = {
    message: 'Verification code sent',
    message_ar: 'تم إرسال رمز التحقق',
    expiresIn: OTP_TTL_MINUTES * 60,
    customerName: customer.full_name_ar || customer.full_name,
  };

  if (env.nodeEnv !== 'production' && !sent) {
    response.debugOtp = otp;
  }

  return response;
};

const verifyOtp = async (mobile, otp) => {
  const customer = await findCustomerByMobile(mobile);
  if (!customer) {
    throw new AppError('Invalid verification code', 401, 'INVALID_OTP');
  }

  const otpHash = hashToken(String(otp).trim());
  const record = await query(
    `SELECT id, attempts FROM customer_otp_codes
     WHERE customer_id = $1 AND otp_hash = $2 AND used_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [customer.id, otpHash]
  );

  if (!record.rows[0]) {
    const latest = await query(
      `SELECT id, attempts FROM customer_otp_codes
       WHERE customer_id = $1 AND used_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [customer.id]
    );

    if (latest.rows[0]) {
      const attempts = latest.rows[0].attempts + 1;
      await query('UPDATE customer_otp_codes SET attempts = $1 WHERE id = $2', [attempts, latest.rows[0].id]);
      if (attempts >= OTP_MAX_ATTEMPTS) {
        await query('UPDATE customer_otp_codes SET used_at = NOW() WHERE id = $1', [latest.rows[0].id]);
      }
    }

    throw new AppError('Invalid or expired verification code', 401, 'INVALID_OTP');
  }

  await query('UPDATE customer_otp_codes SET used_at = NOW() WHERE id = $1', [record.rows[0].id]);

  const accessToken = jwt.sign(
    { customerId: customer.id, type: 'customer' },
    env.jwt.secret,
    { expiresIn: env.jwt.portalExpiresIn }
  );

  return {
    accessToken,
    customer: {
      id: customer.id,
      full_name: customer.full_name,
      full_name_ar: customer.full_name_ar,
      mobile: customer.mobile,
      city: customer.city,
      farm_company: customer.farm_company,
    },
  };
};

const assertReportOwnership = async (reportId, customerId) => {
  const result = await query(
    `SELECT r.id FROM reports r
     JOIN samples s ON r.sample_id = s.id
     WHERE r.id = $1 AND s.customer_id = $2`,
    [reportId, customerId]
  );
  if (!result.rows[0]) throw new AppError('Report not found', 404, 'NOT_FOUND');
};

const logPortalAccess = (customerId, action, reportId = null) => {
  logger.info('Portal access', { customerId, action, reportId });
};

const sanitizePortalPreview = (preview) => {
  const { sampleId, generatedBy, ...safe } = preview;
  return {
    ...safe,
    customer: preview.customer ? { name: preview.customer.name } : preview.customer,
  };
};

const listReports = async (customerId, { page, limit }) => {
  const { offset, page: p, limit: l } = paginate(page, limit);

  const countResult = await query(
    `SELECT COUNT(*) FROM reports r
     JOIN samples s ON r.sample_id = s.id
     WHERE s.customer_id = $1`,
    [customerId]
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await query(
    `SELECT r.id, r.report_number, r.pdf_url, r.language, r.is_final, r.created_at,
            s.sample_code, s.status as sample_status,
            a.animal_code, a.animal_type, a.name_tag as animal_name
     FROM reports r
     JOIN samples s ON r.sample_id = s.id
     LEFT JOIN animals a ON s.animal_id = a.id
     WHERE s.customer_id = $1
     ORDER BY r.created_at DESC
     LIMIT $2 OFFSET $3`,
    [customerId, l, offset]
  );

  return { data: result.rows, pagination: buildPagination(total, p, l) };
};

const getReportPreview = async (reportId, customerId) => {
  await assertReportOwnership(reportId, customerId);
  logPortalAccess(customerId, 'report_preview', reportId);
  const preview = await reportsService.getPreview(reportId);
  return sanitizePortalPreview(preview);
};

const serveReportPdf = async (filename, customerId, res) => {
  const report = await query(
    `SELECT r.id, r.pdf_url FROM reports r
     JOIN samples s ON r.sample_id = s.id
     WHERE s.customer_id = $1 AND r.pdf_url LIKE $2`,
    [customerId, `%${filename}`]
  );

  if (!report.rows[0]) throw new AppError('Report not found', 404, 'NOT_FOUND');
  logPortalAccess(customerId, 'report_pdf', report.rows[0].id);
  return reportsService.servePdf(filename, res);
};

module.exports = {
  requestOtp,
  verifyOtp,
  listReports,
  getReportPreview,
  serveReportPdf,
};
