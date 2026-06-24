const { query } = require('../config/database');
const logger = require('../config/logger');
const { uuidv4 } = require('../utils/uuid');

const auditLog = (action, module) => async (req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = async (body) => {
    if (res.statusCode < 400 && req.user) {
      try {
        await query(
          `INSERT INTO audit_logs (id, user_id, action, module, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            uuidv4(),
            req.user.id,
            action,
            module,
            req.auditEntityType || null,
            req.auditEntityId || body?.data?.id || null,
            req.auditOldValues ? JSON.stringify(req.auditOldValues) : null,
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
