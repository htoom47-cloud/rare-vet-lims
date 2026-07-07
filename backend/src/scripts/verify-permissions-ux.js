/**
 * Phase 18 — Permissions UX hardening (static checks, no DB required).
 * Usage: node src/scripts/verify-permissions-ux.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { PERMISSIONS, ROLE_PERMISSIONS } = require('../utils/permissions');

const ROOT = path.join(__dirname, '..', '..', '..');
const FRONT = path.join(ROOT, 'frontend', 'src');
const UX = path.join(FRONT, 'constants', 'permissionsUx.js');
const USERS = path.join(FRONT, 'pages', 'Users.jsx');
const I18N = path.join(FRONT, 'i18n', 'index.js');
const AUTH = path.join(__dirname, '..', 'middleware', 'auth.js');
const USERS_ROUTES = path.join(__dirname, '..', 'routes', 'users.routes.js');

let passed = 0;
let failed = 0;

const check = (name, fn) => {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed += 1;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed += 1;
  }
};

const allCodes = Object.values(PERMISSIONS);

console.log('\n=== Phase 18 — Permissions UX ===\n');

check('permissionsUx.js exists', () => {
  assert.ok(fs.existsSync(UX));
});

check('Users.jsx wires permissionsUx metadata', () => {
  const src = fs.readFileSync(USERS, 'utf8');
  assert.ok(src.includes("from '../constants/permissionsUx'"));
  assert.ok(src.includes('uxGroupForCode'));
  assert.ok(src.includes('ROLE_PERMISSION_PRESETS'));
  assert.ok(src.includes('isSensitivePermission'));
  assert.ok(src.includes('applyPreset'));
  assert.ok(src.includes('permissions.ux.sensitiveWarning'));
  assert.ok(src.includes('permSearch'));
  assert.ok(src.includes('groupFilter'));
});

check('save uses same PUT payload { permissions: string[] }', () => {
  const src = fs.readFileSync(USERS, 'utf8');
  assert.ok(src.includes('updateRolePermissions(selectedRole.id, requested)'));
  const routes = fs.readFileSync(USERS_ROUTES, 'utf8');
  assert.ok(routes.includes("req.body.permissions"));
});

check('save reloads permissions from server after PUT', () => {
  const src = fs.readFileSync(USERS, 'utf8');
  assert.ok(src.includes('await usersAPI.permissions(selectedRole.id)'));
  assert.match(src, /updateRolePermissions[\s\S]*permissions\(selectedRole\.id\)/);
});

check('preset does not auto-save (no PUT in applyPreset)', () => {
  const src = fs.readFileSync(USERS, 'utf8');
  const presetBlock = src.slice(src.indexOf('const applyPreset'), src.indexOf('const saveRolePermissions'));
  assert.ok(!presetBlock.includes('updateRolePermissions'));
  assert.ok(presetBlock.includes('setEditedPermissions'));
});

check('every permission code mapped to UX group', () => {
  const src = fs.readFileSync(UX, 'utf8');
  for (const code of allCodes) {
    assert.ok(src.includes(`'${code}'`), `missing UX map for ${code}`);
  }
});

check('ROLE presets mirror backend ROLE_PERMISSIONS', () => {
  const src = fs.readFileSync(UX, 'utf8');
  for (const [role, codes] of Object.entries(ROLE_PERMISSIONS)) {
    if (role === 'admin') {
      assert.ok(src.includes('admin: null'));
      continue;
    }
    for (const code of codes) {
      assert.ok(src.includes(`'${code}'`), `preset for ${role} missing ${code}`);
    }
    const blockRe = new RegExp(`${role}:\\s*\\[([\\s\\S]*?)\\]`, 'm');
    const m = src.match(blockRe);
    assert.ok(m, `preset block for ${role}`);
    const block = m[1];
    const presetCodes = [...block.matchAll(/'([^']+)'/g)].map((x) => x[1]);
    assert.strictEqual(
      [...presetCodes].sort().join(','),
      [...codes].sort().join(','),
      `preset mismatch for ${role}`
    );
  }
});

check('sensitive permissions set is non-empty', () => {
  const src = fs.readFileSync(UX, 'utf8');
  const m = src.match(/SENSITIVE_PERMISSION_CODES = new Set\(\[([\s\S]*?)\]\)/);
  assert.ok(m, 'SENSITIVE_PERMISSION_CODES block');
  const codes = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  assert.ok(codes.length >= 10);
  assert.ok(codes.includes('customers.delete'));
  assert.ok(codes.includes('notifications.send_report'));
  assert.ok(codes.includes('reference_ranges.manage'));
});

check('i18n has Arabic labels for all permission codes', () => {
  const i18n = fs.readFileSync(I18N, 'utf8');
  for (const code of allCodes) {
    if (code.startsWith('data.trash.')) {
      const action = code.split('.').pop();
      assert.ok(i18n.includes(`trash: { view:`) || i18n.includes(`trash.${action}`), `i18n missing ${code}`);
    } else {
      const [mod, action] = code.split('.');
      assert.ok(
        i18n.includes(`${mod}: {`) && i18n.includes(`${action}:`),
        `i18n likely missing label for ${code}`
      );
    }
  }
});

check('i18n has UX group labels (EN + AR)', () => {
  const i18n = fs.readFileSync(I18N, 'utf8');
  assert.ok(i18n.includes("reception: 'الاستقبال'"));
  assert.ok(i18n.includes("sensitiveSection: 'صلاحيات حساسة'"));
  assert.ok(i18n.includes("sensitiveWarning:"));
});

check('backend authorization unchanged (no edits to auth middleware)', () => {
  const src = fs.readFileSync(AUTH, 'utf8');
  assert.ok(src.includes('authorize'));
  assert.ok(!src.includes('permissionsUx'));
});

check('permission codes unchanged in permissions.js export', () => {
  assert.ok(PERMISSIONS.SAMPLE_TESTS_REMOVE === 'sample_tests.remove');
  assert.ok(PERMISSIONS.REFERENCE_RANGES_MANAGE === 'reference_ranges.manage');
  assert.ok(PERMISSIONS.NOTIFICATIONS_SEND_REPORT === 'notifications.send_report');
});

check('Samples/Reports do not embed role permission editor', () => {
  for (const page of ['Samples.jsx', 'Reports.jsx']) {
    const src = fs.readFileSync(path.join(FRONT, 'pages', page), 'utf8');
    assert.ok(!src.includes('ROLE_PERMISSION_PRESETS'));
  }
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed ? 1 : 0);
