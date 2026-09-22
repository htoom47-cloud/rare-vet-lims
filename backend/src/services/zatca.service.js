/**
 * ZATCA / Fatoora sandbox onboarding only.
 * Does not issue, update, or submit customer invoices.
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
  baseUrl,
} = require('../utils/zatca-config');

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
    '1.3.6.1.4.1.311.20.2 = ASN1:PRINTABLESTRING:ZATCA-Code-Signing',
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

module.exports = { getStatus, saveConfig, onboardSandbox };
