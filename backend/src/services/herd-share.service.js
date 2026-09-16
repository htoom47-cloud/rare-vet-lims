const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { uuidv4 } = require('../utils/uuid');
const { normalizeMobileDigits, mobileEqualsSql } = require('../utils/helpers');
const { notDeleted } = require('../utils/soft-delete-sql');
const { resolveCustomerIdsByMobile } = require('../utils/customer-scope');
const entitlements = require('./entitlements.service');

const MAX_SHARES = 10;
const ROLES = ['agent', 'worker'];

const uniqueIds = (ids) => [...new Set((ids || []).filter(Boolean))];

const findCustomerByMobile = async (mobile) => {
  const digits = normalizeMobileDigits(mobile);
  if (digits.length < 9) return null;
  const result = await query(
    `SELECT id, full_name, full_name_ar, mobile, is_active
     FROM customers
     WHERE ${notDeleted()} AND ${mobileEqualsSql('mobile', 1)}
     ORDER BY is_active DESC, created_at DESC
     LIMIT 1`,
    [digits]
  );
  return result.rows[0] || null;
};

const ensureDelegateCustomer = async (mobile, displayName) => {
  const digits = normalizeMobileDigits(mobile);
  if (digits.length < 9) {
    throw new AppError('Enter a valid mobile number', 400, 'INVALID_MOBILE');
  }
  const storedMobile = digits.length === 9 ? `0${digits}` : mobile;
  const existing = await findCustomerByMobile(digits);
  if (existing) {
    if (!existing.is_active) {
      throw new AppError('This mobile belongs to an inactive account', 409, 'CUSTOMER_INACTIVE');
    }
    return existing;
  }
  const name = (displayName && String(displayName).trim()) || 'مشارك قطيع';
  const created = await query(
    `INSERT INTO customers (id, full_name, full_name_ar, mobile, notes, credit_limit)
     VALUES ($1,$2,$3,$4,$5,0) RETURNING id, full_name, full_name_ar, mobile, is_active`,
    [
      uuidv4(),
      name,
      name,
      storedMobile,
      'Portal herd share — can add herd data only; no laboratory reports unless they have their own samples.',
    ]
  );
  return created.rows[0];
};

const resolveHerdOwnerIds = async (customerId) => {
  const own = await resolveCustomerIdsByMobile(customerId);
  try {
    const digitsRow = await query(
      'SELECT mobile FROM customers WHERE id = $1 AND is_active = true',
      [customerId]
    );
    const digits = normalizeMobileDigits(digitsRow.rows[0]?.mobile || '');
    const suffix = digits.slice(-9);
    const delegated = await query(
      `SELECT DISTINCT owner_customer_id
       FROM portal_herd_delegates
       WHERE revoked_at IS NULL
         AND (
           delegate_customer_id = ANY($1::uuid[])
           OR shared_mobile_norm = $2
           OR RIGHT(shared_mobile_norm, 9) = $3
         )`,
      [own, digits || '__none__', suffix || '__none__']
    );
    const expanded = [...own];
    for (const row of delegated.rows) {
      const ownerIds = await resolveCustomerIdsByMobile(row.owner_customer_id);
      expanded.push(...ownerIds);
    }
    return uniqueIds(expanded);
  } catch (err) {
    if (err.code === '42P01') return own;
    throw err;
  }
};

const hasDelegatedHerdAccess = async (customerId) => {
  const own = await resolveCustomerIdsByMobile(customerId);
  const ids = await resolveHerdOwnerIds(customerId);
  const extra = ids.some((id) => !own.includes(id));
  if (!extra) return false;
  return entitlements.hasBreederDashboard(ids);
};

const describeAccess = async (customer, portalCustomerIds, herdOwnerIds) => {
  const herdOwner = await entitlements.hasBreederDashboard(portalCustomerIds);
  const delegated = !herdOwner && await entitlements.hasBreederDashboard(herdOwnerIds);
  let ownerName = null;
  if (delegated) {
    try {
      const digits = normalizeMobileDigits(customer.mobile || '');
      const suffix = digits.slice(-9);
      const row = await query(
        `SELECT c.full_name, c.full_name_ar
         FROM portal_herd_delegates d
         JOIN customers c ON c.id = d.owner_customer_id
         WHERE d.revoked_at IS NULL AND (
           d.delegate_customer_id = $1
           OR d.shared_mobile_norm = $2
           OR RIGHT(d.shared_mobile_norm, 9) = $3
         )
         ORDER BY d.created_at DESC
         LIMIT 1`,
        [customer.id, digits || '__none__', suffix || '__none__']
      );
      ownerName = row.rows[0]?.full_name_ar || row.rows[0]?.full_name || null;
    } catch (err) {
      if (err.code !== '42P01') throw err;
    }
  }
  return {
    herd_owner: herdOwner,
    is_delegate: delegated,
    owner_name: ownerName,
  };
};

const assertOwner = async (portalCustomerIds) => {
  await entitlements.requireBreederDashboard(portalCustomerIds);
};

const listShares = async (portalCustomerIds) => {
  await assertOwner(portalCustomerIds);
  try {
    const result = await query(
      `SELECT d.id, d.shared_mobile, d.role, d.display_name, d.created_at,
              c.full_name, c.full_name_ar, c.mobile
       FROM portal_herd_delegates d
       JOIN customers c ON c.id = d.delegate_customer_id
       WHERE d.owner_customer_id = ANY($1::uuid[]) AND d.revoked_at IS NULL
       ORDER BY d.created_at DESC`,
      [portalCustomerIds]
    );
    return result.rows.map((r) => ({
      id: r.id,
      mobile: r.shared_mobile || r.mobile,
      role: r.role,
      name: r.display_name || r.full_name_ar || r.full_name,
      created_at: r.created_at,
    }));
  } catch (err) {
    if (err.code === '42P01') return [];
    throw err;
  }
};

const addShare = async (portalCustomerIds, actorCustomerId, { mobile, name, role }) => {
  await assertOwner(portalCustomerIds);
  const ownerId = portalCustomerIds[0];
  const digits = normalizeMobileDigits(mobile);
  if (digits.length < 9) {
    throw new AppError('Enter a valid mobile number', 400, 'INVALID_MOBILE');
  }

  const ownerMobiles = await query(
    `SELECT mobile FROM customers WHERE id = ANY($1::uuid[]) AND is_active = true`,
    [portalCustomerIds]
  );
  const ownerSuffixes = new Set(ownerMobiles.rows.map((r) => normalizeMobileDigits(r.mobile).slice(-9)));
  if (ownerSuffixes.has(digits.slice(-9))) {
    throw new AppError('You cannot share the herd with your own mobile', 400, 'CANNOT_SHARE_SELF');
  }

  const existing = await listShares(portalCustomerIds);
  if (existing.length >= MAX_SHARES) {
    throw new AppError('Maximum number of shares reached', 400, 'SHARE_LIMIT');
  }

  const delegate = await ensureDelegateCustomer(mobile, name);
  if (portalCustomerIds.includes(delegate.id)) {
    throw new AppError('You cannot share the herd with your own mobile', 400, 'CANNOT_SHARE_SELF');
  }

  const shareRole = ROLES.includes(role) ? role : 'worker';
  const displayName = (name && String(name).trim()) || delegate.full_name || null;
  const storedMobile = delegate.mobile || (digits.length === 9 ? `0${digits}` : String(mobile));

  try {
    const revived = await query(
      `UPDATE portal_herd_delegates
       SET revoked_at = NULL, role = $3, display_name = $4, delegate_customer_id = $5,
           shared_mobile = $6, granted_by_customer_id = $7, updated_at = NOW()
       WHERE id = (
         SELECT id FROM portal_herd_delegates
         WHERE owner_customer_id = $1 AND shared_mobile_norm = $2 AND revoked_at IS NOT NULL
         ORDER BY updated_at DESC
         LIMIT 1
       )
       RETURNING id, shared_mobile, role, display_name, created_at`,
      [ownerId, digits, shareRole, displayName, delegate.id, storedMobile, actorCustomerId]
    );
    if (revived.rows[0]) {
      return {
        id: revived.rows[0].id,
        mobile: revived.rows[0].shared_mobile,
        role: revived.rows[0].role,
        name: revived.rows[0].display_name,
        created_at: revived.rows[0].created_at,
      };
    }

    const inserted = await query(
      `INSERT INTO portal_herd_delegates (
         id, owner_customer_id, delegate_customer_id, shared_mobile, shared_mobile_norm,
         role, display_name, granted_by_customer_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, shared_mobile, role, display_name, created_at`,
      [uuidv4(), ownerId, delegate.id, storedMobile, digits, shareRole, displayName, actorCustomerId]
    );
    return {
      id: inserted.rows[0].id,
      mobile: inserted.rows[0].shared_mobile,
      role: inserted.rows[0].role,
      name: inserted.rows[0].display_name,
      created_at: inserted.rows[0].created_at,
    };
  } catch (err) {
    if (err.code === '42P01') {
      throw new AppError('Herd sharing is not available yet', 503, 'SCHEMA_OUTDATED');
    }
    if (err.code === '23505') {
      throw new AppError('This mobile already has access', 409, 'ALREADY_SHARED');
    }
    throw err;
  }
};

const revokeShare = async (portalCustomerIds, shareId) => {
  await assertOwner(portalCustomerIds);
  const result = await query(
    `UPDATE portal_herd_delegates
     SET revoked_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND owner_customer_id = ANY($2::uuid[]) AND revoked_at IS NULL
     RETURNING id`,
    [shareId, portalCustomerIds]
  );
  if (!result.rows[0]) throw new AppError('Share not found', 404, 'NOT_FOUND');
  return { revoked: true };
};

module.exports = {
  resolveHerdOwnerIds,
  hasDelegatedHerdAccess,
  describeAccess,
  listShares,
  addShare,
  revokeShare,
};
