/**
 * ZATCA / Fatoora onboarding plus gated live submit.
 * Live submit never updates invoice rows and never throws to billing.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { query } = require('../config/database');
const env = require('../config/env');
const { AppError } = require('../middleware/errorHandler');
const {
  SETTINGS_KEY,
  publicView,
  mergePublicFields,
  productionNeedsRefresh,
  baseUrl,
  sdkEnvironment,
} = require('../utils/zatca-config');
const { buildComplianceSamples } = require('../utils/zatca-compliance-samples');
const { buildLiveInvoice } = require('../utils/zatca-invoice-map');
const { labDay } = require('../utils/accounting-time');
const { notDeleted } = require('../utils/soft-delete-sql');
const logger = require('../config/logger');

const loadStored = async () => {
  const result = await query('SELECT value FROM settings WHERE key = $1', [SETTINGS_KEY]);
  return result.rows[0]?.value || {};
};

const saveStored = async (value, userId) => {
  await query(
    `INSERT INTO settings (key, value, updated_by) VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
    [SETTINGS_KEY, JSON.stringify(value), userId || null]
  );
};

const getStatus = async () => publicView(await loadStored(), {
  sendLiveInvoices: env.features.zatcaEinvoice === true,
});

const saveConfig = async (payload, userId) => {
  const stored = await loadStored();
  const next = mergePublicFields(stored, payload);
  await saveStored(next, userId);
  return publicView(next, { sendLiveInvoices: env.features.zatcaEinvoice === true });
};

const escapeCnf = (value) => String(value || '').replace(/[\r\n#=\\]/g, ' ').trim();

const csrTemplateName = (environment) => {
  if (environment === 'simulation') return 'PREZATCA-Code-Signing';
  if (environment === 'core') return 'ZATCA-Code-Signing';
  return 'TSTZATCA-Code-Signing';
};

const generateCsr = (cfg) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zatca-'));
  const keyPath = path.join(dir, 'private.pem');
  const cnfPath = path.join(dir, 'csr.cnf');
  const csrPath = path.join(dir, 'csr.pem');
  const cnf = [
    'oid_section = OIDs',
    '[OIDs]',
    'certificateTemplateName = 1.3.6.1.4.1.311.20.2',
    '[req]',
    'default_md = sha256',
    'prompt = no',
    'utf8 = yes',
    'distinguished_name = dn',
    'req_extensions = v3_req',
    '[dn]',
    'C = SA',
    `OU = ${escapeCnf(cfg.organization_unit)}`,
    `O = ${escapeCnf(cfg.organization)}`,
    `CN = ${escapeCnf(cfg.common_name)}`,
    '[v3_req]',
    `1.3.6.1.4.1.311.20.2 = ASN1:PRINTABLESTRING:${csrTemplateName(cfg.environment)}`,
    'subjectAltName = dirName:alt_names',
    '[alt_names]',
    `SN = ${escapeCnf(cfg.serial)}`,
    `UID = ${escapeCnf(cfg.vat_number)}`,
    `title = ${escapeCnf(cfg.invoice_types)}`,
    `registeredAddress = ${escapeCnf(cfg.address)}`,
    'businessCategory = Veterinary Laboratory',
    '',
  ].join('\n');

  try {
    fs.writeFileSync(cnfPath, cnf);
    execFileSync('openssl', ['ecparam', '-name', 'secp256k1', '-genkey', '-noout', '-out', keyPath], { stdio: 'pipe' });
    execFileSync('openssl', ['req', '-new', '-sha256', '-key', keyPath, '-config', cnfPath, '-out', csrPath], { stdio: 'pipe' });
    const privateKey = fs.readFileSync(keyPath, 'utf8');
    const csrPem = fs.readFileSync(csrPath, 'utf8');
    return { privateKey, csrB64: Buffer.from(csrPem).toString('base64') };
  } catch (err) {
    throw new AppError(
      'تعذر توليد شهادة الجهاز. تأكد من توفر OpenSSL على الخادم.',
      500,
      'ZATCA_CSR_FAILED',
      { detail: err.stderr?.toString?.() || err.message }
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

const requestComplianceCsid = async (environment, csrB64, otp) => {
  const url = `${baseUrl(environment)}/compliance`;
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Version': 'V2',
        'Accept-Language': 'ar',
        OTP: otp,
      },
      body: JSON.stringify({ csr: csrB64 }),
    });
  } catch (err) {
    throw new AppError(
      'تعذر الاتصال بمنصة فاتورة. تحقق من الشبكة ثم أعد المحاولة.',
      502,
      'ZATCA_NETWORK',
      { detail: err.message }
    );
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AppError(
      body.message || body.error || 'رفضت منصة فاتورة طلب الربط. تحقق من رمز OTP والرقم الضريبي.',
      400,
      'ZATCA_ONBOARD_REJECTED',
      { status: response.status, body }
    );
  }
  return body;
};

const onboardSandbox = async ({ otp }, userId) => {
  const cleanOtp = String(otp || '').replace(/\D/g, '');
  if (!/^\d{6}$/.test(cleanOtp)) {
    throw new AppError('أدخل رمز OTP المكوّن من 6 أرقام من بوابة فاتورة.', 400, 'VALIDATION_ERROR');
  }

  const stored = mergePublicFields(await loadStored());
  if (!/^\d{15}$/.test(stored.vat_number)) {
    throw new AppError('الرقم الضريبي يجب أن يكون 15 رقماً.', 400, 'VALIDATION_ERROR');
  }
  if (!stored.organization || !stored.organization_unit || !stored.address) {
    throw new AppError('أدخل اسم المنشأة والفرع والعنوان ثم احفظ قبل الربط.', 400, 'VALIDATION_ERROR');
  }

  const { privateKey, csrB64 } = generateCsr(stored);
  try {
    const result = await requestComplianceCsid(stored.environment, csrB64, cleanOtp);
    const next = {
      ...stored,
      private_key_pem: privateKey,
      binary_security_token: result.binarySecurityToken || result.binary_security_token || null,
      secret: result.secret || null,
      compliance_request_id: result.requestID || result.request_id || null,
      status: 'sandbox_linked',
      linked_at: new Date().toISOString(),
      last_error: null,
      compliance_status: 'not_run',
      compliance_ran_at: null,
      compliance_results: [],
      production_binary_security_token: null,
      production_secret: null,
      production_request_id: null,
      production_compliance_request_id: null,
      production_status: 'not_issued',
      production_linked_at: null,
    };
    if (!next.binary_security_token || !next.secret) {
      throw new AppError('استجابت منصة فاتورة بدون شهادة صالحة.', 502, 'ZATCA_ONBOARD_INCOMPLETE');
    }
    await saveStored(next, userId);
    return publicView(next, { sendLiveInvoices: env.features.zatcaEinvoice === true });
  } catch (err) {
    const failed = {
      ...stored,
      status: 'error',
      last_error: err.message || 'ZATCA onboard failed',
    };
    await saveStored(failed, userId);
    throw err;
  }
};

const summarizeValidation = (validation) => {
  const status = String(validation?.status || '').toUpperCase();
  const errors = (validation?.errorMessages || []).map((row) => row.message || row.code).filter(Boolean);
  const warnings = (validation?.warningMessages || []).map((row) => row.message || row.code).filter(Boolean);
  return {
    ok: status === 'PASS' || status === 'WARNING',
    status: status || 'ERROR',
    message: errors[0] || warnings[0] || status || 'UNKNOWN',
  };
};

const loadZatcaSdk = async () => import('zatca-sdk');

/**
 * Submit six synthetic documents to Fatoora compliance checks.
 * Does not read, update, or create customer invoices.
 * Does not request a production CSID.
 */
const runComplianceTests = async (userId) => {
  const stored = await loadStored();
  if (stored.status !== 'sandbox_linked' || !stored.binary_security_token || !stored.secret || !stored.private_key_pem) {
    throw new AppError('اربط الجهاز تجريبياً أولاً قبل اختبارات الامتثال.', 400, 'ZATCA_NOT_LINKED');
  }

  let sdk;
  try {
    sdk = await loadZatcaSdk();
  } catch (err) {
    throw new AppError(
      'تعذر تحميل مكتبة توقيع فاتورة. تحقق من تثبيت zatca-sdk على الخادم.',
      500,
      'ZATCA_SDK_MISSING',
      { detail: err.message }
    );
  }

  const {
    signInvoice,
    checkInvoiceCompliance,
    ZATCAAPIClient,
    INITIAL_PREVIOUS_HASH,
  } = sdk;
  const environment = sdkEnvironment(stored.environment);
  const apiClient = new ZATCAAPIClient({
    env: environment,
    certificate: stored.binary_security_token,
    secret: stored.secret,
  });

  const samples = buildComplianceSamples(stored);
  const results = [];
  let previousHash = INITIAL_PREVIOUS_HASH;
  let passedAll = true;

  for (const sample of samples) {
    sample.invoice.previousInvoiceHash = previousHash;
    const signed = await signInvoice(sample.invoice, {
      credentials: {
        certificate: stored.binary_security_token,
        privateKey: stored.private_key_pem,
      },
      skipQrImage: true,
      allowCertificateKeyMismatch: environment === 'sandbox',
    });
    if (!signed.success) {
      passedAll = false;
      results.push({
        key: sample.key,
        label: sample.label,
        status: 'ERROR',
        message: signed.error?.message || 'تعذر توقيع مستند الاختبار',
      });
      continue;
    }

    previousHash = signed.data.invoiceHash;
    const check = await checkInvoiceCompliance(apiClient, {
      invoiceHash: signed.data.invoiceHash,
      uuid: signed.data.uuid,
      invoice: signed.data.invoiceBase64,
    });
    if (!check.success) {
      passedAll = false;
      results.push({
        key: sample.key,
        label: sample.label,
        status: 'ERROR',
        message: check.error?.message || 'رفضت منصة فاتورة مستند الاختبار',
      });
      continue;
    }

    const summary = summarizeValidation(check.data?.validationResults || check.data);
    if (!summary.ok) passedAll = false;
    results.push({
      key: sample.key,
      label: sample.label,
      status: summary.status,
      message: summary.message,
    });
  }

  const next = {
    ...stored,
    compliance_status: passedAll ? 'passed' : 'failed',
    compliance_ran_at: new Date().toISOString(),
    compliance_results: results,
    last_error: passedAll ? null : 'فشلت بعض اختبارات الامتثال التجريبية',
  };
  await saveStored(next, userId);
  return publicView(next, { sendLiveInvoices: env.features.zatcaEinvoice === true });
};

const requestProductionCsidApi = async (environment, token, secret, complianceRequestId) => {
  const url = `${baseUrl(environment)}/production/csids`;
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Version': 'V2',
        'Accept-Language': 'ar',
        Authorization: `Basic ${Buffer.from(`${token}:${secret}`).toString('base64')}`,
      },
      body: JSON.stringify({ compliance_request_id: String(complianceRequestId) }),
    });
  } catch (err) {
    throw new AppError(
      'تعذر الاتصال بمنصة فاتورة. تحقق من الشبكة ثم أعد المحاولة.',
      502,
      'ZATCA_NETWORK',
      { detail: err.message }
    );
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AppError(
      body.message || body.error || 'رفضت منصة فاتورة طلب شهادة الإنتاج التجريبية.',
      400,
      'ZATCA_PRODUCTION_CSID_REJECTED',
      { status: response.status, body }
    );
  }
  return body;
};

/**
 * Request a sandbox/simulation production CSID after compliance tests pass.
 * Does not submit customer invoices and does not call reporting/clearance.
 */
const requestSandboxProductionCsid = async (userId) => {
  const stored = await loadStored();
  if (stored.status !== 'sandbox_linked' || !stored.binary_security_token || !stored.secret || !stored.private_key_pem) {
    throw new AppError('اربط الجهاز تجريبياً أولاً قبل طلب شهادة الإنتاج التجريبية.', 400, 'ZATCA_NOT_LINKED');
  }
  if (stored.compliance_status !== 'passed') {
    throw new AppError('شغّل اختبارات الامتثال بنجاح أولاً.', 400, 'ZATCA_COMPLIANCE_REQUIRED');
  }
  if (!productionNeedsRefresh(stored)) {
    return publicView(stored, { sendLiveInvoices: env.features.zatcaEinvoice === true });
  }
  if (stored.compliance_request_id == null || stored.compliance_request_id === '') {
    throw new AppError('معرف طلب الامتثال غير موجود. أعد الربط التجريبي ثم اختبارات الامتثال.', 400, 'ZATCA_COMPLIANCE_ID_MISSING');
  }

  try {
    const result = await requestProductionCsidApi(
      stored.environment,
      stored.binary_security_token,
      stored.secret,
      stored.compliance_request_id
    );
    const next = {
      ...stored,
      production_binary_security_token: result.binarySecurityToken || result.binary_security_token || null,
      production_secret: result.secret || null,
      production_request_id: result.requestID || result.request_id || null,
      production_compliance_request_id: stored.compliance_request_id || null,
      production_status: 'issued',
      production_linked_at: new Date().toISOString(),
      last_error: null,
    };
    if (!next.production_binary_security_token || !next.production_secret) {
      throw new AppError('استجابت منصة فاتورة بدون شهادة إنتاج صالحة.', 502, 'ZATCA_PRODUCTION_CSID_INCOMPLETE');
    }
    await saveStored(next, userId);
    return publicView(next, { sendLiveInvoices: env.features.zatcaEinvoice === true });
  } catch (err) {
    const failed = {
      ...stored,
      production_status: 'error',
      last_error: err.message || 'ZATCA production CSID failed',
    };
    await saveStored(failed, userId);
    throw err;
  }
};

const reportedView = (stored, invoiceId) => {
  const row = stored?.reported_invoices && typeof stored.reported_invoices === 'object'
    ? stored.reported_invoices[invoiceId]
    : null;
  if (!row || typeof row !== 'object') return null;
  return {
    status: String(row.status || ''),
    reason: String(row.reason || '').slice(0, 400),
    at: row.at || null,
  };
};

const getInvoiceSubmitStatus = async (invoiceId) => reportedView(await loadStored(), invoiceId);

const recordLiveSubmit = async (stored, userId, entry) => {
  const at = new Date().toISOString();
  const next = {
    ...stored,
    last_live_submit: {
      invoice_number: entry.invoice_number || '',
      status: entry.status || '',
      reason: entry.reason || '',
      at,
    },
  };
  if (entry.invoice_id) {
    const current = stored.reported_invoices && typeof stored.reported_invoices === 'object'
      ? stored.reported_invoices
      : {};
    next.reported_invoices = {
      ...current,
      [entry.invoice_id]: {
        invoice_number: entry.invoice_number || '',
        status: entry.status || '',
        reason: entry.reason || '',
        at,
      },
    };
  }
  if (entry.invoice_counter != null) next.invoice_counter = entry.invoice_counter;
  if (entry.previous_invoice_hash) next.previous_invoice_hash = entry.previous_invoice_hash;
  await saveStored(next, userId);
  return next;
};

let liveSubmitChain = Promise.resolve();

/**
 * Best-effort live submit. Never throws and never changes invoice rows.
 * Automatic issue path stays off unless ZATCA_EINVOICE_ENABLED=true.
 * Manual staff submit ignores that flag.
 */
const submitIssuedInvoiceSafe = async (issued, userId, { manual = false } = {}) => {
  const run = async () => {
    try {
      if (!manual && env.features.zatcaEinvoice !== true) {
        return { ok: false, skipped: true, reason: 'flag_off' };
      }
      if (!issued?.id || !issued.invoice_number) {
        return { ok: false, skipped: true, reason: 'no_invoice' };
      }
      if (['cancelled', 'refunded'].includes(issued.status)) {
        return { ok: false, skipped: true, reason: 'invalid_status' };
      }

      const stored = await loadStored();
      const already = reportedView(stored, issued.id);
      if (already?.status === 'reported') {
        return { ok: false, skipped: true, reason: 'already_reported', zatca_submit: already };
      }
      if (stored.environment !== 'simulation' && stored.environment !== 'core') {
        await recordLiveSubmit(stored, userId, {
          invoice_id: issued.id,
          invoice_number: issued.invoice_number,
          status: 'skipped',
          reason: 'sandbox_not_live',
        });
        return { ok: false, skipped: true, reason: 'sandbox_not_live' };
      }
      if (!stored.production_binary_security_token || !stored.production_secret || !stored.private_key_pem) {
        await recordLiveSubmit(stored, userId, {
          invoice_id: issued.id,
          invoice_number: issued.invoice_number,
          status: 'skipped',
          reason: 'no_production_csid',
        });
        return { ok: false, skipped: true, reason: 'no_production_csid' };
      }

      let sdk;
      try {
        sdk = await loadZatcaSdk();
      } catch (err) {
        await recordLiveSubmit(stored, userId, {
          invoice_id: issued.id,
          invoice_number: issued.invoice_number,
          status: 'skipped',
          reason: err.message || 'sdk_missing',
        });
        return { ok: false, skipped: true, reason: 'sdk_missing' };
      }

      const customerResult = issued.customer_id
        ? await query('SELECT full_name, full_name_ar FROM customers WHERE id = $1', [issued.customer_id])
        : { rows: [] };
      const customerName = customerResult.rows[0]?.full_name_ar || customerResult.rows[0]?.full_name || '';
      const mapped = buildLiveInvoice({
        invoice: issued,
        items: issued.items || [],
        cfg: stored,
        customerName,
        invoiceCounterValue: Number(stored.invoice_counter || 0) + 1,
        previousInvoiceHash: stored.previous_invoice_hash || sdk.INITIAL_PREVIOUS_HASH,
        issueDate: labDay(issued.created_at),
      });
      if (!mapped.ok) {
        await recordLiveSubmit(stored, userId, {
          invoice_id: issued.id,
          invoice_number: issued.invoice_number,
          status: 'skipped',
          reason: mapped.reason,
        });
        return { ok: false, skipped: true, reason: mapped.reason };
      }

      const signed = await sdk.signInvoice(mapped.invoice, {
        credentials: {
          certificate: stored.production_binary_security_token,
          privateKey: stored.private_key_pem,
        },
        skipQrImage: true,
        allowCertificateKeyMismatch: false,
      });
      if (!signed.success) {
        await recordLiveSubmit(stored, userId, {
          invoice_id: issued.id,
          invoice_number: issued.invoice_number,
          status: 'error',
          reason: signed.error?.message || 'sign_failed',
        });
        return { ok: false, reason: 'sign_failed' };
      }

      const apiClient = new sdk.ZATCAAPIClient({
        env: sdkEnvironment(stored.environment),
        certificate: stored.production_binary_security_token,
        secret: stored.production_secret,
      });
      const reported = await sdk.reportInvoice(apiClient, {
        invoiceHash: signed.data.invoiceHash,
        uuid: signed.data.uuid,
        invoice: signed.data.invoiceBase64,
      });
      await recordLiveSubmit(stored, userId, {
        invoice_id: issued.id,
        invoice_number: issued.invoice_number,
        status: reported.success ? 'reported' : 'error',
        reason: reported.success ? 'REPORTED' : (reported.error?.message || 'report_failed'),
        ...(reported.success ? {
          invoice_counter: mapped.invoice.invoiceCounterValue,
          previous_invoice_hash: signed.data.invoiceHash,
        } : {}),
      });
      return reported.success
        ? { ok: true, status: 'reported' }
        : { ok: false, reason: 'report_failed' };
    } catch (err) {
      logger.warn('ZATCA live submit skipped', { error: err.message, invoice: issued?.invoice_number });
      return { ok: false, reason: err.message || 'submit_failed' };
    }
  };

  const pending = liveSubmitChain.then(run, run);
  liveSubmitChain = pending.then(() => undefined, () => undefined);
  return pending;
};

const submitInvoiceById = async (invoiceId, userId) => {
  const invoiceResult = await query(
    `SELECT * FROM invoices WHERE id = $1 AND ${notDeleted()}`,
    [invoiceId]
  );
  const invoice = invoiceResult.rows[0];
  if (!invoice) throw new AppError('الفاتورة غير موجودة', 404, 'NOT_FOUND');
  if (['cancelled', 'refunded'].includes(invoice.status)) {
    throw new AppError('لا يمكن إرسال فاتورة ملغاة أو مستردة.', 400, 'INVALID_STATUS');
  }
  const itemsResult = await query(
    'SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY description',
    [invoiceId]
  );
  const result = await submitIssuedInvoiceSafe(
    { ...invoice, items: itemsResult.rows },
    userId,
    { manual: true }
  );
  return {
    ...result,
    zatca_submit: result.zatca_submit || await getInvoiceSubmitStatus(invoiceId),
  };
};

const MANUAL_BATCH_LIMIT = 40;

const submitEligibleInvoices = async (userId) => {
  const stored = await loadStored();
  const reported = stored.reported_invoices && typeof stored.reported_invoices === 'object'
    ? stored.reported_invoices
    : {};
  const candidates = await query(
    `SELECT id FROM invoices
     WHERE ${notDeleted()}
       AND status NOT IN ('cancelled', 'refunded')
     ORDER BY created_at ASC`
  );
  const unsent = candidates.rows.filter((row) => reported[row.id]?.status !== 'reported');
  const pending = unsent.slice(0, MANUAL_BATCH_LIMIT);
  const remaining = Math.max(0, unsent.length - pending.length);

  const results = [];
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of pending) {
    const one = await submitInvoiceById(row.id, userId);
    results.push({
      id: row.id,
      ok: one.ok === true,
      skipped: one.skipped === true,
      reason: one.reason || one.status || '',
    });
    if (one.ok) sent += 1;
    else if (one.skipped) skipped += 1;
    else failed += 1;
  }

  return {
    ok: failed === 0,
    sent,
    skipped,
    failed,
    remaining,
    limit: MANUAL_BATCH_LIMIT,
    results,
  };
};

module.exports = {
  getStatus,
  saveConfig,
  onboardSandbox,
  runComplianceTests,
  requestSandboxProductionCsid,
  submitIssuedInvoiceSafe,
  getInvoiceSubmitStatus,
  submitInvoiceById,
  submitEligibleInvoices,
};
