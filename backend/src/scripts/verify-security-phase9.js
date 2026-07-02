/**
 * Security Phase 9A — P0 verification (mostly unit tests, no DB required).
 * Usage: node src/scripts/verify-security-phase9.js
 */
const assert = require('assert');
const bcrypt = require('bcryptjs');
const deviceKeys = require('../utils/device-api-key');
const { buildSslConfig } = require('../config/database');
const { loginRateLimit } = require('../middleware/loginRateLimit');
const authService = require('../services/auth.service');
const env = require('../config/env');

let passed = 0;
let failed = 0;

const check = async (label, fn) => {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${label}: ${err.message}`);
  }
};

(async () => {
  console.log('\n=== Security Hardening — Phase 9A ===\n');

  await check('Login rate limit — max 5 per 15 min window', () => {
    const { LOGIN_RATE_LIMIT } = require('../middleware/loginRateLimit');
    assert.strictEqual(LOGIN_RATE_LIMIT.max, 5);
    assert.strictEqual(LOGIN_RATE_LIMIT.windowMs, 15 * 60 * 1000);
  });

  await check('Login rate limit — 429 handler message', () => {
    const { loginRateLimitResponse } = require('../middleware/loginRateLimit');
    const res = { statusCode: null, body: null, status(code) { this.statusCode = code; return this; }, json(b) { this.body = b; } };
    loginRateLimitResponse({}, res);
    assert.strictEqual(res.statusCode, 429);
    assert.strictEqual(res.body.error.code, 'RATE_LIMITED');
    assert.match(res.body.error.message, /15 minutes/i);
  });

  await check('Forgot password — response shape has no resetToken field', async () => {
    const source = authService.requestPasswordReset.toString();
    assert.ok(!source.includes('resetToken: token'));
    assert.ok(!source.includes('resetToken:'));
  });

  await check('Forgot password — generic message only in return paths', async () => {
    const source = authService.requestPasswordReset.toString();
    assert.ok(source.includes("message: 'If the email exists"));
  });

  await check('Device API key — stored as bcrypt hash not plaintext', async () => {
    const { config, plaintextKey } = await deviceKeys.prepareConfigWithHashedKey({});
    assert.ok(config.api_key_hash);
    assert.ok(!config.api_key);
    assert.ok(config.api_key_prefix);
    assert.strictEqual(config.api_key_prefix, plaintextKey.slice(0, 8));
    const ok = await bcrypt.compare(plaintextKey, config.api_key_hash);
    assert.strictEqual(ok, true);
  });

  await check('Device API key — verify rejects wrong key', async () => {
    const { config } = await deviceKeys.prepareConfigWithHashedKey({});
    const bad = await deviceKeys.verifyApiKey(config, 'wrong-key');
    assert.strictEqual(bad.valid, false);
  });

  await check('Device API key — legacy plaintext still verifies + flags legacy', async () => {
    const legacy = { api_key: 'abc123legacykey000000000000' };
    const ok = await deviceKeys.verifyApiKey(legacy, 'abc123legacykey000000000000');
    assert.strictEqual(ok.valid, true);
    assert.strictEqual(ok.legacy, true);
  });

  await check('Device API key — sanitize hides hash and full key', async () => {
    const { config } = await deviceKeys.prepareConfigWithHashedKey({});
    const safe = deviceKeys.sanitizeDeviceConfig(config);
    assert.ok(!safe.api_key);
    assert.ok(!safe.api_key_hash);
    assert.ok(safe.api_key_masked);
  });

  await check('Database SSL — disabled in development', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    delete require.cache[require.resolve('../config/env')];
    delete require.cache[require.resolve('../config/database')];
    const { buildSslConfig: devSsl } = require('../config/database');
    assert.strictEqual(devSsl(), false);
    process.env.NODE_ENV = prev;
    delete require.cache[require.resolve('../config/env')];
    delete require.cache[require.resolve('../config/database')];
  });

  await check('Database SSL — production defaults rejectUnauthorized true', () => {
    const prevEnv = process.env.NODE_ENV;
    const prevReject = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED;
    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_SSL_REJECT_UNAUTHORIZED;
    delete require.cache[require.resolve('../config/env')];
    delete require.cache[require.resolve('../config/database')];
    const { buildSslConfig: prodSsl } = require('../config/database');
    const ssl = prodSsl();
    assert.ok(ssl);
    assert.strictEqual(ssl.rejectUnauthorized, true);
    process.env.NODE_ENV = prevEnv;
    if (prevReject !== undefined) process.env.DATABASE_SSL_REJECT_UNAUTHORIZED = prevReject;
    delete require.cache[require.resolve('../config/env')];
    delete require.cache[require.resolve('../config/database')];
  });

  await check('Database SSL — opt-out via DATABASE_SSL_REJECT_UNAUTHORIZED=false', () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED = 'false';
    delete require.cache[require.resolve('../config/env')];
    delete require.cache[require.resolve('../config/database')];
    const { buildSslConfig: prodSsl } = require('../config/database');
    assert.strictEqual(prodSsl().rejectUnauthorized, false);
    process.env.NODE_ENV = prevEnv;
    delete process.env.DATABASE_SSL_REJECT_UNAUTHORIZED;
    delete require.cache[require.resolve('../config/env')];
    delete require.cache[require.resolve('../config/database')];
  });

  await check('Upload backup — disabled by default', () => {
    assert.strictEqual(env.backup.uploads.enabled, false);
  });

  await check('Upload backup — script exists', () => {
    const fs = require('fs');
    const p = require('path').join(__dirname, 'backup-uploads.js');
    assert.ok(fs.existsSync(p));
  });

  await check('JWT — production rejects default dev secret (index guard present)', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require('path').join(__dirname, '../index.js'), 'utf8');
    assert.ok(src.includes("env.jwt.secret === 'dev-secret-change-me'"));
  });

  await check('SQL injection — query wrapper uses parameterized pattern', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require('path').join(__dirname, '../config/database.js'), 'utf8');
    assert.ok(src.includes('pool.query(text, params)'));
  });

  await check('XSS — auth responses return JSON not HTML', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require('path').join(__dirname, '../routes/auth.routes.js'), 'utf8');
    assert.ok(src.includes('res.json'));
    assert.ok(!src.includes('res.send(`<'));
  });

  await check('CORS — whitelist enforced on /api', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require('path').join(__dirname, '../app.js'), 'utf8');
    assert.ok(src.includes("app.use('/api', cors("));
    assert.ok(src.includes('env.corsOrigins.includes(origin)'));
  });

  await check('Helmet — enabled with CSP', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require('path').join(__dirname, '../app.js'), 'utf8');
    assert.ok(src.includes('helmet('));
    assert.ok(src.includes('contentSecurityPolicy'));
  });

  await check('Protected uploads — staff JWT required for reports path', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require('path').join(__dirname, '../config/storage.js'), 'utf8');
    assert.ok(src.includes("'reports/'"));
    assert.ok(src.includes('PROTECTED_UPLOAD_PREFIXES'));
  });

  await check('Device auth middleware — uses bcrypt verify not plaintext compare', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require('path').join(__dirname, '../middleware/deviceAuth.js'), 'utf8');
    assert.ok(src.includes('verifyApiKey'));
    assert.ok(!src.includes('storedKey !== apiKey'));
  });

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
