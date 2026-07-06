const env = require('../config/env');

/** Operational feature flags exposed to staff UI (all default off in production). */
const getStaffFeatures = () => ({
  requireInvoiceBeforeBarcode: !!env.features?.requireInvoiceBeforeBarcode,
  requireLabHandover: !!env.features?.requireLabHandover,
  lockApprovedReports: !!env.features?.lockApprovedReports,
  softDeleteEnabled: !!env.softDelete?.enabled,
  softDeleteRetentionHours: env.softDelete?.retentionHours ?? 48,
});

module.exports = { getStaffFeatures };
