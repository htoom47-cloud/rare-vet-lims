require('dotenv').config();
const { LAB_NAME_EN, LAB_NAME_AR } = require('../constants/brand');

const parseOrigins = (raw) => (raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : []);

const staffAppUrl = process.env.STAFF_APP_URL || process.env.CORS_ORIGIN || 'http://localhost:5173';
const portalAppUrl = process.env.PORTAL_APP_URL
  || process.env.PORTAL_CORS_ORIGIN
  || (process.env.NODE_ENV === 'production' ? 'https://portal.rarevetcare.com' : 'http://localhost:5174');
const appUrl = process.env.APP_URL
  || process.env.RENDER_EXTERNAL_URL
  || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null)
  || staffAppUrl;

const corsOrigins = [...new Set([
  ...parseOrigins(process.env.CORS_ORIGINS),
  staffAppUrl,
  portalAppUrl,
  appUrl,
].filter(Boolean))];

const smsEnabled = process.env.SMS_ENABLED === 'true';

/** Shared portal OTP until SMS is configured. Override with PORTAL_OTP_STATIC or disable with PORTAL_OTP_STATIC=off */
const resolvePortalStaticOtp = () => {
  const raw = process.env.PORTAL_OTP_STATIC;
  if (raw === 'off' || raw === 'false' || raw === '0') return null;
  if (raw?.trim() && process.env.NODE_ENV === 'production') return null;
  if (raw?.trim()) return raw.trim();
  if (smsEnabled) return null;
  if (process.env.NODE_ENV === 'production') return null;
  return '1234';
};

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,
  appUrl,
  staffAppUrl,
  portalAppUrl,
  corsOrigin: staffAppUrl,
  corsOrigins,
  serveFrontend: process.env.SERVE_FRONTEND === 'true',
  portalHosts: [...new Set([
    ...parseOrigins(process.env.PORTAL_HOSTS),
    (() => {
      try { return new URL(portalAppUrl).hostname; } catch { return null; }
    })(),
    'portal.rarevetcare.com',
  ].filter(Boolean))],
  runSeed: process.env.RUN_SEED === 'true',
  databaseUrl: process.env.DATABASE_URL || null,
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    user: process.env.DB_USER || 'lims_user',
    password: process.env.DB_PASSWORD || 'lims_password',
    database: process.env.DB_NAME || 'rare_vet_lims',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    portalExpiresIn: process.env.PORTAL_JWT_EXPIRES_IN || '7d',
  },
  storage: (() => {
    const s3Ready = !!(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY);
    const type = process.env.STORAGE_TYPE === 's3' || s3Ready ? 's3' : (process.env.STORAGE_TYPE || 'local');
    return {
    type,
    path: process.env.STORAGE_PATH || './uploads',
    s3: {
      bucket: process.env.S3_BUCKET,
      region: process.env.S3_REGION,
      accessKey: process.env.S3_ACCESS_KEY,
      secretKey: process.env.S3_SECRET_KEY,
      endpoint: process.env.S3_ENDPOINT,
    },
  };
  })(),
  lab: {
    name: process.env.LAB_NAME || LAB_NAME_EN,
    nameAr: process.env.LAB_NAME_AR || LAB_NAME_AR,
    subtitle: process.env.LAB_SUBTITLE || 'Veterinary Medical & Research Laboratory',
    subtitleAr: process.env.LAB_SUBTITLE_AR || 'للتحاليل البيطرية والبحثية',
    address: process.env.LAB_ADDRESS || 'Kingdom of Saudi Arabia',
    phone: process.env.LAB_PHONE || '0115007257',
    email: process.env.LAB_EMAIL || 'alnwader.10hz@gmail.com',
    website: process.env.LAB_WEBSITE || 'https://lims.rarevetcare.com',
    licenseNumber: process.env.LAB_LICENSE_NUMBER || '',
    vatNumber: process.env.VAT_NUMBER || '311042487300003',
  },
  portal: {
    staticOtp: resolvePortalStaticOtp(),
    /** When true, preliminary validated reports (reviewed) appear in customer portal */
    showReviewed: process.env.PORTAL_SHOW_REVIEWED === 'true',
  },
  workflow: {
    enabled: process.env.WORKFLOW_ENGINE_ENABLED === 'true',
  },
  features: {
    reportDesign: parseInt(process.env.REPORT_DESIGN || '3', 10) || 3,
    smartReportLifecycle: process.env.SMART_REPORT_LIFECYCLE_ENABLED === 'true',
    reportMastering: process.env.REPORT_MASTERING_ENABLED === 'true',
    /** Block barcode print/register until invoice issued or credit allowed */
    requireInvoiceBeforeBarcode: process.env.REQUIRE_INVOICE_BEFORE_BARCODE === 'true',
    /** Samples appear in lab queue only after explicit handover */
    requireLabHandover: process.env.REQUIRE_LAB_HANDOVER === 'true',
    /** Lock results/tests/customer/animal edits after report approval */
    lockApprovedReports: process.env.LOCK_APPROVED_REPORTS === 'true',
    /**
     * When true: ignore critical_low/high (no CRIT flags, no critical alerts).
     * Min/Max → LOW/HIGH unchanged. Default false = current behaviour.
     */
    disableCriticalFlags: process.env.DISABLE_CRITICAL_FLAGS === 'true',
    /**
     * When true: ELISA-only entry/report layout (S/P% + Pos/Neg + text ref).
     * Default false — no change to existing lab behaviour.
     */
    elisaSpecialEntry: process.env.ELISA_SPECIAL_ENTRY === 'true',
    /**
     * When true: staff may skip/cancel pending report notifications from Customers.
     * Default false — no change to existing send behaviour.
     */
    skipReadyReports: process.env.SKIP_READY_REPORTS_ENABLED === 'true',
  },
  softDelete: {
    enabled: process.env.SOFT_DELETE_ENABLED === 'true',
    retentionHours: parseInt(process.env.SOFT_DELETE_RETENTION_HOURS || '48', 10),
  },
  backup: {
    uploads: {
      enabled: process.env.UPLOAD_BACKUP_ENABLED === 'true',
      dir: process.env.UPLOAD_BACKUP_DIR || './backups/uploads',
      retentionDays: parseInt(process.env.UPLOAD_BACKUP_RETENTION_DAYS || '14', 10),
      s3Prefix: process.env.UPLOAD_BACKUP_S3_PREFIX || 'backups/uploads',
    },
  },
  database: {
    sslRejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
  },
  notifications: {
    provider: process.env.NOTIFICATION_PROVIDER || 'msegat',
    defaultChannel: process.env.NOTIFICATION_DEFAULT_CHANNEL || 'sms',
    whatsapp: process.env.WHATSAPP_ENABLED === 'true',
    sms: process.env.SMS_ENABLED === 'true',
    email: process.env.EMAIL_ENABLED === 'true',
    sendReal: process.env.SEND_REAL_NOTIFICATIONS === 'true',
    msegat: {
      username: process.env.MSEGAT_USERNAME || '',
      apiKey: process.env.MSEGAT_API_KEY || '',
      sender: process.env.MSEGAT_SENDER || '',
      msgEncoding: process.env.MSEGAT_MSG_ENCODING || 'UTF8',
      apiUrl: process.env.MSEGAT_API_URL || 'https://www.msegat.com/gw/sendsms.php',
    },
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN || '',
      smsFrom: process.env.TWILIO_SMS_FROM || '',
      whatsappFrom: process.env.TWILIO_WHATSAPP_FROM || '',
    },
  },
};

module.exports = env;
