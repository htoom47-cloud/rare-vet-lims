const bcrypt = require('bcryptjs');
const { query, getClient } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { paginate, buildPagination } = require('../utils/helpers');

const DEMO_ACCOUNTS = [
  { username: 'reception', email: 'reception@rarevetcare.com' },
  { username: 'tech', email: 'tech@rarevetcare.com' },
  { username: 'vet', email: 'vet@rarevetcare.com' },
  { username: 'accountant', email: 'accountant@rarevetcare.com' },
  { username: 'manager', email: 'manager@rarevetcare.com' },
];

const list = async ({ page, limit, role_id }) => {
  const { offset, page: p, limit: l } = paginate(page, limit);
  const params = [];
  let where = "WHERE NOT (u.username LIKE 'archived.%')";

  if (role_id) { params.push(role_id); where += ` AND u.role_id = $${params.length}`; }

  const countResult = await query(`SELECT COUNT(*) FROM users u ${where}`, params);
  const total = parseInt(countResult.rows[0].count, 10);

  params.push(l, offset);
  const result = await query(
    `SELECT u.id, u.username, u.email, u.full_name, u.full_name_ar, u.phone, u.role_id, u.language, u.theme, u.is_active, u.last_login, u.created_at,
            r.name as role_name
     FROM users u JOIN roles r ON u.role_id = r.id
     ${where} ORDER BY u.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { data: result.rows, pagination: buildPagination(total, p, l) };
};

const getRoles = async () => {
  const result = await query('SELECT * FROM roles ORDER BY id');
  return result.rows;
};

const getPermissions = async (roleId) => {
  const result = await query(
    `SELECT p.* FROM permissions p JOIN role_permissions rp ON p.id = rp.permission_id WHERE rp.role_id = $1`,
    [roleId]
  );
  return result.rows;
};

const listAllPermissions = async () => {
  const result = await query('SELECT * FROM permissions ORDER BY module, code');
  return result.rows;
};

const updateRolePermissions = async (roleId, permissionCodes) => {
  const roleResult = await query('SELECT id, name FROM roles WHERE id = $1', [roleId]);
  if (!roleResult.rows[0]) throw new AppError('Role not found', 404, 'NOT_FOUND');
  if (roleResult.rows[0].name === 'admin') {
    throw new AppError('Cannot modify admin role permissions', 403, 'FORBIDDEN');
  }

  await query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);

  for (const code of permissionCodes) {
    const perm = await query('SELECT id FROM permissions WHERE code = $1', [code]);
    if (perm.rows[0]) {
      await query(
        'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [roleId, perm.rows[0].id]
      );
    }
  }

  return getPermissions(roleId);
};

const normalizeUsername = (value) => value.trim().toLowerCase();

const create = async (data) => {
  const username = normalizeUsername(data.username);
  const email = (data.email || `${username}@rarevetcare.local`).toLowerCase().trim();

  const dupUser = await query('SELECT id FROM users WHERE LOWER(username) = $1', [username]);
  if (dupUser.rows[0]) throw new AppError('Username already exists', 400, 'DUPLICATE_USERNAME');

  const dupEmail = await query('SELECT id FROM users WHERE LOWER(email) = $1', [email]);
  if (dupEmail.rows[0]) throw new AppError('Email already exists', 400, 'DUPLICATE_EMAIL');

  const roleResult = await query('SELECT name FROM roles WHERE id = $1', [data.role_id]);
  if (!roleResult.rows[0]) throw new AppError('Role not found', 404, 'NOT_FOUND');
  if (roleResult.rows[0].name === 'admin') {
    throw new AppError('Cannot create admin users', 403, 'FORBIDDEN');
  }

  const hash = await bcrypt.hash(data.password, 12);
  const result = await query(
    `INSERT INTO users (username, email, password_hash, full_name, full_name_ar, phone, role_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, username, email, full_name, full_name_ar, phone, role_id, is_active, created_at`,
    [username, email, hash, data.full_name, data.full_name_ar, data.phone, data.role_id]
  );
  return result.rows[0];
};

const update = async (id, data, actorId) => {
  const existing = await query(
    `SELECT u.*, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1`,
    [id]
  );
  if (!existing.rows[0]) throw new AppError('User not found', 404, 'NOT_FOUND');

  if (existing.rows[0].role_name === 'admin') {
    if (data.is_active === false) throw new AppError('Cannot deactivate admin account', 403, 'FORBIDDEN');
    if (data.role_id && Number(data.role_id) !== existing.rows[0].role_id) {
      throw new AppError('Cannot change admin role', 403, 'FORBIDDEN');
    }
  }

  if (id === actorId && data.is_active === false) {
    throw new AppError('Cannot deactivate your own account', 403, 'FORBIDDEN');
  }

  if (data.role_id) {
    const newRole = await query('SELECT name FROM roles WHERE id = $1', [data.role_id]);
    if (!newRole.rows[0]) throw new AppError('Role not found', 404, 'NOT_FOUND');
    if (newRole.rows[0].name === 'admin' && existing.rows[0].role_name !== 'admin') {
      throw new AppError('Cannot assign admin role', 403, 'FORBIDDEN');
    }
  }

  const fields = [];
  const params = [];
  let idx = 1;

  if (data.username && existing.rows[0].role_name !== 'admin') {
    const username = normalizeUsername(data.username);
    const dup = await query('SELECT id FROM users WHERE LOWER(username) = $1 AND id != $2', [username, id]);
    if (dup.rows[0]) throw new AppError('Username already exists', 400, 'DUPLICATE_USERNAME');
    fields.push(`username = $${idx}`);
    params.push(username);
    idx++;
  }

  if (data.email) {
    const email = data.email.toLowerCase().trim();
    const dup = await query('SELECT id FROM users WHERE LOWER(email) = $1 AND id != $2', [email, id]);
    if (dup.rows[0]) throw new AppError('Email already exists', 400, 'DUPLICATE_EMAIL');
    fields.push(`email = $${idx}`);
    params.push(email);
    idx++;
  }

  ['full_name', 'full_name_ar', 'phone', 'role_id', 'language', 'theme', 'is_active'].forEach((field) => {
    if (data[field] !== undefined) {
      fields.push(`${field} = $${idx}`);
      params.push(data[field]);
      idx++;
    }
  });

  if (data.password) {
    fields.push(`password_hash = $${idx}`);
    params.push(await bcrypt.hash(data.password, 12));
    idx++;
  }

  params.push(id);
  const result = await query(
    `UPDATE users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx}
     RETURNING id, username, email, full_name, full_name_ar, phone, role_id, language, theme, is_active`,
    params
  );

  if (!result.rows[0]) throw new AppError('User not found', 404, 'NOT_FOUND');
  return result.rows[0];
};

const USER_REF_UPDATES = [
  ['customers', 'created_by'],
  ['animals', 'created_by'],
  ['samples', 'assigned_technician'],
  ['samples', 'created_by'],
  ['sample_tests', 'technician_id'],
  ['results', 'entered_by'],
  ['results', 'validated_by'],
  ['reports', 'generated_by'],
  ['invoices', 'created_by'],
  ['payments', 'received_by'],
  ['refunds', 'processed_by'],
  ['inventory_transactions', 'performed_by'],
  ['qc_records', 'performed_by'],
  ['calibration_logs', 'performed_by'],
  ['temperature_logs', 'recorded_by'],
  ['settings', 'updated_by'],
  ['audit_logs', 'user_id'],
];

const assertCanRemove = async (id, actorId) => {
  const existing = await query(
    `SELECT u.id, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1`,
    [id]
  );
  if (!existing.rows[0]) throw new AppError('User not found', 404, 'NOT_FOUND');
  if (existing.rows[0].role_name === 'admin') {
    throw new AppError('Cannot remove admin account', 403, 'FORBIDDEN');
  }
  if (actorId && id === actorId) throw new AppError('Cannot remove your own account', 403, 'FORBIDDEN');
  return existing.rows[0];
};

const remove = async (id, actorId) => {
  await assertCanRemove(id, actorId);

  const client = await getClient();
  try {
    await client.query('BEGIN');
    for (const [table, column] of USER_REF_UPDATES) {
      await client.query(`UPDATE ${table} SET ${column} = NULL WHERE ${column} = $1`, [id]);
    }
    const result = await client.query(
      'DELETE FROM users WHERE id = $1 RETURNING id, username, full_name',
      [id]
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const purgeDemoUsers = async () => {
  const removed = [];
  for (const demo of DEMO_ACCOUNTS) {
    const user = await query(
      `SELECT u.id, r.name as role_name FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE LOWER(u.username) = $1 OR LOWER(u.email) = $2`,
      [demo.username, demo.email.toLowerCase()]
    );
    if (!user.rows[0] || user.rows[0].role_name === 'admin') continue;
    await remove(user.rows[0].id, null);
    removed.push(demo.username);
  }
  return { removed, count: removed.length };
};

module.exports = {
  list, getRoles, getPermissions, listAllPermissions, updateRolePermissions, create, update, remove, purgeDemoUsers,
};
