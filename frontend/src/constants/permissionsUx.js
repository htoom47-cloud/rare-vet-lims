/**
 * Phase 18 — Permissions UX metadata (frontend only).
 * Does not change backend permission codes or authorization logic.
 */

/** UX group ids — display order (sensitive is a flag/filter, not a group) */
export const PERMISSION_UX_GROUPS = [
  'reception',
  'customers_animals',
  'samples',
  'results',
  'reports',
  'billing',
  'devices',
  'portal',
  'reference_ranges',
  'quality',
  'system',
  'trash',
];

export const PERMISSION_UX_GROUP_FILTER_OPTIONS = [
  ...PERMISSION_UX_GROUPS,
  'sensitive',
];

/** Map each permission code → UX group id */
export const CODE_TO_UX_GROUP = {
  'dashboard.view': 'reception',
  'dashboard.admin': 'system',

  'customers.view': 'customers_animals',
  'customers.create': 'customers_animals',
  'customers.update': 'customers_animals',
  'customers.delete': 'customers_animals',

  'animals.view': 'customers_animals',
  'animals.create': 'customers_animals',
  'animals.update': 'customers_animals',
  'animals.delete': 'customers_animals',

  'samples.view': 'samples',
  'samples.create': 'samples',
  'samples.update': 'samples',
  'samples.delete': 'samples',
  'samples.assign': 'samples',

  'sample_tests.remove': 'samples',
  'sample_tests.cancel': 'samples',
  'sample_tests.reactivate': 'samples',

  'tests.view': 'system',
  'tests.manage': 'system',
  'price_list.view': 'billing',

  'results.view': 'results',
  'results.enter': 'results',
  'results.edit': 'results',
  'results.validate': 'results',
  'results.unvalidate': 'results',
  'results.upload_images': 'results',

  'reports.view': 'reports',
  'reports.generate': 'reports',

  'notifications.send_report': 'portal',

  'billing.view': 'billing',
  'billing.create': 'billing',
  'billing.payment': 'billing',
  'billing.refund': 'billing',
  'billing.cancel': 'billing',
  'billing.day_close': 'billing',
  'billing.day_reopen': 'billing',

  'inventory.view': 'quality',
  'inventory.manage': 'quality',

  'quality.view': 'quality',
  'quality.manage': 'quality',

  'settings.view': 'system',
  'settings.manage': 'system',

  'audit.view': 'system',

  'devices.view': 'devices',
  'devices.manage': 'devices',

  'users.view': 'system',
  'users.create': 'system',
  'users.update': 'system',
  'users.delete': 'system',

  'reference_ranges.manage': 'reference_ranges',

  'data.trash.view': 'trash',
  'data.trash.manage': 'trash',
};

/** High-risk permissions — warning on enable */
export const SENSITIVE_PERMISSION_CODES = new Set([
  'users.view',
  'users.create',
  'users.update',
  'users.delete',
  'customers.delete',
  'animals.delete',
  'samples.delete',
  'sample_tests.remove',
  'sample_tests.cancel',
  'results.enter',
  'results.edit',
  'results.unvalidate',
  'reports.generate',
  'notifications.send_report',
  'reference_ranges.manage',
  'billing.refund',
  'billing.cancel',
  'billing.day_reopen',
  'settings.manage',
  'tests.manage',
  'devices.manage',
  'quality.manage',
  'inventory.manage',
  'data.trash.manage',
  'dashboard.admin',
]);

/**
 * Role presets — mirrors backend ROLE_PERMISSIONS defaults.
 * Applying a preset only updates the editor; save is explicit.
 */
export const ROLE_PERMISSION_PRESETS = {
  reception: [
    'dashboard.view',
    'customers.view', 'customers.create', 'customers.update',
    'animals.view', 'animals.create', 'animals.update',
    'samples.view', 'samples.create', 'samples.update',
    'sample_tests.remove',
    'tests.view', 'price_list.view',
    'results.upload_images',
    'reports.view', 'reports.generate',
    'notifications.send_report',
    'billing.view', 'billing.create',
  ],
  lab_technician: [
    'dashboard.view',
    'samples.view', 'samples.update', 'samples.assign',
    'sample_tests.cancel',
    'tests.view',
    'results.view', 'results.enter', 'results.edit', 'results.upload_images',
    'inventory.view',
    'quality.view', 'quality.manage',
  ],
  veterinarian: [
    'dashboard.view',
    'customers.view',
    'animals.view',
    'samples.view',
    'tests.view',
    'results.view', 'results.validate', 'results.edit', 'results.unvalidate',
    'reports.view', 'reports.generate',
    'reference_ranges.manage',
  ],
  accountant: [
    'dashboard.view', 'dashboard.admin',
    'customers.view',
    'billing.view', 'billing.create', 'billing.payment', 'billing.refund',
    'billing.day_close',
    'price_list.view',
    'reports.view',
    'audit.view',
  ],
  lab_specialist: [
    'dashboard.view',
    'samples.view',
    'tests.view',
    'results.view', 'results.validate', 'results.edit', 'results.unvalidate',
    'reports.view', 'reports.generate',
    'quality.view',
  ],
  manager: [
    'dashboard.view', 'dashboard.admin',
    'customers.view', 'customers.create', 'customers.update',
    'animals.view', 'animals.create', 'animals.update',
    'samples.view', 'samples.create', 'samples.update', 'samples.assign',
    'sample_tests.remove', 'sample_tests.cancel', 'sample_tests.reactivate',
    'tests.view', 'tests.manage',
    'price_list.view',
    'results.view', 'results.validate', 'results.edit', 'results.unvalidate',
    'reports.view', 'reports.generate',
    'notifications.send_report',
    'billing.view', 'billing.create', 'billing.payment',
    'billing.refund', 'billing.cancel', 'billing.day_close', 'billing.day_reopen',
    'inventory.view', 'inventory.manage',
    'quality.view', 'quality.manage',
    'settings.view',
    'audit.view',
    'devices.view', 'devices.manage',
    'reference_ranges.manage',
    'data.trash.view', 'data.trash.manage',
  ],
  admin: null, // locked — all permissions
};

export const PRESET_ORDER = [
  'reception',
  'lab_technician',
  'veterinarian',
  'accountant',
  'lab_specialist',
  'manager',
  'admin',
];

export const uxGroupForCode = (code) => CODE_TO_UX_GROUP[code] || 'system';

export const isSensitivePermission = (code) => SENSITIVE_PERMISSION_CODES.has(code);
