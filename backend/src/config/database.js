const { Pool } = require('pg');
const env = require('./env');
const logger = require('./logger');

const buildSslConfig = () => {
  if (env.nodeEnv !== 'production') return false;
  if (process.env.DATABASE_SSL === 'false') return false;

  const caCert = process.env.DATABASE_CA_CERT?.trim();
  if (caCert) {
    return { ca: caCert, rejectUnauthorized: true };
  }

  const rejectEnv = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED;
  if (rejectEnv === 'true') return { rejectUnauthorized: true };
  if (rejectEnv === 'false') return { rejectUnauthorized: false };

  // Render managed Postgres uses a self-signed cert without a bundled CA.
  if (process.env.RENDER) return { rejectUnauthorized: false };

  return { rejectUnauthorized: true };
};

const buildPoolConfig = () => {
  const ssl = buildSslConfig();
  const common = { max: 20, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000, ssl };

  if (env.databaseUrl) {
    return { connectionString: env.databaseUrl, ...common };
  }

  const host = process.env.PGHOST || env.db.host;
  const port = parseInt(process.env.PGPORT, 10) || env.db.port;
  const user = process.env.PGUSER || env.db.user;
  const password = process.env.PGPASSWORD || env.db.password;
  const database = process.env.PGDATABASE || env.db.database;

  return { host, port, user, password, database, ...common };
};

const pool = new Pool(buildPoolConfig());

pool.on('error', (err) => {
  logger.error('Unexpected database pool error', { error: err.message });
});

const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (env.nodeEnv === 'development') {
      logger.debug('Query executed', { duration, rows: result.rowCount });
    }
    return result;
  } catch (error) {
    logger.error('Database query error', { error: error.message, query: text });
    throw error;
  }
};

const getClient = () => pool.connect();

module.exports = { pool, query, getClient, buildSslConfig };
