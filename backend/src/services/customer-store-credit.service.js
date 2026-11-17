/**
 * Customer store credit (prepaid liability) — deposit + manual apply.
 * Does not alter AR account_balance meaning. Feature-flagged.
 */
const { query, getClient } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const env = require('../config/env');
const { uuidv4 } = require('../utils/uuid');
const { toHalalas, fromHalalas } = require('../utils/money');
const { labDay } = require('../utils/accounting-time');
const { assertDayOpen } = require('./daily-closing.service');
const ledger = require('./ledger.service');
const { logBillingAudit } = require('../utils/billing-audit');
const { notDeleted } = require('../utils/soft-delete-sql');

const DEPOSIT_METHODS = new Set(['cash', 'card', 'bank_transfer', 'tamara']);

const assertEnabled = () => {
  if (!env.features?.storeCredit) {
    throw new AppError('Customer store credit is disabled', 403, 'STORE_CREDIT_DISABLED');
  }
};

const getBalanceHalalas = async (customerId, client = null) => {
  const q = client ? client.query.bind(client) : query;
  const result = await q(
    `SELECT store_credit_balance FROM customers WHERE id = $1 AND ${notDeleted()} FOR UPDATE`,
    [customerId]
  );
  if (!result.rows[0]) throw new AppError('Customer not found', 404, 'NOT_FOUND');
  return toHalalas(result.rows[0].store_credit_balance);
};

const getBalance = async (customerId) => {
  assertEnabled();
  const result = await query(
    `SELECT store_credit_balance FROM customers WHERE id = $1 AND ${notDeleted()}`,
    [customerId]
  );
  if (!result.rows[0]) throw new AppError('Customer not found', 404, 'NOT_FOUND');
  return {
    customer_id: customerId,
    store_credit_balance: parseFloat(result.rows[0].store_credit_balance || 0),
  };
};

const listEntries = async (customerId, { limit = 50 } = {}) => {
  assertEnabled();
  const customer = await query(
    `SELECT id FROM customers WHERE id = $1 AND ${notDeleted()}`,
    [customerId]
  );
  if (!customer.rows[0]) throw new AppError('Customer not found', 404, 'NOT_FOUND');

  const cap = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const result = await query(
    `SELECT e.*, u.full_name AS created_by_name, i.invoice_number
     FROM customer_store_credit_entries e
     LEFT JOIN users u ON e.created_by = u.id
     LEFT JOIN invoices i ON e.invoice_id = i.id
     WHERE e.customer_id = $1
     ORDER BY e.created_at DESC
     LIMIT $2`,
    [customerId, cap]
  );
  return result.rows;
};

/**
 * Manual deposit: cash/bank in → liability 2200. Increases store_credit_balance.
 */
const deposit = async (customerId, data, userId, req = null) => {
  assertEnabled();
  const amountHalalas = toHalalas(data.amount);
  if (amountHalalas <= 0) {
    throw new AppError('Invalid store credit amount', 400, 'INVALID_AMOUNT');
  }
  const method = String(data.method || '').trim();
  if (!DEPOSIT_METHODS.has(method)) {
    throw new AppError('Invalid deposit payment method', 400, 'INVALID_METHOD');
  }
  const notes = String(data.notes || '').trim();
  if (notes.length < 3) {
    throw new AppError('Notes are required (at least 3 characters)', 400, 'NOTES_REQUIRED');
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    await assertDayOpen(labDay(), client);

    const existingH = await getBalanceHalalas(customerId, client);
    const nextH = existingH + amountHalalas;
    const amount = fromHalalas(amountHalalas);

    const entryId = uuidv4();
    const insert = await client.query(
      `INSERT INTO customer_store_credit_entries
         (id, customer_id, entry_type, amount, method, notes, created_by)
       VALUES ($1,$2,'deposit',$3,$4,$5,$6)
       RETURNING *`,
      [entryId, customerId, amount, method, notes, userId]
    );
    const entry = insert.rows[0];

    await client.query(
      `UPDATE customers
       SET store_credit_balance = $1, updated_at = NOW()
       WHERE id = $2`,
      [fromHalalas(nextH), customerId]
    );

    await ledger.postStoreCreditDeposit(entry, userId, client);

    await logBillingAudit({
      userId,
      action: 'store_credit_deposit',
      entityType: 'customer_store_credit',
      entityId: entry.id,
      newValues: {
        customer_id: customerId,
        amount,
        method,
        balance_after: fromHalalas(nextH),
        notes,
      },
      req,
      client,
      required: true,
    });

    await client.query('COMMIT');
    return {
      entry,
      store_credit_balance: fromHalalas(nextH),
    };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Apply store credit as part of recordPayment (same transaction client).
 * Decrements balance and writes apply entry. Caller posts journal + payment row.
 */
const applyOnPayment = async (client, {
  customerId,
  amountHalalas,
  invoiceId,
  paymentId,
  userId,
}) => {
  assertEnabled();
  if (amountHalalas <= 0) {
    throw new AppError('Invalid store credit amount', 400, 'INVALID_AMOUNT');
  }
  const existingH = await getBalanceHalalas(customerId, client);
  if (amountHalalas > existingH) {
    throw new AppError('Store credit balance is insufficient', 400, 'INSUFFICIENT_STORE_CREDIT');
  }
  const nextH = existingH - amountHalalas;
  const amount = fromHalalas(amountHalalas);

  const insert = await client.query(
    `INSERT INTO customer_store_credit_entries
       (id, customer_id, entry_type, amount, method, invoice_id, payment_id, notes, created_by)
     VALUES ($1,$2,'apply',$3,'store_credit',$4,$5,$6,$7)
     RETURNING *`,
    [
      uuidv4(),
      customerId,
      amount,
      invoiceId,
      paymentId,
      `Applied to invoice ${invoiceId}`,
      userId,
    ]
  );

  await client.query(
    `UPDATE customers
     SET store_credit_balance = $1, updated_at = NOW()
     WHERE id = $2`,
    [fromHalalas(nextH), customerId]
  );

  return {
    entry: insert.rows[0],
    store_credit_balance: fromHalalas(nextH),
  };
};

module.exports = {
  assertEnabled,
  getBalance,
  listEntries,
  deposit,
  applyOnPayment,
  DEPOSIT_METHODS,
};
