const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const env = require('../config/env');
const logger = require('../config/logger');
const { AppError } = require('../middleware/errorHandler');
const { hashToken, normalizeMobileDigits, paginate, buildPagination } = require('../utils/helpers');
const { formatToE164 } = require('../utils/phone');
const reportsService = require('./reports.service');
const portalSync = require('./portal-sync.service');
const billingService = require('./billing.service');
const notificationProvider = require('./notification-providers');
const {
  PANELS,
  panelStatusFromResults,
  buildPanelDetails,
  summarizeResults,
  enrichParameters,
  buildInterpretation,
  flagSeverity,
} = require('../utils/portal-analytics');

const OTP_LENGTH = 4;
const OTP_TTL_MINUTES = 10;
const OTP_COOLDOWN_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;

const asArray = (v) => (Array.isArray(v) ? v : [v]);

const generateOtp = () => env.portal.staticOtp || String(Math.floor(10 ** (OTP_LENGTH - 1) + Math.random() * 9 * 10 ** (OTP_LENGTH - 1)));

const issuePortalToken = (customer) => {
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

  if (env.portal.staticOtp) {
    logger.warn('Portal static OTP enabled — remove PORTAL_OTP_STATIC when SMS is ready');
    const payload = {
      message: 'Verification code sent',
      message_ar: 'تم إرسال رمز التحقق',
      expiresIn: OTP_TTL_MINUTES * 60,
      customerName: customer.full_name_ar || customer.full_name,
    };
    if (env.nodeEnv !== 'production') {
      payload.debugOtp = env.portal.staticOtp;
    }
    return payload;
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
    env.lab.nameAr,
    `رمز الدخول: ${otp}`,
    `صالح ${OTP_TTL_MINUTES} دقائق`,
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

  const code = String(otp).trim();
  if (env.portal.staticOtp && code === env.portal.staticOtp) {
    logger.warn('Portal login via static OTP', { customerId: customer.id });
    return issuePortalToken(customer);
  }

  const otpHash = hashToken(code);
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

  return issuePortalToken(customer);
};

const assertReportOwnership = async (reportId, customerIds) => {
  const ids = asArray(customerIds);
  const result = await query(
    `SELECT r.id FROM reports r
     JOIN samples s ON r.sample_id = s.id
     WHERE r.id = $1 AND s.customer_id = ANY($2::uuid[])`,
    [reportId, ids]
  );
  if (!result.rows[0]) throw new AppError('Report not found', 404, 'NOT_FOUND');
};

const logPortalAccess = (customerId, action, reportId = null) => {
  logger.info('Portal access', { customerId, action, reportId });
};

const sanitizePortalPreview = (preview) => portalSync.sanitizeForPortal(preview);

const portalReportFilter = portalSync.portalVisibilitySql('r');

const listReports = async (customerIds, { page, limit, animalId }) => {
  const ids = asArray(customerIds);
  const { offset, page: p, limit: l } = paginate(page, limit);

  const filters = ['s.customer_id = ANY($1::uuid[])', portalReportFilter];
  const params = [ids];
  if (animalId) {
    params.push(animalId);
    filters.push(`a.id = $${params.length}`);
  }
  const where = filters.join(' AND ');

  const countResult = await query(
    `SELECT COUNT(*) FROM reports r
     JOIN samples s ON r.sample_id = s.id
     LEFT JOIN animals a ON s.animal_id = a.id
     WHERE ${where}`,
    params
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const listParams = [...params, l, offset];
  const result = await query(
    `SELECT r.id, r.report_number, r.pdf_url, r.language, r.is_final, r.created_at,
            r.lab_specialist_approved_by, r.vet_approved_by,
            s.sample_code, s.status as sample_status, s.animal_id,
            a.animal_code, a.animal_type, a.name_tag as animal_name
     FROM reports r
     JOIN samples s ON r.sample_id = s.id
     LEFT JOIN animals a ON s.animal_id = a.id
     WHERE ${where}
     ORDER BY r.created_at DESC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );

  return { data: result.rows, pagination: buildPagination(total, p, l) };
};

const assertAnimalOwnership = async (animalId, customerIds) => {
  const ids = asArray(customerIds);
  const result = await query(
    `SELECT a.id, a.animal_code, a.animal_type, a.name_tag, a.gender, a.age, a.color, a.rfid_chip,
            c.full_name as owner_name, c.full_name_ar as owner_name_ar, c.farm_company
     FROM animals a
     JOIN customers c ON a.owner_id = c.id
     WHERE a.id = $1 AND a.owner_id = ANY($2::uuid[]) AND a.is_active = true`,
    [animalId, ids]
  );
  if (!result.rows[0]) throw new AppError('Animal not found', 404, 'NOT_FOUND');
  return result.rows[0];
};

const fetchAnimalReports = async (customerIds, animalId, limit = 20) => {
  const ids = asArray(customerIds);
  const params = [ids, animalId];
  let limitClause = '';
  if (limit) {
    params.push(limit);
    limitClause = `LIMIT $${params.length}`;
  }
  const result = await query(
    `SELECT r.id, r.report_number, r.pdf_url, r.created_at, r.is_final,
            r.lab_specialist_approved_by, r.vet_approved_by,
            s.sample_code, s.collection_date
     FROM reports r
     JOIN samples s ON r.sample_id = s.id
     WHERE s.customer_id = ANY($1::uuid[]) AND s.animal_id = $2 AND ${portalReportFilter}
     ORDER BY r.created_at DESC
     ${limitClause}`,
    params
  );
  return result.rows;
};

const latestResultsForAnimal = async (customerIds, animalId) => {
  const ids = asArray(customerIds);
  const reports = await fetchAnimalReports(ids, animalId, 1);
  if (!reports[0]) return { results: [], report: null };
  await assertReportOwnership(reports[0].id, ids);
  const preview = await reportsService.getPreview(reports[0].id);
  const safe = sanitizePortalPreview(preview);
  return {
    results: safe.results || [],
    sections: safe.sections || [],
    summary: safe.summary || null,
    flags: safe.flags || null,
    report: reports[0],
  };
};

const buildPanels = (results) => buildPanelDetails(results);

const countCriticalFlags = (results) =>
  (results || []).filter((r) => flagSeverity(r.flag) >= 3).length;

const listAnimals = async (customerIds) => {
  const ids = asArray(customerIds);
  const result = await query(
    `SELECT a.id, a.animal_code, a.animal_type, a.name_tag, a.gender, a.age,
            COUNT(DISTINCT r.id)::int AS report_count,
            MAX(r.created_at) AS latest_report_at
     FROM animals a
     JOIN samples s ON s.animal_id = a.id
     JOIN reports r ON r.sample_id = s.id AND ${portalReportFilter}
     WHERE a.owner_id = ANY($1::uuid[]) AND a.is_active = true
     GROUP BY a.id
     ORDER BY latest_report_at DESC NULLS LAST, a.animal_code`,
    [ids]
  );
  return result.rows;
};

const getComparison = async (customerIds, animalId, reportIds = []) => {
  const ids = asArray(customerIds);
  const animal = await assertAnimalOwnership(animalId, ids);

  let reportsQuery;
  let reportsParams;
  if (reportIds.length >= 2) {
    reportsQuery = `
      SELECT r.id, r.report_number, r.created_at, s.sample_code
      FROM reports r
      JOIN samples s ON r.sample_id = s.id
      WHERE s.customer_id = ANY($1::uuid[]) AND s.animal_id = $2 AND r.id = ANY($3::uuid[])
        AND ${portalReportFilter}
      ORDER BY r.created_at ASC`;
    reportsParams = [ids, animalId, reportIds];
  } else {
    reportsQuery = `
      SELECT r.id, r.report_number, r.created_at, s.sample_code
      FROM reports r
      JOIN samples s ON r.sample_id = s.id
      WHERE s.customer_id = ANY($1::uuid[]) AND s.animal_id = $2 AND ${portalReportFilter}
      ORDER BY r.created_at DESC
      LIMIT 5`;
    reportsParams = [ids, animalId];
  }

  const reportsResult = await query(reportsQuery, reportsParams);
  const reports = reportsResult.rows.sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );

  if (reports.length < 2) {
    throw new AppError('At least two reports are required for comparison', 400, 'NEED_MORE_REPORTS');
  }

  const previews = await Promise.all(
    reports.map(async (row) => {
      await assertReportOwnership(row.id, ids);
      const preview = await reportsService.getPreview(row.id);
      const safe = sanitizePortalPreview(preview);
      return {
        id: row.id,
        reportNumber: row.report_number,
        sampleCode: row.sample_code,
        date: row.created_at,
        results: safe.results || [],
        sections: safe.sections || [],
        sectionSignature: safe.sectionSignature || [],
      };
    })
  );

  const paramMap = new Map();
  for (const report of previews) {
    for (const item of report.results) {
      const key = item.code || item.nameEn;
      if (!key) continue;
      if (!paramMap.has(key)) {
        paramMap.set(key, {
          code: item.code,
          nameAr: item.nameAr,
          nameEn: item.nameEn,
          unit: item.unit,
          reference: item.reference,
          categoryCode: item.categoryCode,
          values: {},
        });
      }
      paramMap.get(key).values[report.id] = {
        value: item.value,
        numericValue: item.numericValue,
        flag: item.flag,
      };
    }
  }

  const parameters = enrichParameters(
    [...paramMap.values()]
      .map((param) => {
        const series = previews
          .map((r) => param.values[r.id])
          .filter(Boolean);
        const nums = series
          .map((v) => v.numericValue)
          .filter((n) => n != null && !Number.isNaN(n));
        let trend = null;
        if (nums.length >= 2) {
          const diff = nums[nums.length - 1] - nums[0];
          if (Math.abs(diff) < 0.01) trend = 'stable';
          else trend = diff > 0 ? 'up' : 'down';
        }
        return {
          ...param,
          values: previews.map((r) => ({
            reportId: r.id,
            reportNumber: r.reportNumber,
            date: r.date,
            ...(param.values[r.id] || { value: '—', numericValue: null, flag: null }),
          })),
          trend,
          comparable: nums.length >= 2,
        };
      })
      .filter((p) => p.values.some((v) => v.value && v.value !== '—'))
      .sort((a, b) => (a.nameEn || '').localeCompare(b.nameEn || ''))
  );

  const latestResults = previews[previews.length - 1]?.results || [];
  const panels = buildPanels(latestResults);
  const interpretation = {
    ar: buildInterpretation(parameters, panels, true),
    en: buildInterpretation(parameters, panels, false),
  };

  logPortalAccess(ids[0], 'animal_compare', animalId);

  return {
    animal: {
      id: animal.id,
      code: animal.animal_code,
      type: animal.animal_type,
      name: animal.name_tag,
      gender: animal.gender,
      age: animal.age,
      chip: animal.rfid_chip,
    },
    reports: previews.map((r) => ({
      id: r.id,
      reportNumber: r.reportNumber,
      sampleCode: r.sampleCode,
      date: r.date,
    })),
    parameters,
    panels,
    interpretation,
  };
};

const getDashboard = async (customerIds) => {
  const ids = asArray(customerIds);
  const primaryId = ids[0];

  const customerResult = await query(
    `SELECT id, full_name, full_name_ar, mobile, city, farm_company FROM customers WHERE id = $1`,
    [primaryId]
  );
  const customer = customerResult.rows[0];

  const statsResult = await query(
    `SELECT
       COUNT(DISTINCT r.id)::int AS report_count,
       COUNT(DISTINCT a.id)::int AS animal_count,
       COUNT(DISTINCT r.id) FILTER (WHERE r.created_at > NOW() - INTERVAL '7 days')::int AS new_reports_7d
     FROM customers c
     LEFT JOIN samples s ON s.customer_id = c.id
     LEFT JOIN reports r ON r.sample_id = s.id AND ${portalReportFilter}
     LEFT JOIN animals a ON a.owner_id = c.id AND a.is_active = true
     WHERE c.id = ANY($1::uuid[])`,
    [ids]
  );
  const stats = statsResult.rows[0] || { report_count: 0, animal_count: 0, new_reports_7d: 0 };

  const animals = await listAnimals(ids);
  const animalSummaries = await Promise.all(
    animals.slice(0, 12).map(async (row) => {
      const { results } = await latestResultsForAnimal(ids, row.id);
      const panels = buildPanels(results);
      const panelSummary = summarizeResults(results);
      const abnormalPanels = panels.filter((p) => p.status === 'abnormal').length;
      return {
        id: row.id,
        code: row.animal_code,
        name: row.name_tag,
        type: row.animal_type,
        gender: row.gender,
        age: row.age,
        reportCount: row.report_count,
        latestReportAt: row.latest_report_at,
        panels,
        hasAbnormal: abnormalPanels > 0,
        criticalCount: countCriticalFlags(results),
        abnormalCount: panelSummary.abnormal,
        overallStatus: panelSummary.overallStatus,
      };
    })
  );

  const recent = await listReports(ids, { page: 1, limit: 6 });

  const alerts = [];
  if (parseInt(stats.new_reports_7d, 10) > 0) {
    alerts.push({
      type: 'new_reports',
      severity: 'info',
      count: parseInt(stats.new_reports_7d, 10),
    });
  }
  const criticalTotal = animalSummaries.reduce((sum, a) => sum + (a.criticalCount || 0), 0);
  const abnormalTotal = animalSummaries.reduce((sum, a) => sum + (a.abnormalCount || 0), 0);

  if (criticalTotal > 0) {
    alerts.push({ type: 'critical_results', severity: 'critical', count: criticalTotal });
  }
  const abnormalAnimals = animalSummaries.filter((a) => a.hasAbnormal);
  if (abnormalAnimals.length > 0) {
    alerts.push({
      type: 'abnormal_panels',
      severity: 'warning',
      count: abnormalAnimals.length,
    });
  }

  logPortalAccess(primaryId, 'dashboard');

  return {
    customer,
    stats: {
      reportCount: parseInt(stats.report_count, 10) || 0,
      animalCount: parseInt(stats.animal_count, 10) || 0,
      newReports7d: parseInt(stats.new_reports_7d, 10) || 0,
      abnormalResults: abnormalTotal,
      criticalResults: criticalTotal,
      animalsNeedingFollowUp: abnormalAnimals.length,
    },
    alerts,
    animals: animalSummaries,
    recentReports: recent.data,
  };
};

const getAnimalDashboard = async (customerIds, animalId) => {
  const ids = asArray(customerIds);
  const animal = await assertAnimalOwnership(animalId, ids);
  const reports = await fetchAnimalReports(ids, animalId, 20);
  const { results, report: latestReport } = await latestResultsForAnimal(ids, animalId);
  const panels = buildPanels(results);
  const summary = summarizeResults(results);

  let comparison = null;
  let keyParameters = [];
  let interpretation = { ar: '', en: '' };
  let trendCandidates = [];

  if (reports.length >= 2) {
    try {
      comparison = await getComparison(ids, animalId, []);
      keyParameters = (comparison.parameters || [])
        .filter((p) => p.comparable && p.current != null)
        .sort((a, b) => flagSeverity(b.latestFlag) - flagSeverity(a.latestFlag))
        .slice(0, 12);
      interpretation = comparison.interpretation;
      trendCandidates = keyParameters.slice(0, 6).map((p) => p.code);
    } catch {
      /* fewer than 2 comparable reports */
    }
  }

  if (!trendCandidates.length && results.length) {
    trendCandidates = results
      .filter((r) => r.numericValue != null)
      .slice(0, 4)
      .map((r) => r.code);
  }

  logPortalAccess(ids[0], 'animal_dashboard', animalId);

  return {
    animal: {
      id: animal.id,
      code: animal.animal_code,
      name: animal.name_tag,
      type: animal.animal_type,
      gender: animal.gender,
      age: animal.age,
      color: animal.color,
      chip: animal.rfid_chip,
    },
    owner: {
      name: animal.owner_name,
      nameAr: animal.owner_name_ar,
      farm: animal.farm_company,
    },
    reportCount: reports.length,
    latestReport: latestReport
      ? {
          id: latestReport.id,
          reportNumber: latestReport.report_number,
          createdAt: latestReport.created_at,
          sampleCode: latestReport.sample_code,
          collectedAt: latestReport.collection_date,
        }
      : null,
    panels,
    summary,
    kpis: {
      reportCount: reports.length,
      abnormalCount: summary.abnormal,
      criticalCount: summary.critical,
      normalCount: summary.normal,
      panelsOk: panels.filter((p) => p.status === 'normal').length,
      panelsAlert: panels.filter((p) => ['abnormal', 'attention'].includes(p.status)).length,
      overallStatus: summary.overallStatus,
    },
    interpretation,
    keyParameters,
    trendCandidates,
    recentReports: reports,
    canCompare: reports.length >= 2,
  };
};

const getTrends = async (customerIds, animalId, parameterCode, limit = 15) => {
  const ids = asArray(customerIds);
  await assertAnimalOwnership(animalId, ids);
  const capped = Math.min(Math.max(parseInt(limit, 10) || 15, 5), 20);

  const reportsResult = await query(
    `SELECT r.id, r.report_number, r.created_at
     FROM reports r
     JOIN samples s ON r.sample_id = s.id
     WHERE s.customer_id = ANY($1::uuid[]) AND s.animal_id = $2 AND ${portalReportFilter}
     ORDER BY r.created_at ASC
     LIMIT $3`,
    [ids, animalId, capped]
  );

  const reports = reportsResult.rows;
  if (!reports.length) {
    return { parameterCode, points: [], meta: null };
  }

  const points = [];
  let meta = null;

  for (const row of reports) {
    await assertReportOwnership(row.id, ids);
    const preview = await reportsService.getPreview(row.id);
    const safe = sanitizePortalPreview(preview);
    const results = safe.results || [];
    const match = results.find((r) => r.code === parameterCode);
    if (!match) continue;
    if (!meta) {
      meta = {
        code: match.code,
        nameAr: match.nameAr,
        nameEn: match.nameEn,
        unit: match.unit,
        reference: match.reference,
      };
    }
    points.push({
      reportId: row.id,
      reportNumber: row.report_number,
      date: row.created_at,
      value: match.value,
      numericValue: match.numericValue,
      flag: match.flag,
    });
  }

  logPortalAccess(ids[0], 'animal_trends', animalId);

  return { parameterCode, meta, points };
};

const listDocuments = async (customerIds, { animalId, type } = {}) => {
  const ids = asArray(customerIds);
  const filters = ['s.customer_id = ANY($1::uuid[])'];
  const params = [ids];
  if (animalId) {
    params.push(animalId);
    filters.push(`s.animal_id = $${params.length}`);
  }
  const where = filters.join(' AND ');

  const pdfs = await query(
    `SELECT r.id, r.report_number, r.pdf_url, r.created_at, r.language,
            a.animal_code, a.name_tag as animal_name, a.animal_type,
            'pdf' as doc_type
     FROM reports r
     JOIN samples s ON r.sample_id = s.id
     LEFT JOIN animals a ON s.animal_id = a.id
     WHERE ${where} AND r.pdf_url IS NOT NULL AND ${portalReportFilter}
     ORDER BY r.created_at DESC`,
    params
  );

  const attachFilters = ['s.customer_id = ANY($1::uuid[])'];
  const attachParams = [ids];
  if (animalId) {
    attachParams.push(animalId);
    attachFilters.push(`s.animal_id = $${attachParams.length}`);
  }
  const attachWhere = attachFilters.join(' AND ');

  let attachments = { rows: [] };
  try {
    attachments = await query(
      `SELECT ra.id, ra.file_url, ra.caption, ra.created_at,
              r.report_number, r.id as report_id,
              a.animal_code, a.name_tag as animal_name,
              CASE
                WHEN ra.file_url ILIKE '%.pdf' THEN 'pdf'
                WHEN ra.file_url ILIKE '%.png' OR ra.file_url ILIKE '%.jpg' OR ra.file_url ILIKE '%.jpeg' THEN 'image'
                ELSE 'file'
              END as doc_type
       FROM result_attachments ra
       JOIN results res ON ra.result_id = res.id
       JOIN samples s ON res.sample_id = s.id
       JOIN reports r ON r.sample_id = s.id
       LEFT JOIN animals a ON s.animal_id = a.id
       WHERE ${attachWhere}
       ORDER BY ra.created_at DESC`,
      attachParams
    );
  } catch (err) {
    logger.warn('Portal documents: attachments unavailable', { error: err.message });
  }

  let docs = [
    ...pdfs.rows.map((row) => ({
      id: row.id,
      type: 'pdf',
      title: row.report_number,
      url: row.pdf_url,
      createdAt: row.created_at,
      reportId: row.id,
      reportNumber: row.report_number,
      animalCode: row.animal_code,
      animalName: row.animal_name,
      animalType: row.animal_type,
    })),
    ...attachments.rows.map((row) => ({
      id: row.id,
      type: row.doc_type === 'image' ? 'image' : row.doc_type,
      title: row.caption || row.report_number,
      url: row.file_url,
      createdAt: row.created_at,
      reportId: row.report_id,
      reportNumber: row.report_number,
      animalCode: row.animal_code,
      animalName: row.animal_name,
    })),
  ];

  if (type && type !== 'all') {
    docs = docs.filter((d) => d.type === type);
  }

  docs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  logPortalAccess(ids[0], 'documents');

  return docs;
};

const searchPortal = async (customerIds, q) => {
  const ids = asArray(customerIds);
  const term = String(q || '').trim();
  if (term.length < 2) return { animals: [], reports: [] };

  const like = `%${term}%`;
  const animals = await query(
    `SELECT DISTINCT a.id, a.animal_code, a.name_tag, a.animal_type, a.rfid_chip
     FROM animals a
     WHERE a.owner_id = ANY($1::uuid[]) AND a.is_active = true
       AND (a.animal_code ILIKE $2 OR a.name_tag ILIKE $2 OR a.rfid_chip ILIKE $2)
     ORDER BY a.animal_code
     LIMIT 8`,
    [ids, like]
  );

  const reports = await query(
    `SELECT r.id, r.report_number, r.created_at, a.animal_code, a.name_tag as animal_name
     FROM reports r
     JOIN samples s ON r.sample_id = s.id
     LEFT JOIN animals a ON s.animal_id = a.id
     WHERE s.customer_id = ANY($1::uuid[])
       AND (r.report_number ILIKE $2 OR s.sample_code ILIKE $2)
       AND ${portalReportFilter}
     ORDER BY r.created_at DESC
     LIMIT 8`,
    [ids, like]
  );

  return { animals: animals.rows, reports: reports.rows };
};

const getReportPreview = async (reportId, customerIds) => {
  const ids = asArray(customerIds);
  await assertReportOwnership(reportId, ids);
  logPortalAccess(ids[0], 'report_preview', reportId);
  const preview = await reportsService.getPreview(reportId);
  portalSync.assertPortalReportVisible(preview);
  return sanitizePortalPreview(preview);
};

const serveReportPdf = async (filename, customerIds, res) => {
  const ids = asArray(customerIds);
  const report = await query(
    `SELECT r.id, r.pdf_url FROM reports r
     JOIN samples s ON r.sample_id = s.id
     WHERE s.customer_id = ANY($1::uuid[]) AND r.pdf_url LIKE $2 AND ${portalReportFilter}`,
    [ids, `%${filename}`]
  );

  if (!report.rows[0]) throw new AppError('Report not found', 404, 'NOT_FOUND');
  logPortalAccess(ids[0], 'report_pdf', report.rows[0].id);
  return reportsService.servePdf(filename, res);
};

const listInvoices = async (customerIds, { page, limit } = {}) => {
  const ids = asArray(customerIds);
  const { offset, page: p, limit: l } = paginate(page, limit);
  const countResult = await query(
    'SELECT COUNT(*) FROM invoices WHERE customer_id = ANY($1::uuid[]) AND status NOT IN (\'cancelled\', \'refunded\')',
    [ids]
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await query(
    `SELECT i.id, i.invoice_number, i.total, i.status, i.created_at, i.pdf_url,
            COALESCE(p.paid, 0) AS total_paid,
            GREATEST(i.total - COALESCE(p.paid, 0), 0) AS balance_due
     FROM invoices i
     LEFT JOIN (SELECT invoice_id, SUM(amount) AS paid FROM payments GROUP BY invoice_id) p ON p.invoice_id = i.id
     WHERE i.customer_id = ANY($1::uuid[]) AND i.status NOT IN ('cancelled', 'refunded')
     ORDER BY i.created_at DESC
     LIMIT $2 OFFSET $3`,
    [ids, l, offset]
  );

  logPortalAccess(ids[0], 'invoices_list');
  return { data: result.rows, pagination: buildPagination(total, p, l) };
};

const serveInvoicePdf = async (invoiceId, customerIds, res) => {
  const ids = asArray(customerIds);
  const invoice = await query(
    'SELECT id FROM invoices WHERE id = $1 AND customer_id = ANY($2::uuid[])',
    [invoiceId, ids]
  );
  if (!invoice.rows[0]) throw new AppError('Invoice not found', 404, 'NOT_FOUND');
  logPortalAccess(ids[0], 'invoice_pdf', invoiceId);
  return billingService.serveInvoicePdf(invoiceId, res);
};

module.exports = {
  requestOtp,
  verifyOtp,
  listReports,
  listAnimals,
  getComparison,
  getDashboard,
  getAnimalDashboard,
  getTrends,
  listDocuments,
  searchPortal,
  getReportPreview,
  serveReportPdf,
  listInvoices,
  serveInvoicePdf,
};
