const db = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const purchases = require('./purchases.service');
const ledger = require('./ledger.service');
const dailyClosing = require('./daily-closing.service');
const purchasesAudit = require('../utils/purchases-audit');
const { assertPurchasesReady } = require('../utils/purchases-schema');
const { labDay } = require('../utils/accounting-time');
const { asIntegerHalalas } = require('../utils/money');
const {
  PURCHASE_LEDGER_ACCOUNTS,
  SALES_VAT_PAYABLE_CODE,
  creditAccountCode,
  buildPurchaseJournalLines,
  postingPreview,
} = require('../utils/purchase-posting');

const TABLE_MISSING = '42P01';
const UNIQUE_VIOLATION = '23505';

const actorIdOf = (actor) => (typeof actor === 'string' ? actor : actor?.id || null);

const pickOptions = (...candidates) => {
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const candidate = candidates[i];
    if (candidate && typeof candidate === 'object' && candidate.client) return candidate;
  }
  return {};
};

const requestOf = (reqOrOptions, options) => {
  if (reqOrOptions && typeof reqOrOptions.get === 'function') return reqOrOptions;
  return options.req || null;
};

const throwIfTableMissing = (err) => {
  if (err && err.code === TABLE_MISSING) {
    throw new AppError('Purchase posting is not available', 503, 'PURCHASES_POSTING_MIGRATION_REQUIRED');
  }
};

const assertPerm = (actor, code) => {
  if (!actor || typeof actor === 'string') return;
  if (actor.role_name === 'admin') return;
  if (!Array.isArray(actor.permissions)) return;
  if (!actor.permissions.includes(code)) {
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
  }
};

const postingColumnsReady = async (client) => {
  const exec = client || db;
  const dest = await exec.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = ANY (current_schemas(false))
       AND table_name = 'purchase_invoice_items'
       AND column_name = 'destination'
     LIMIT 1`
  );
  const lots = await exec.query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = ANY (current_schemas(false))
       AND table_name = 'inventory_lots'
     LIMIT 1`
  );
  return Boolean(dest.rows[0] && lots.rows[0]);
};

const assertPostingReady = async (client) => {
  await assertPurchasesReady(client);
  if (!(await postingColumnsReady(client))) {
    throw new AppError(
      'Purchase posting requires the proposed posting migration',
      503,
      'PURCHASES_POSTING_MIGRATION_REQUIRED'
    );
  }
};

const loadRawItems = async (client, id) => {
  const { rows } = await client.query(
    `SELECT i.*,
            inv.sku AS inventory_sku,
            inv.name AS inventory_name,
            inv.name_ar AS inventory_name_ar,
            inv.is_active AS inventory_is_active,
            acc.code AS expense_account_code,
            acc.name AS expense_account_name,
            acc.type AS expense_account_type,
            acc.is_active AS expense_account_is_active
     FROM purchase_invoice_items i
     LEFT JOIN inventory_items inv ON inv.id = i.inventory_item_id
     LEFT JOIN ledger_accounts acc ON acc.id = i.expense_account_id
     WHERE i.purchase_invoice_id = $1
     ORDER BY i.line_no`,
    [id]
  );
  return rows;
};

const timestampsOf = (row) => ({
  stock: row.stock_applied_at || null,
  ledger: row.ledger_posted_at || null,
});

const assertConsistentTimestamps = (row) => {
  const { stock, ledger: posted } = timestampsOf(row);
  if (Boolean(stock) !== Boolean(posted)) {
    throw new AppError(
      'Purchase posting timestamps are inconsistent. Stock and ledger must be applied together.',
      409,
      'PURCHASE_POSTING_INCONSISTENT'
    );
  }
};

const validateLinesForPost = (items) => {
  if (!items.length) {
    throw new AppError('Purchase invoice has no lines', 400, 'PURCHASE_LINES_REQUIRED');
  }
  for (const item of items) {
    const qty = Number(item.quantity);
    if (!(qty > 0)) {
      throw new AppError('Purchase line quantity must be greater than zero', 400, 'PURCHASE_QTY_ZERO');
    }
    if (!item.destination) {
      throw new AppError('Every purchase line must be linked before posting', 400, 'PURCHASE_LINE_UNLINKED');
    }
    if (item.destination === 'inventory') {
      if (!item.inventory_item_id) {
        throw new AppError('Inventory lines require an inventory item', 400, 'INVENTORY_ITEM_REQUIRED');
      }
      if (item.inventory_is_active === false || item.inventory_sku == null) {
        throw new AppError('Inventory item is missing or inactive', 400, 'INVENTORY_ITEM_INACTIVE');
      }
    } else if (item.destination === 'expense') {
      if (!item.expense_account_id) {
        throw new AppError('Expense lines require an expense account', 400, 'EXPENSE_ACCOUNT_REQUIRED');
      }
      if (item.expense_account_type !== 'expense' || item.expense_account_is_active === false) {
        throw new AppError('Expense account must be an active expense account', 400, 'EXPENSE_ACCOUNT_INVALID');
      }
      if (item.expense_account_code === SALES_VAT_PAYABLE_CODE) {
        throw new AppError('Sales VAT payable cannot be used as an expense account', 400, 'EXPENSE_ACCOUNT_INVALID');
      }
    } else {
      throw new AppError('Unknown purchase line destination', 400, 'PURCHASE_DESTINATION_INVALID');
    }
  }
};

const qtyToMilli = (value) => {
  const text = String(value ?? '').trim();
  const match = text.match(/^(\d+)(?:\.(\d{1,3}))?$/);
  if (!match) {
    throw new AppError('Purchase line quantity must be greater than zero', 400, 'PURCHASE_QTY_ZERO');
  }
  const whole = Number.parseInt(match[1], 10);
  const frac = Number.parseInt((match[2] || '').padEnd(3, '0') || '0', 10);
  const milli = whole * 1000 + frac;
  if (milli <= 0) {
    throw new AppError('Purchase line quantity must be greater than zero', 400, 'PURCHASE_QTY_ZERO');
  }
  return milli;
};

const milliToQty = (milli) => `${Math.trunc(milli / 1000)}.${String(milli % 1000).padStart(3, '0')}`;

const WEIGHTED_AVG_COST_SQL = `
  cost_per_unit = CASE
    WHEN $2::numeric = 0 THEN cost_per_unit
    WHEN (quantity + $2::numeric) = 0 THEN cost_per_unit
    ELSE ROUND(
      (
        (COALESCE(quantity, 0) * COALESCE(cost_per_unit, 0))
        + ($3::numeric / 100)
      ) / NULLIF(quantity + $2::numeric, 0)
    , 2)
  END
`;

const findLabeledLot = async (client, itemId, lotNumber, expiry) => {
  const found = await client.query(
    `SELECT id FROM inventory_lots
     WHERE inventory_item_id = $1
       AND unlabeled = false
       AND lower(btrim(lot_number)) = lower(btrim($2))
       AND expiry_date IS NOT DISTINCT FROM $3::date
     ORDER BY id
     FOR UPDATE`,
    [itemId, lotNumber, expiry]
  );
  return found.rows[0]?.id || null;
};

const lockLot = async (client, lotId) => {
  await client.query('SELECT id FROM inventory_lots WHERE id = $1 FOR UPDATE', [lotId]);
};

const createLot = async (client, itemId, lotNumber, expiry, unlabeled) => {
  const inserted = await client.query(
    `INSERT INTO inventory_lots (
       inventory_item_id, lot_number, expiry_date, quantity, cost_per_unit, unlabeled
     ) VALUES ($1, $2, $3, 0, 0, $4)
     RETURNING id`,
    [itemId, unlabeled ? null : lotNumber, expiry, unlabeled]
  );
  const lotId = inserted.rows[0].id;
  await lockLot(client, lotId);
  return lotId;
};

const resolveLabeledLotId = async (client, itemId, lotNumber, expiry) => {
  const existing = await findLabeledLot(client, itemId, lotNumber, expiry);
  if (existing) return existing;
  await client.query('SAVEPOINT labeled_lot_insert');
  try {
    const lotId = await createLot(client, itemId, lotNumber, expiry, false);
    await client.query('RELEASE SAVEPOINT labeled_lot_insert');
    return lotId;
  } catch (err) {
    await client.query('ROLLBACK TO SAVEPOINT labeled_lot_insert');
    await client.query('RELEASE SAVEPOINT labeled_lot_insert');
    if (err.code !== UNIQUE_VIOLATION) throw err;
    const raced = await findLabeledLot(client, itemId, lotNumber, expiry);
    if (!raced) throw err;
    return raced;
  }
};

const assertLotsWithinItem = async (client, itemId) => {
  const { rows } = await client.query(
    `SELECT 1
     FROM inventory_items i
     WHERE i.id = $1
       AND COALESCE((
         SELECT SUM(l.quantity) FROM inventory_lots l WHERE l.inventory_item_id = i.id
       ), 0) > i.quantity`,
    [itemId]
  );
  if (rows[0]) {
    throw new AppError('Lot quantities exceed item quantity', 409, 'LOTS_EXCEED_ITEM');
  }
};

const applyInventoryReceipts = async (client, invoice, items, userId) => {
  const inventoryLines = items
    .filter((item) => item.destination === 'inventory')
    .sort((a, b) => String(a.inventory_item_id).localeCompare(String(b.inventory_item_id))
      || String(a.lot_number || '').localeCompare(String(b.lot_number || ''))
      || String(a.id).localeCompare(String(b.id)));
  const itemIds = [...new Set(inventoryLines.map((item) => item.inventory_item_id))];
  if (!itemIds.length) return [];

  await client.query(
    `SELECT id FROM inventory_items WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
    [itemIds]
  );

  const labeledCache = new Map();
  const itemTotals = new Map();
  const lotTotals = new Map();
  const applied = [];

  for (const line of inventoryLines) {
    const qty = String(line.quantity);
    const netHalalas = asIntegerHalalas(line.line_net_halalas || 0);
    const lotNumber = String(line.lot_number || '').trim() || null;
    const expiry = line.expiry_date || null;
    let lotId;
    if (!lotNumber) {
      lotId = await createLot(client, line.inventory_item_id, null, expiry, true);
    } else {
      const cacheKey = `${line.inventory_item_id}|${lotNumber.toLowerCase()}|${expiry || ''}`;
      if (!labeledCache.has(cacheKey)) {
        labeledCache.set(
          cacheKey,
          await resolveLabeledLotId(client, line.inventory_item_id, lotNumber, expiry)
        );
      }
      lotId = labeledCache.get(cacheKey);
    }

    try {
      await client.query(
        `INSERT INTO inventory_lot_receipts (
           lot_id, source_type, source_id, source_line_id, quantity
         ) VALUES ($1, 'purchase_invoice', $2, $3, $4::numeric)`,
        [lotId, invoice.id, line.id, qty]
      );
    } catch (err) {
      if (err.code === UNIQUE_VIOLATION) {
        throw new AppError('This purchase line was already applied to a lot', 409, 'DUPLICATE_LOT_RECEIPT');
      }
      throw err;
    }

    try {
      await client.query(
        `INSERT INTO inventory_transactions (
           item_id, type, quantity, lot_number, expiry_date, lot_id,
           source_type, source_id, source_line_id, notes, performed_by
         ) VALUES ($1, 'in', $2::numeric, $3, $4, $5, 'purchase_invoice', $6, $7, $8, $9)`,
        [
          line.inventory_item_id,
          qty,
          lotNumber,
          expiry,
          lotId,
          invoice.id,
          line.id,
          `Purchase ${invoice.document_number} line ${line.line_no}`,
          userId,
        ]
      );
    } catch (err) {
      if (err.code === UNIQUE_VIOLATION) {
        throw new AppError('This purchase line was already applied to stock', 409, 'DUPLICATE_STOCK_APPLICATION');
      }
      throw err;
    }

    const itemAcc = itemTotals.get(line.inventory_item_id) || { qty: 0, net: 0 };
    itemAcc.qty += qtyToMilli(qty);
    itemAcc.net += netHalalas;
    itemTotals.set(line.inventory_item_id, itemAcc);

    const lotAcc = lotTotals.get(lotId) || { qty: 0, net: 0 };
    lotAcc.qty += qtyToMilli(qty);
    lotAcc.net += netHalalas;
    lotTotals.set(lotId, lotAcc);
    applied.push(line.id);
  }

  for (const [lotId, acc] of lotTotals.entries()) {
    await client.query(
      `UPDATE inventory_lots SET
         quantity = quantity + $2::numeric,
         ${WEIGHTED_AVG_COST_SQL},
         updated_at = NOW()
       WHERE id = $1`,
      [lotId, milliToQty(acc.qty), String(acc.net)]
    );
  }

  for (const itemId of itemIds) {
    const acc = itemTotals.get(itemId);
    if (!acc) continue;
    // Never write lot_number or expiry_date onto inventory_items.
    await client.query(
      `UPDATE inventory_items SET
         quantity = quantity + $2::numeric,
         ${WEIGHTED_AVG_COST_SQL},
         updated_at = NOW()
       WHERE id = $1`,
      [itemId, milliToQty(acc.qty), String(acc.net)]
    );
    await assertLotsWithinItem(client, itemId);
  }
  return applied;
};

const listExpenseAccounts = async (actor, options = {}) => {
  assertPerm(actor, 'purchases.view');
  const exec = options.client || db;
  await ledger.ensureAccountsSeeded(options.client);
  const { rows } = await exec.query(
    `SELECT id, code, name, name_ar, type, COALESCE(is_active, true) AS is_active
     FROM ledger_accounts
     WHERE type = 'expense' AND COALESCE(is_active, true) = true
     ORDER BY code`
  );
  return rows.filter((row) => row.code !== SALES_VAT_PAYABLE_CODE);
};

const listLinkableInventory = async (actor, query = {}, options = {}) => {
  assertPerm(actor, 'purchases.view');
  const exec = options.client || db;
  const term = `%${String(query.search || query.q || '').trim()}%`;
  const { rows } = await exec.query(
    `SELECT id, sku, name, name_ar, unit, quantity, is_active
     FROM inventory_items
     WHERE is_active = true
       AND (
         $1 = '%%'
         OR sku ILIKE $1
         OR name ILIKE $1
         OR COALESCE(name_ar, '') ILIKE $1
       )
     ORDER BY name
     LIMIT 50`,
    [term]
  );
  return rows;
};

const setLineDestinations = async (id, lines, actor, reqOrOptions, maybeOptions) => {
  const options = pickOptions(reqOrOptions, maybeOptions);
  const req = requestOf(reqOrOptions, options);
  if (actor && typeof actor !== 'string') {
    const allowed = actor.role_name === 'admin'
      || (actor.permissions || []).includes('purchases.create')
      || (actor.permissions || []).includes('purchases.post');
    if (!allowed) throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
  }
  await assertPostingReady(options.client);
  try {
    return await purchases.withPurchaseClient(options.client, async (client) => {
      const existing = await purchases.lockInvoice(client, id);
      if (!existing || existing.deleted_at) {
        throw new AppError('Purchase invoice not found', 404, 'NOT_FOUND');
      }
      assertConsistentTimestamps(existing);
      if (existing.status === 'posted' || existing.stock_applied_at || existing.ledger_posted_at) {
        throw new AppError('Posted purchases cannot be relinked', 409, 'PURCHASE_ALREADY_POSTED');
      }
      if (!['draft', 'approved'].includes(existing.status)) {
        throw new AppError('Only draft or approved invoices can be linked', 409, 'INVOICE_LOCKED');
      }

      const current = await loadRawItems(client, id);
      const byId = new Map(current.map((row) => [row.id, row]));
      for (const line of lines || []) {
        const row = byId.get(line.id);
        if (!row) throw new AppError('Purchase line not found', 404, 'LINE_NOT_FOUND');
        const destination = line.destination || null;
        let inventoryItemId = null;
        let expenseAccountId = null;
        let lotNumber = line.lot_number || null;
        let expiryDate = line.expiry_date || null;
        if (destination === 'inventory') {
          inventoryItemId = line.inventory_item_id || null;
          if (!inventoryItemId) {
            throw new AppError('Inventory lines require an inventory item', 400, 'INVENTORY_ITEM_REQUIRED');
          }
          const item = await client.query(
            'SELECT id, is_active FROM inventory_items WHERE id = $1',
            [inventoryItemId]
          );
          if (!item.rows[0] || item.rows[0].is_active === false) {
            throw new AppError('Inventory item is missing or inactive', 400, 'INVENTORY_ITEM_INACTIVE');
          }
        } else if (destination === 'expense') {
          expenseAccountId = line.expense_account_id || null;
          lotNumber = null;
          expiryDate = null;
          if (!expenseAccountId) {
            throw new AppError('Expense lines require an expense account', 400, 'EXPENSE_ACCOUNT_REQUIRED');
          }
          const acc = await client.query(
            `SELECT id, type, code, COALESCE(is_active, true) AS is_active
             FROM ledger_accounts WHERE id = $1`,
            [expenseAccountId]
          );
          if (!acc.rows[0] || acc.rows[0].type !== 'expense' || acc.rows[0].is_active === false) {
            throw new AppError('Expense account must be an active expense account', 400, 'EXPENSE_ACCOUNT_INVALID');
          }
        } else if (destination) {
          throw new AppError('Unknown purchase line destination', 400, 'PURCHASE_DESTINATION_INVALID');
        }
        await client.query(
          `UPDATE purchase_invoice_items
           SET destination = $2,
               inventory_item_id = $3,
               expense_account_id = $4,
               lot_number = $5,
               expiry_date = $6
           WHERE id = $1`,
          [line.id, destination, inventoryItemId, expenseAccountId, lotNumber, expiryDate]
        );
      }
      await client.query('UPDATE purchase_invoices SET updated_at = NOW() WHERE id = $1', [id]);
      const next = await purchases.getById(id, actor, { client });
      await purchasesAudit.logPurchaseAudit(client, {
        userId: actorIdOf(actor),
        action: 'link_purchase_invoice_lines',
        entityId: id,
        oldValues: { status: existing.status },
        newValues: { lines: (next.items || []).map((item) => ({
          id: item.id,
          destination: item.destination,
          inventory_item_id: item.inventory_item_id,
          expense_account_id: item.expense_account_id,
        })) },
        req,
      });
      return next;
    });
  } catch (err) {
    throwIfTableMissing(err);
    throw err;
  }
};

const preview = async (id, actor, options = {}) => {
  assertPerm(actor, 'purchases.view');
  const client = options.client || await db.getClient();
  const own = !options.client;
  try {
    await assertPostingReady(client);
    const { rows } = await client.query('SELECT * FROM purchase_invoices WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (!rows[0]) throw new AppError('Purchase invoice not found', 404, 'NOT_FOUND');
    const items = await loadRawItems(client, id);
    return {
      invoice: purchases.toPublic(rows[0], { items: items.map(purchases.toPublicItem) }),
      preview: postingPreview({
        invoice: rows[0],
        items,
        creditCode: creditAccountCode(rows[0].payment_method),
      }),
    };
  } catch (err) {
    throwIfTableMissing(err);
    throw err;
  } finally {
    if (own) client.release();
  }
};

const post = async (id, actor, reqOrOptions, maybeOptions) => {
  const options = pickOptions(reqOrOptions, maybeOptions);
  const req = requestOf(reqOrOptions, options);
  const body = options.body || reqOrOptions?.body || {};
  assertPerm(actor, 'purchases.post');
  await assertPostingReady(options.client);
  const postingDate = String(body.posting_date || labDay()).slice(0, 10);
  try {
    return await purchases.withPurchaseClient(options.client, async (client) => {
      const existing = await purchases.lockInvoice(client, id);
      if (!existing || existing.deleted_at) {
        throw new AppError('Purchase invoice not found', 404, 'NOT_FOUND');
      }
      if (existing.status === 'cancelled') {
        throw new AppError('Cancelled purchases cannot be posted', 409, 'INVOICE_LOCKED');
      }
      assertConsistentTimestamps(existing);
      if (existing.stock_applied_at && existing.ledger_posted_at) {
        const replayed = await purchases.getById(id, actor, { client });
        return { ...replayed, posting_replayed: true };
      }
      if (existing.status !== 'approved') {
        throw new AppError('Only approved purchases can be posted', 409, 'PURCHASE_NOT_APPROVED');
      }

      await dailyClosing.assertDayOpen(postingDate, client);
      const items = await loadRawItems(client, id);
      validateLinesForPost(items);

      await ledger.ensureAccountsSeeded(client);
      for (const acc of PURCHASE_LEDGER_ACCOUNTS) {
        await client.query(
          `INSERT INTO ledger_accounts (code, name, name_ar, type)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (code) DO NOTHING`,
          [acc.code, acc.name, acc.name_ar, acc.type]
        );
      }

      const inventoryAccountId = await ledger.getAccountId('1200', client);
      const inputVatAccountId = await ledger.getAccountId('1170', client);
      const creditCode = creditAccountCode(existing.payment_method);
      const creditAccountId = await ledger.getAccountId(creditCode, client);
      const accountTypes = await client.query(
        `SELECT id, code, type FROM ledger_accounts WHERE id = ANY($1::uuid[])`,
        [[inventoryAccountId, inputVatAccountId, creditAccountId]]
      );
      const byId = Object.fromEntries(accountTypes.rows.map((row) => [row.id, row]));
      if (byId[inventoryAccountId]?.type !== 'asset' || byId[inventoryAccountId]?.code !== '1200') {
        throw new AppError('Inventory ledger account 1200 is missing or not an asset', 500, 'LEDGER_ACCOUNT_MISSING');
      }
      if (byId[inputVatAccountId]?.type !== 'asset' || byId[inputVatAccountId]?.code !== '1170') {
        throw new AppError('Recoverable input VAT account 1170 is missing or not an asset', 500, 'LEDGER_ACCOUNT_MISSING');
      }
      if (byId[inputVatAccountId]?.code === SALES_VAT_PAYABLE_CODE) {
        throw new AppError('Sales VAT payable cannot be used as input VAT', 500, 'LEDGER_ACCOUNT_MISSING');
      }
      const journalLines = buildPurchaseJournalLines({
        invoice: existing,
        items,
        inventoryAccountId,
        inputVatAccountId,
        creditAccountId,
      });

      await applyInventoryReceipts(client, existing, items, actorIdOf(actor));

      const entryDate = `${postingDate}T09:00:00+03:00`;
      await ledger.createEntry(
        `Purchase ${existing.document_number}`,
        'purchase_invoice',
        existing.id,
        actorIdOf(actor),
        journalLines.map((line) => ({
          accountId: line.accountId,
          debit_halalas: line.debit_halalas,
          credit_halalas: line.credit_halalas,
        })),
        client,
        { entryDate }
      );

      const { rows } = await client.query(
        `UPDATE purchase_invoices SET
           status = 'posted',
           posting_date = $2::date,
           posted_by = $3,
           stock_applied_at = NOW(),
           ledger_posted_at = NOW(),
           updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id, postingDate, actorIdOf(actor)]
      );
      const publicRow = await purchases.getById(id, actor, { client });
      await purchasesAudit.logPurchaseAudit(client, {
        userId: actorIdOf(actor),
        action: 'post_purchase_invoice',
        entityId: id,
        oldValues: purchases.toPublic(existing),
        newValues: publicRow,
        req,
      });
      return publicRow;
    });
  } catch (err) {
    throwIfTableMissing(err);
    throw err;
  }
};

module.exports = {
  listExpenseAccounts,
  listLinkableInventory,
  setLineDestinations,
  preview,
  post,
  validateLinesForPost,
  assertConsistentTimestamps,
};
