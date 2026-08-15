const { uuidv4 } = require('./uuid');
const { AppError } = require('../middleware/errorHandler');

const logPurchaseAudit = async (client, {
  userId,
  action,
  entityId,
  oldValues = null,
  newValues = null,
  req = null,
} = {}) => {
  if (!client || typeof client.query !== 'function') {
    throw new AppError('Purchase audit requires a transaction client', 500, 'AUDIT_CLIENT_REQUIRED');
  }
  if (!userId) {
    throw new AppError('Audit actor is required', 500, 'AUDIT_REQUIRED');
  }
  await client.query(
    `INSERT INTO audit_logs (id, user_id, action, module, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
     VALUES ($1, $2, $3, 'purchases', 'purchase_invoice', $4, $5, $6, $7, $8)`,
    [
      uuidv4(),
      userId,
      action,
      entityId,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      req?.ip || null,
      req?.get?.('user-agent') || null,
    ]
  );
};

module.exports = { logPurchaseAudit };
