const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { paginate, buildPagination } = require('../utils/helpers');

const DEMO_EMAILS = [
  'reception@rarevetcare.com',
  'tech@rarevetcare.com',
  'vet@rarevetcare.com',
  'accountant@rarevetcare.com',
  'manager@rarevetcare.com',
];

const list = async ({ page, limit, role_id }) => {
  const { offset, page: p, limit: l } = paginate(page, limit);
  const params = [];
  let where = 'WHERE 1=1';

  if (role_id) { params.push(role_id); where += ` AND u.role_id = $${params.length}`; }

  const countResult = await query(`SELECT COUNT(*) FROM users u ${where}`, params);
  const total = parseInt(countResult.rows[0].count, 10);

  params.push(l, offset);
  const result = await query(
    `SELECT u.id, u.email, u.full_name, u.full_name_ar, u.phone, u.role_id, u.language, u.theme, u.is_active, u.last_login, u.created_at,
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

const create = async (data) => {
  const existing = await query('SELECT id FROM users WHERE email = $1', [data.email.toLowerCase()]);
  if (existing.rows[0]) throw new AppError('Email already exists', 400, 'DUPLICATE_EMAIL');

  const roleResult = await query('SELECT name FROM roles WHERE id = $1', [data.role_id]);
  if (!roleResult.rows[0]) throw new AppError('Role not found', 404, 'NOT_FOUND');
  if (roleResult.rows[0].name === 'admin') {
    throw new AppError('Cannot create admin users', 403, 'FORBIDDEN');
  }

  const hash = await bcrypt.hash(data.password, 12);
  const result = await query(
    `INSERT INTO users (email, password_hash, full_name, full_name_ar, phone, role_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, email, full_name, full_name_ar, phone, role_id, is_active, created_at`,
    [data.email.toLowerCase(), hash, data.full_name, data.full_name_ar, data.phone, data.role_id]
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
     RETURNING id, email, full_name, full_name_ar, phone, role_id, language, theme, is_active`,
    params
  );

  if (!result.rows[0]) throw new AppError('User not found', 404, 'NOT_FOUND');
  return result.rows[0];
};

const archive = async (id, actorId) => {
  const existing = await query(
    `SELECT u.*, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1`,
    [id]
  );
  if (!existing.rows[0]) throw new AppError('User not found', 404, 'NOT_FOUND');
  if (existing.rows[0].role_name === 'admin') {
    throw new AppError('Cannot remove admin account', 403, 'FORBIDDEN');
  }
  if (id === actorId) throw new AppError('Cannot remove your own account', 403, 'FORBIDDEN');

  const archivedEmail = `archived.${id.replace(/-/g, '')}@removed.local`;
  const result = await query(
    `UPDATE users SET is_active = false, email = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, email, full_name, is_active`,
    [archivedEmail, id]
  );
  return result.rows[0];
};

const purgeDemoUsers = async () => {
  const archived = [];
  for (const email of DEMO_EMAILS) {
    const user = await query(
      `SELECT u.id, u.email, r.name as role_name FROM users u
       JOIN roles r ON u.role_id = r.id WHERE u.email = $1`,
      [email.toLowerCase()]
    );
    if (!user.rows[0] || user.rows[0].role_name === 'admin') continue;
    const archivedEmail = `archived.${user.rows[0].id.replace(/-/g, '')}@removed.local`;
    await query(
      `UPDATE users SET is_active = false, email = $1, updated_at = NOW() WHERE id = $2`,
      [archivedEmail, user.rows[0].id]
    );
    archived.push(email);
  }
  return { archived, count: archived.length };
};

module.exports = {
  list, getRoles, getPermissions, listAllPermissions, updateRolePermissions, create, update, archive, purgeDemoUsers,
};
