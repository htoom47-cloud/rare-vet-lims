const { query } = require('../config/database');

let suppliersPresent = false;

const resetSuppliersSchemaCache = () => {
  suppliersPresent = false;
};

const asQuery = (executor) => {
  if (!executor) return query;
  if (typeof executor.query === 'function') return executor.query.bind(executor);
  return query;
};

const suppliersTableExists = async (executor) => {
  if (suppliersPresent) return true;
  const result = await asQuery(executor)(`SELECT to_regclass('public.suppliers') AS reg`);
  suppliersPresent = Boolean(result.rows[0]?.reg);
  return suppliersPresent;
};

module.exports = {
  suppliersTableExists,
  resetSuppliersSchemaCache,
};
