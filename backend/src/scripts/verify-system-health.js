/**
 * Second-pass system health checks — modules, permissions, route wiring.
 * Usage: node src/scripts/verify-system-health.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${label}: ${err.message}`);
  }
}

console.log('\n=== Pass 2: Module load ===');
const modules = [
  '../app',
  '../services/results.service',
  '../services/reports.service',
  '../services/portal.service',
  '../services/device-import.service',
  '../config/storage',
  '../utils/permissions',
];
for (const mod of modules) {
  check(`require ${mod}`, () => {
    require(path.join(__dirname, mod));
  });
}

console.log('\n=== Pass 2: Permissions consistency ===');
const { PERMISSIONS, ROLE_PERMISSIONS } = require('../utils/permissions');
check('lab_technician lacks results.unvalidate', () => {
  assert(!ROLE_PERMISSIONS.lab_technician.includes(PERMISSIONS.RESULTS_UNVALIDATE));
});
check('lab_technician lacks results.validate', () => {
  assert(!ROLE_PERMISSIONS.lab_technician.includes(PERMISSIONS.RESULTS_VALIDATE));
});
check('reception can send reports', () => {
  assert(ROLE_PERMISSIONS.reception.includes(PERMISSIONS.NOTIFICATIONS_SEND_REPORT));
});

console.log('\n=== Pass 2: Route files exist ===');
const routeDir = path.join(__dirname, '../routes');
for (const name of fs.readdirSync(routeDir)) {
  if (!name.endsWith('.routes.js')) continue;
  check(`routes/${name}`, () => {
    require(path.join(routeDir, name));
  });
}

console.log('\n=== Pass 2: Dead API cleanup ===');
const apiJs = fs.readFileSync(
  path.join(__dirname, '../../../frontend/src/services/api.js'),
  'utf8'
);
check('reportsAPI.interpret removed from frontend', () => {
  assert(!apiJs.includes('/reports/interpret/'));
});

console.log('\n=== Pass 2: Upload protection ===');
const storageJs = fs.readFileSync(path.join(__dirname, '../config/storage.js'), 'utf8');
check('protected upload prefixes defined', () => {
  assert(storageJs.includes('PROTECTED_UPLOAD_PREFIXES'));
  assert(storageJs.includes('reports/'));
  assert(storageJs.includes('microscope/'));
});

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
