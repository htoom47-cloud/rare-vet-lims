const { query } = require('../config/database');
const { uuidv4 } = require('./uuid');
const logger = require('../config/logger');

const logBillingAudit = async ({
  userId,
  action,
  entityType,
  entityId,
  oldValues = null,
  newValues = null,
  req = null,
}) => {
  if (!userId) return;
  try {
    await query(
      `INSERT INTO audit_logs (id, user_id, action, module, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
       VALUES ($1, $2, $3, 'billing', $4, $5, $6, $7, $8, $9)`,
      [
        uuidv4(),
        userId,
        action,
        entityType,
        entityId,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
        req?.ip || null,
        req?.get?.('user-agent') || null,
      ]
    );
  } catch (err) {
    logger.warn('Billing audit log failed', { error: err.message, action });
  }
};

module.exports = { logBillingAudit };
