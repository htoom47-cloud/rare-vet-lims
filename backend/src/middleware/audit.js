const { query } = require('../config/database');
const logger = require('../config/logger');

const auditLog = (action, module) => async (req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = async (body) => {
    if (res.statusCode < 400 && req.user) {
      try {
        await query(
          `INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id, new_values, ip_address, user_agent)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            req.user.id,
            action,
            module,
            req.auditEntityType || null,
            req.auditEntityId || body?.data?.id || null,
            req.auditNewValues ? JSON.stringify(req.auditNewValues) : null,
            req.ip,
            req.get('user-agent'),
          ]
        );
      } catch (err) {
        logger.warn('Audit log failed', { error: err.message });
      }
    }
    return originalJson(body);
  };

  next();
};

module.exports = { auditLog };
