const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../config/database');
const env = require('../config/env');
const logger = require('../config/logger');
const { AppError } = require('../middleware/errorHandler');
const { hashToken } = require('../utils/helpers');
const { uuidv4 } = require('../utils/uuid');
const notifications = require('./notifications.service');

const login = async (username, password) => {
  const identifier = username.trim().toLowerCase();
  const result = await query(
    identifier.includes('@')
      ? `SELECT u.*, r.name as role_name FROM users u
         JOIN roles r ON u.role_id = r.id WHERE LOWER(u.email) = $1`
      : `SELECT u.*, r.name as role_name FROM users u
         JOIN roles r ON u.role_id = r.id
         WHERE LOWER(u.username) = $1
            OR LOWER(split_part(u.email, '@', 1)) = $1`,
    [identifier]
  );

  const user = result.rows[0];
  if (!user || !user.is_active) {
    throw new AppError('Invalid username or password', 401, 'INVALID_CREDENTIALS');
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new AppError('Invalid username or password', 401, 'INVALID_CREDENTIALS');

  await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

  const perms = await query(
    `SELECT p.code FROM permissions p JOIN role_permissions rp ON p.id = rp.permission_id WHERE rp.role_id = $1`,
    [user.role_id]
  );

  const accessToken = jwt.sign({ userId: user.id, role: user.role_name }, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn,
  });

  const refreshToken = crypto.randomBytes(40).toString('hex');
  await query(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')`,
    [uuidv4(), user.id, hashToken(refreshToken)]
  );

  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      full_name_ar: user.full_name_ar,
      role: user.role_name,
      language: user.language,
      theme: user.theme,
      permissions: perms.rows.map((p) => p.code),
    },
    accessToken,
    refreshToken,
  };
};

const refreshAccessToken = async (refreshToken) => {
  const result = await query(
    `SELECT rt.*, u.id as user_id, u.role_id, r.name as role_name
     FROM refresh_tokens rt JOIN users u ON rt.user_id = u.id
     JOIN roles r ON u.role_id = r.id
     WHERE rt.token_hash = $1 AND rt.expires_at > NOW() AND u.is_active = true`,
    [hashToken(refreshToken)]
  );

  if (!result.rows[0]) throw new AppError('Invalid refresh token', 401, 'INVALID_TOKEN');

  const { user_id, role_name } = result.rows[0];
  const accessToken = jwt.sign({ userId: user_id, role: role_name }, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn,
  });

  return { accessToken };
};

const logout = async (refreshToken) => {
  if (refreshToken) {
    await query('DELETE FROM refresh_tokens WHERE token_hash = $1', [hashToken(refreshToken)]);
  }
};

const deliverPasswordReset = async ({ email, phone, token }) => {
  const resetUrl = `${env.staffAppUrl.replace(/\/$/, '')}/reset-password?token=${token}`;
  const body = [
    `${env.lab.name}`,
    'Password reset request',
    `Reset link (valid 1 hour): ${resetUrl}`,
    `If you did not request this, ignore this message.`,
  ].join('\n');

  if (env.notifications.email) {
    await notifications.queue({
      channel: 'email',
      recipient: email,
      subject: `${env.lab.name} — Password Reset`,
      body,
      metadata: { type: 'password_reset' },
    });
    return 'email';
  }

  if (env.notifications.sms && phone) {
    await notifications.queue({
      channel: 'sms',
      recipient: phone,
      subject: null,
      body: `${env.lab.nameAr}: رابط إعادة تعيين كلمة المرور ${resetUrl}`,
      metadata: { type: 'password_reset' },
    });
    return 'sms';
  }

  if (env.nodeEnv === 'development') {
    logger.debug('Password reset link generated (dev only — not sent via API)', {
      email,
      resetUrl,
    });
    return 'dev_logged';
  }

  logger.warn('Password reset token stored but no delivery channel enabled', { email });
  return 'none';
};

const requestPasswordReset = async (email) => {
  const generic = { message: 'If the email exists, a reset link will be sent' };
  const normalized = email?.toLowerCase?.()?.trim();
  if (!normalized) return generic;

  const result = await query(
    'SELECT id, email, phone FROM users WHERE email = $1 AND is_active = true',
    [normalized]
  );
  if (!result.rows[0]) return generic;

  const user = result.rows[0];
  const token = crypto.randomBytes(32).toString('hex');
  await query(
    `UPDATE users SET password_reset_token = $1, password_reset_expires = NOW() + INTERVAL '1 hour' WHERE id = $2`,
    [hashToken(token), user.id]
  );

  try {
    await deliverPasswordReset({ email: user.email, phone: user.phone, token });
  } catch (err) {
    logger.warn('Password reset delivery failed', { email: user.email, error: err.message });
  }

  return generic;
};

const resetPassword = async (token, newPassword) => {
  const result = await query(
    `SELECT id FROM users WHERE password_reset_token = $1 AND password_reset_expires > NOW()`,
    [hashToken(token)]
  );

  if (!result.rows[0]) throw new AppError('Invalid or expired reset token', 400, 'INVALID_TOKEN');

  const hash = await bcrypt.hash(newPassword, 12);
  await query(
    `UPDATE users SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL WHERE id = $2`,
    [hash, result.rows[0].id]
  );

  return { message: 'Password reset successful' };
};

module.exports = { login, refreshAccessToken, logout, requestPasswordReset, resetPassword };
