const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const env = require('../config/env');
const { AppError } = require('./errorHandler');

const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, env.jwt.secret);

    const result = await query(
      `SELECT u.id, u.username, u.email, u.full_name, u.full_name_ar, u.role_id, u.language, u.theme, u.is_active,
              r.name as role_name
       FROM users u JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [decoded.userId]
    );

    if (!result.rows[0] || !result.rows[0].is_active) {
      throw new AppError('User not found or inactive', 401, 'UNAUTHORIZED');
    }

    const perms = await query(
      `SELECT p.code FROM permissions p
       JOIN role_permissions rp ON p.id = rp.permission_id
       WHERE rp.role_id = $1`,
      [result.rows[0].role_id]
    );

    req.user = {
      ...result.rows[0],
      role: result.rows[0].role_name,
      permissions: perms.rows.map((p) => p.code),
    };
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return next(new AppError('Invalid or expired token', 401, 'UNAUTHORIZED'));
    }
    next(err);
  }
};

const authorize = (...requiredPermissions) => (req, res, next) => {
  if (!req.user) return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));

  const hasPermission = requiredPermissions.some((p) =>
    req.user.permissions.includes(p) || req.user.role_name === 'admin'
  );

  if (!hasPermission) {
    return next(new AppError('Insufficient permissions', 403, 'FORBIDDEN'));
  }
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role_name !== 'admin') {
    return next(new AppError('Admin access required', 403, 'FORBIDDEN'));
  }
  next();
};

module.exports = { authenticate, authorize, requireAdmin };
