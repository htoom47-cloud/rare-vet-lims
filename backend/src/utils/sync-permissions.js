const { PERMISSIONS, ROLE_PERMISSIONS } = require('./permissions');
const logger = require('../config/logger');

async function syncPermissionsCatalog(client) {
  for (const [key, code] of Object.entries(PERMISSIONS)) {
    const module = code.split('.')[0];
    await client.query(
      `INSERT INTO permissions (code, module, description) VALUES ($1, $2, $3)
       ON CONFLICT (code) DO UPDATE SET module = EXCLUDED.module, description = EXCLUDED.description`,
      [code, module, key]
    );
  }
  logger.info('Permissions catalog synced');
}

/**
 * @param {object} client - pg client
 * @param {{ reset?: boolean }} options
 * reset=false (default): only add missing defaults — keeps admin customizations
 * reset=true: replace role permissions with ROLE_PERMISSIONS from code
 */
async function syncRolePermissions(client, { reset = false } = {}) {
  for (const [roleName, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const roleResult = await client.query('SELECT id FROM roles WHERE name = $1', [roleName]);
    if (!roleResult.rows[0]) continue;
    const roleId = roleResult.rows[0].id;

    if (reset) {
      await client.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);
    }

    for (const code of perms) {
      const perm = await client.query('SELECT id FROM permissions WHERE code = $1', [code]);
      if (perm.rows[0]) {
        await client.query(
          'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [roleId, perm.rows[0].id]
        );
      }
    }
  }
  logger.info(reset ? 'Role permissions reset from defaults' : 'Role permission defaults ensured');
}

module.exports = { syncPermissionsCatalog, syncRolePermissions };
