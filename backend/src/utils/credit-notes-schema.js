const { query } = require('../config/database');

let creditNotesPresent = false;

const resetCreditNotesSchemaCache = () => {
  creditNotesPresent = false;
};

const asQuery = (executor) => {
  if (!executor) return query;
  if (typeof executor.query === 'function') return executor.query.bind(executor);
  return query;
};

/** Catalog lookup — does not throw 42P01 if the table is missing. Safe inside a transaction. */
const creditNotesTableExists = async (executor) => {
  if (creditNotesPresent) return true;
  const result = await asQuery(executor)(`SELECT to_regclass('public.credit_notes') AS reg`);
  creditNotesPresent = Boolean(result.rows[0]?.reg);
  return creditNotesPresent;
};

const ISSUED_CREDITS_JOIN = `
  LEFT JOIN (
    SELECT invoice_id,
           SUM(total) AS credited,
           SUM(tax_amount) AS credited_tax,
           SUM(subtotal) AS credited_subtotal
    FROM credit_notes
    WHERE status = 'issued'
    GROUP BY invoice_id
  ) cn ON cn.invoice_id = i.id
`;

const remainingDueSql = (withCredits) => (
  withCredits
    ? 'GREATEST(i.total - COALESCE(p.paid, 0) - COALESCE(cn.credited, 0), 0)'
    : 'GREATEST(i.total - COALESCE(p.paid, 0), 0)'
);

module.exports = {
  creditNotesTableExists,
  resetCreditNotesSchemaCache,
  ISSUED_CREDITS_JOIN,
  remainingDueSql,
};
