const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const env = require('../config/env');
const { AppError } = require('./errorHandler');
const { resolveCustomerIdsByMobile } = require('../utils/customer-scope');

const resolvePortalCustomerIds = async (customer) => {
  if (!customer?.id) return [];
  return resolveCustomerIdsByMobile(customer.id);
};

const authenticateCustomer = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, env.jwt.secret);

    if (decoded.type !== 'customer' || !decoded.customerId) {
      throw new AppError('Invalid token', 401, 'UNAUTHORIZED');
    }

    const result = await query(
      'SELECT id, full_name, full_name_ar, mobile, city, farm_company FROM customers WHERE id = $1 AND is_active = true',
      [decoded.customerId]
    );

    if (!result.rows[0]) {
      throw new AppError('Customer not found or inactive', 401, 'UNAUTHORIZED');
    }

    req.customer = result.rows[0];
    req.portalCustomerIds = await resolvePortalCustomerIds(result.rows[0]);
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return next(new AppError('Invalid or expired token', 401, 'UNAUTHORIZED'));
    }
    next(err);
  }
};

module.exports = { authenticateCustomer };
