require('dotenv').config();

const appUrl = process.env.APP_URL
  || process.env.RENDER_EXTERNAL_URL
  || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null)
  || process.env.CORS_ORIGIN
  || 'http://localhost:5173';

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,
  appUrl,
  serveFrontend: process.env.SERVE_FRONTEND === 'true',
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
  },
  corsOrigin: process.env.CORS_ORIGIN || appUrl,
  storage: {
    type: process.env.STORAGE_TYPE || 'local',
    path: process.env.STORAGE_PATH || './uploads',
    s3: {
      bucket: process.env.S3_BUCKET,
      region: process.env.S3_REGION,
      accessKey: process.env.S3_ACCESS_KEY,
      secretKey: process.env.S3_SECRET_KEY,
      endpoint: process.env.S3_ENDPOINT,
    },
  },
  lab: {
    name: process.env.LAB_NAME || 'Rare Veterinary Care',
    nameAr: process.env.LAB_NAME_AR || 'رير للرعاية البيطرية',
    address: process.env.LAB_ADDRESS || 'Kingdom of Saudi Arabia',
    phone: process.env.LAB_PHONE || '+966500000000',
    email: process.env.LAB_EMAIL || 'lab@rarevetcare.com',
    vatNumber: process.env.VAT_NUMBER || '300000000000003',
  },
  notifications: {
    whatsapp: process.env.WHATSAPP_ENABLED === 'true',
    sms: process.env.SMS_ENABLED === 'true',
    email: process.env.EMAIL_ENABLED === 'true',
  },
};

module.exports = env;
