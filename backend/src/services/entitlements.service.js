const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const env = require('../config/env');
const { FEATURE_BREEDER_DASHBOARD } = require('../constants/breeder');
const { notDeleted } = require('../utils/soft-delete-sql');

const isGlobalEnabled = () => !!env.features?.breederDashboard;

const asIds = (customerIds) => {
  const ids = Array.isArray(customerIds) ? customerIds : [customerIds];
  return ids.filter(Boolean);
};

const getBreederEntitlement = async (customerId) => {
  try {
    const result = await query(
      `SELECT e.id, e.customer_id, e.feature_code, e.enabled, e.expires_at, e.notes,
              e.granted_by, e.created_at, e.updated_at,
              u.full_name AS granted_by_name
       FROM customer_entitlements e
       LEFT JOIN users u ON u.id = e.granted_by
       WHERE e.customer_id = $1 AND e.feature_code = $2`,
      [customerId, FEATURE_BREEDER_DASHBOARD]
    );
    return result.rows[0] || null;
  } catch (err) {
    if (err.code === '42P01') return null;
    throw err;
  }
};

const isEntitlementActive = (row) => {
  if (!row || row.enabled !== true) return false;
  if (!row.expires_at) return true;
  return new Date(row.expires_at).getTime() > Date.now();
};

const hasBreederDashboard = async (customerIds) => {
  if (!isGlobalEnabled()) return false;
  const ids = asIds(customerIds);
  if (!ids.length) return false;
  try {
    const result = await query(
      `SELECT 1 FROM customer_entitlements
       WHERE customer_id = ANY($1::uuid[])
         AND feature_code = $2
         AND enabled = true
         AND (expires_at IS NULL OR expires_at > NOW())
       LIMIT 1`,
      [ids, FEATURE_BREEDER_DASHBOARD]
    );
    return !!result.rows[0];
  } catch (err) {
    if (err.code === '42P01') return false;
    throw err;
  }
};

const getPortalFeatures = async (customerIds) => ({
  breederDashboard: await hasBreederDashboard(customerIds),
});

const upsertBreederDashboard = async (customerId, { enabled, expires_at, notes }, userId) => {
  const customer = await query(
    `SELECT id FROM customers WHERE id = $1 AND ${notDeleted()}`,
    [customerId]
  );
  if (!customer.rows[0]) throw new AppError('Customer not found', 404, 'NOT_FOUND');
  const enabledFlag = enabled === true;
  const expiresAt = expires_at || null;
  const notesVal = notes && String(notes).trim() ? String(notes).trim() : null;

  const result = await query(
    `INSERT INTO customer_entitlements (
       customer_id, feature_code, enabled, expires_at, notes, granted_by
     ) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (customer_id, feature_code) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       expires_at = EXCLUDED.expires_at,
       notes = EXCLUDED.notes,
       granted_by = EXCLUDED.granted_by,
       updated_at = NOW()
     RETURNING *`,
    [customerId, FEATURE_BREEDER_DASHBOARD, enabledFlag, expiresAt, notesVal, userId || null]
  );
  return result.rows[0];
};

const requireBreederDashboard = async (customerIds) => {
  if (!isGlobalEnabled()) {
    throw new AppError('Herd dashboard is not enabled', 403, 'FEATURE_DISABLED');
  }
  const ok = await hasBreederDashboard(customerIds);
  if (!ok) {
    throw new AppError('Herd dashboard is not included in your subscription', 403, 'NOT_ENTITLED');
  }
};

module.exports = {
  FEATURE_BREEDER_DASHBOARD,
  isGlobalEnabled,
  getBreederEntitlement,
  isEntitlementActive,
  hasBreederDashboard,
  getPortalFeatures,
  upsertBreederDashboard,
  requireBreederDashboard,
};
