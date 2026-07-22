const env = require('../config/env');
const { isCriticalFlagsDisabled } = require('./critical-flags');

/** Operational feature flags exposed to staff UI (all default off in production). */
const getStaffFeatures = () => ({
  requireInvoiceBeforeBarcode: !!env.features?.requireInvoiceBeforeBarcode,
  requireLabHandover: !!env.features?.requireLabHandover,
  lockApprovedReports: !!env.features?.lockApprovedReports,
  softDeleteEnabled: !!env.softDelete?.enabled,
  softDeleteRetentionHours: env.softDelete?.retentionHours ?? 48,
  /** When true: critical rates/alerts suppressed; HIGH/LOW from Min/Max remain */
  disableCriticalFlags: isCriticalFlagsDisabled(),
  /** When true: ELISA entry/report uses S/P% + Pos/Neg + text reference layout */
  elisaSpecialEntry: !!env.features?.elisaSpecialEntry,
  /** When true: Customers profile may skip/cancel pending report notifications */
  skipReadyReports: !!env.features?.skipReadyReports,
});

module.exports = { getStaffFeatures };
