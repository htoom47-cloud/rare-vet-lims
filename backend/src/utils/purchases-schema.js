const { getSuppliersCapabilities, resetSuppliersSchemaCache } = require('./suppliers-schema');
const { AppError } = require('../middleware/errorHandler');

const resetPurchasesSchemaCache = () => {
  resetSuppliersSchemaCache();
};

const getPurchasesCapabilities = async (executor) => getSuppliersCapabilities(executor);

const purchasesTableExists = async (executor) => {
  const caps = await getPurchasesCapabilities(executor);
  return caps.purchasesTable;
};

const assertPurchasesReady = async (executor) => {
  const caps = await getPurchasesCapabilities(executor);
  if (!caps.purchasesReady) {
    throw new AppError(
      'Purchase invoices require the proposed migration',
      503,
      'PURCHASES_MIGRATION_REQUIRED'
    );
  }
  return caps;
};

module.exports = {
  purchasesTableExists,
  getPurchasesCapabilities,
  assertPurchasesReady,
  resetPurchasesSchemaCache,
};
