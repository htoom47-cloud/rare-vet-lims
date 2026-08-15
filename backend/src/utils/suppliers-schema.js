const db = require('../config/database');

let cachedPublic = null;

const resetSuppliersSchemaCache = () => {
  cachedPublic = null;
};

const asQuery = (executor) => {
  if (executor && typeof executor.query === 'function') return executor.query.bind(executor);
  return db.query;
};

const inspectSuppliersCapabilities = async (executor) => {
  const result = await asQuery(executor)(`
    SELECT
      current_schema() AS schema_name,
      to_regclass('suppliers') IS NOT NULL AS table_exists,
      EXISTS (
        SELECT 1
        FROM information_schema.columns c
        WHERE c.table_schema = current_schema()
          AND c.table_name = 'suppliers'
          AND c.column_name = 'is_temporary'
      ) AS has_is_temporary,
      EXISTS (
        SELECT 1
        FROM information_schema.columns c
        WHERE c.table_schema = current_schema()
          AND c.table_name = 'suppliers'
          AND c.column_name = 'is_system'
      ) AS has_is_system,
      to_regclass('purchase_invoices') IS NOT NULL AS purchases_table
  `);
  const row = result.rows[0] || {};
  const hasPurchaseColumns = Boolean(row.has_is_temporary && row.has_is_system);
  return {
    schemaName: row.schema_name || null,
    tableExists: Boolean(row.table_exists),
    hasIsTemporary: Boolean(row.has_is_temporary),
    hasIsSystem: Boolean(row.has_is_system),
    hasPurchaseColumns,
    purchasesTable: Boolean(row.purchases_table),
    purchasesReady: hasPurchaseColumns && Boolean(row.purchases_table),
  };
};

const getSuppliersCapabilities = async (executor) => {
  if (executor) return inspectSuppliersCapabilities(executor);
  if (cachedPublic) return cachedPublic;

  let client;
  try {
    client = await db.getClient();
    const caps = await inspectSuppliersCapabilities(client);
    if (caps.schemaName === 'public') cachedPublic = caps;
    return caps;
  } catch (err) {
    if (!client) {
      return {
        schemaName: null,
        tableExists: false,
        hasIsTemporary: false,
        hasIsSystem: false,
        hasPurchaseColumns: false,
        purchasesTable: false,
        purchasesReady: false,
      };
    }
    throw err;
  } finally {
    if (client) client.release();
  }
};

const suppliersTableExists = async (executor) => {
  const caps = await getSuppliersCapabilities(executor);
  return caps.tableExists;
};

module.exports = {
  suppliersTableExists,
  getSuppliersCapabilities,
  resetSuppliersSchemaCache,
};
