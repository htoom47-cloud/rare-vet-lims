const db = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { paginate, buildPagination } = require('../utils/helpers');
const { uuidv4 } = require('../utils/uuid');

const TABLE_MISSING = '42P01';

const execOf = (client) => (client ? client.query.bind(client) : db.query);

const qtyToMilli = (value, { allowZero = false } = {}) => {
  const text = String(value ?? '').trim();
  const match = text.match(/^(\d+)(?:\.(\d{1,3}))?$/);
  if (!match) {
    throw new AppError('Quantity must be greater than zero', 400, 'INVALID_QUANTITY');
  }
  const whole = Number.parseInt(match[1], 10);
  const frac = Number.parseInt((match[2] || '').padEnd(3, '0') || '0', 10);
  const milli = whole * 1000 + frac;
  if (!allowZero && milli <= 0) {
    throw new AppError('Quantity must be greater than zero', 400, 'INVALID_QUANTITY');
  }
  return milli;
};

const milliToQty = (milli) => `${Math.trunc(milli / 1000)}.${String(milli % 1000).padStart(3, '0')}`;

const qtyIsPositive = (value) => {
  const text = String(value ?? '').trim();
  if (!text || text.startsWith('-')) return false;
  const amount = Number(text);
  return Number.isFinite(amount) && amount > 0;
};

const lotsTableReady = async (client) => {
  const { rows } = await execOf(client)(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = ANY (current_schemas(false))
       AND table_name = 'inventory_lots'
     LIMIT 1`
  );
  return Boolean(rows[0]);
};

const LOT_SUM_SQL = `COALESCE((SELECT SUM(l.quantity) FROM inventory_lots l WHERE l.inventory_item_id = i.id), 0)`;
const LEGACY_QTY_SQL = `(i.quantity - ${LOT_SUM_SQL})`;
const EXPIRING_WINDOW_SQL = `<= CURRENT_DATE + INTERVAL '30 days'`;

const assertLegacyNotNegative = async (client, itemId = null) => {
  const sql = itemId
    ? `SELECT i.id FROM inventory_items i WHERE i.id = $1 AND ${LEGACY_QTY_SQL} < 0`
    : `SELECT i.id FROM inventory_items i WHERE ${LEGACY_QTY_SQL} < 0 LIMIT 1`;
  const { rows } = await execOf(client)(sql, itemId ? [itemId] : []);
  if (rows[0]) {
    throw new AppError('Unallocated legacy quantity cannot be negative', 409, 'NEGATIVE_LEGACY_QUANTITY');
  }
};

const presentItem = (row, { lots = [], lotsSupported = false } = {}) => {
  const legacyQuantity = row.legacy_quantity ?? row.legacy_unallocated_quantity ?? 0;
  const showLegacy = qtyIsPositive(legacyQuantity);
  const legacyLotNumber = showLegacy ? (row.legacy_lot_number ?? row.lot_number ?? null) : null;
  const legacyExpiryDate = showLegacy ? (row.legacy_expiry_date ?? row.expiry_date ?? null) : null;
  return {
    ...row,
    lots: (lots || []).filter((lot) => qtyIsPositive(lot.quantity)),
    lots_quantity: row.lots_quantity ?? 0,
    legacy_quantity: legacyQuantity,
    legacy_unallocated_quantity: legacyQuantity,
    show_legacy_fields: showLegacy,
    legacy_lot_number: legacyLotNumber,
    legacy_expiry_date: legacyExpiryDate,
    unallocated_legacy_details: showLegacy
      ? {
        lot_number: legacyLotNumber,
        expiry_date: legacyExpiryDate,
        quantity: legacyQuantity,
        label: 'unallocated_legacy_stock_undetailed',
      }
      : null,
    lots_supported: lotsSupported,
  };
};

const expiringSourceSql = (lotsReady, extraWhere = '') => {
  if (!lotsReady) {
    return `SELECT i.id AS inventory_item_id, i.sku, i.name, i.name_ar, i.unit, i.category,
                   i.lot_number, i.expiry_date, i.quantity,
                   i.quantity AS remaining_quantity, i.quantity AS legacy_quantity,
                   0::numeric AS lots_quantity, NULL::uuid AS lot_id, false AS unlabeled,
                   'legacy'::text AS source,
                   CASE WHEN i.quantity <= i.min_quantity THEN true ELSE false END AS is_low_stock
            FROM inventory_items i
            WHERE i.is_active = true
              AND i.expiry_date IS NOT NULL
              AND i.expiry_date ${EXPIRING_WINDOW_SQL}
              ${extraWhere}`;
  }
  return `SELECT i.id AS inventory_item_id, i.sku, i.name, i.name_ar, i.unit, i.category,
                 l.lot_number, l.expiry_date, l.quantity,
                 l.quantity AS remaining_quantity, ${LEGACY_QTY_SQL} AS legacy_quantity,
                 ${LOT_SUM_SQL} AS lots_quantity, l.id AS lot_id, l.unlabeled,
                 'lot'::text AS source,
                 CASE WHEN i.quantity <= i.min_quantity THEN true ELSE false END AS is_low_stock
          FROM inventory_lots l
          JOIN inventory_items i ON i.id = l.inventory_item_id
          WHERE i.is_active = true
            AND l.quantity > 0
            AND l.expiry_date IS NOT NULL
            AND l.expiry_date ${EXPIRING_WINDOW_SQL}
            ${extraWhere}
          UNION ALL
          SELECT i.id AS inventory_item_id, i.sku, i.name, i.name_ar, i.unit, i.category,
                 i.lot_number, i.expiry_date, ${LEGACY_QTY_SQL} AS quantity,
                 ${LEGACY_QTY_SQL} AS remaining_quantity, ${LEGACY_QTY_SQL} AS legacy_quantity,
                 ${LOT_SUM_SQL} AS lots_quantity, NULL::uuid AS lot_id, false AS unlabeled,
                 'legacy'::text AS source,
                 CASE WHEN i.quantity <= i.min_quantity THEN true ELSE false END AS is_low_stock
          FROM inventory_items i
          WHERE i.is_active = true
            AND i.expiry_date IS NOT NULL
            AND i.expiry_date ${EXPIRING_WINDOW_SQL}
            AND ${LEGACY_QTY_SQL} > 0
            ${extraWhere}`;
};

const presentExpiringRow = (row, lotsSupported) => {
  const isLegacy = row.source === 'legacy';
  return {
    ...row,
    id: row.inventory_item_id,
    inventory_item_id: row.inventory_item_id,
    lots: [],
    lots_supported: lotsSupported,
    show_legacy_fields: isLegacy,
    legacy_quantity: row.legacy_quantity,
    legacy_unallocated_quantity: row.legacy_quantity,
    legacy_lot_number: isLegacy ? (row.lot_number || null) : null,
    legacy_expiry_date: isLegacy ? (row.expiry_date || null) : null,
    unallocated_legacy_details: isLegacy
      ? {
        lot_number: row.lot_number || null,
        expiry_date: row.expiry_date || null,
        quantity: row.remaining_quantity,
        label: 'unallocated_legacy_stock_undetailed',
      }
      : null,
    row_key: `${row.source}:${row.lot_id || row.inventory_item_id}`,
  };
};

const listExpiringBalances = async ({ category, low_stock, page, limit } = {}, client, lotsReady) => {
  const q = execOf(client);
  const { offset, page: p, limit: l } = paginate(page, limit);
  const params = [];
  let extraWhere = '';
  if (category) {
    params.push(category);
    extraWhere += ` AND i.category = $${params.length}`;
  }
  if (low_stock === 'true') extraWhere += ' AND i.quantity <= i.min_quantity';
  const unionSql = expiringSourceSql(lotsReady, extraWhere);
  const countResult = await q(`SELECT COUNT(*)::int AS n FROM (${unionSql}) exp`, params);
  const total = countResult.rows[0].n;
  const queryParams = [...params, l, offset];
  const result = await q(
    `SELECT * FROM (${unionSql}) exp
     ORDER BY expiry_date ASC, sku ASC, source ASC, lot_id ASC NULLS LAST
     LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`,
    queryParams
  );
  return {
    data: result.rows.map((row) => presentExpiringRow(row, lotsReady)),
    pagination: buildPagination(total, p, l),
  };
};

const countExpiringBalances = async (client, lotsReady) => {
  const unionSql = expiringSourceSql(lotsReady, '');
  const { rows } = await execOf(client)(`SELECT COUNT(*)::int AS n FROM (${unionSql}) exp`);
  return rows[0].n;
};

const list = async ({ category, low_stock, expiring, page, limit } = {}, client) => {
  const q = execOf(client);
  const lotsReady = await lotsTableReady(client);
  if (lotsReady) await assertLegacyNotNegative(client);
  if (expiring === 'true') {
    return listExpiringBalances({ category, low_stock, page, limit }, client, lotsReady);
  }

  const { offset, page: p, limit: l } = paginate(page, limit);
  const params = [];
  let where = 'WHERE i.is_active = true';
  if (category) { params.push(category); where += ` AND i.category = $${params.length}`; }
  if (low_stock === 'true') where += ' AND i.quantity <= i.min_quantity';

  const countResult = await q(`SELECT COUNT(*) FROM inventory_items i ${where}`, params);
  const total = parseInt(countResult.rows[0].count, 10);
  params.push(l, offset);

  const selectSql = lotsReady
    ? `SELECT i.*,
            CASE WHEN i.quantity <= i.min_quantity THEN true ELSE false END AS is_low_stock,
            ${LOT_SUM_SQL} AS lots_quantity,
            ${LEGACY_QTY_SQL} AS legacy_quantity,
            (
              SELECT MIN(l.expiry_date) FROM inventory_lots l
              WHERE l.inventory_item_id = i.id AND l.quantity > 0 AND l.expiry_date IS NOT NULL
            ) AS nearest_lot_expiry
       FROM inventory_items i ${where}
       ORDER BY i.name LIMIT $${params.length - 1} OFFSET $${params.length}`
    : `SELECT i.*,
            CASE WHEN i.quantity <= i.min_quantity THEN true ELSE false END AS is_low_stock,
            CASE WHEN i.expiry_date <= CURRENT_DATE THEN true ELSE false END AS is_expired,
            0 AS lots_quantity,
            i.quantity AS legacy_quantity,
            NULL AS nearest_lot_expiry
       FROM inventory_items i ${where}
       ORDER BY i.name LIMIT $${params.length - 1} OFFSET $${params.length}`;

  const result = await q(selectSql, params);
  return {
    data: result.rows.map((row) => presentItem(row, { lotsSupported: lotsReady })),
    pagination: buildPagination(total, p, l),
  };
};

const loadLots = async (id, client) => {
  try {
    const lotRows = await execOf(client)(
      `SELECT id, lot_number, expiry_date, quantity, cost_per_unit, unlabeled, created_at, updated_at
       FROM inventory_lots
       WHERE inventory_item_id = $1
       ORDER BY unlabeled, lot_number, expiry_date, created_at`,
      [id]
    );
    return lotRows.rows;
  } catch (err) {
    if (err.code === TABLE_MISSING) return [];
    throw err;
  }
};

const getById = async (id, client) => {
  const result = await execOf(client)('SELECT * FROM inventory_items WHERE id = $1', [id]);
  if (!result.rows[0]) throw new AppError('Inventory item not found', 404, 'NOT_FOUND');

  const transactions = await execOf(client)(
    'SELECT * FROM inventory_transactions WHERE item_id = $1 ORDER BY created_at DESC LIMIT 20',
    [id]
  );
  const lots = await loadLots(id, client);
  const lotsSupported = await lotsTableReady(client);
  if (lotsSupported) await assertLegacyNotNegative(client, id);
  try {
    const sums = await execOf(client)(
      `SELECT i.quantity AS item_qty,
              ${LOT_SUM_SQL} AS lots_qty,
              ${LEGACY_QTY_SQL} AS legacy_qty
       FROM inventory_items i WHERE i.id = $1`,
      [id]
    );
    return presentItem({
      ...result.rows[0],
      transactions: transactions.rows,
      lots_quantity: sums.rows[0].lots_qty,
      legacy_quantity: sums.rows[0].legacy_qty,
    }, { lots, lotsSupported: true });
  } catch (err) {
    if (err.code !== TABLE_MISSING) throw err;
  }

  return presentItem({
    ...result.rows[0],
    transactions: transactions.rows,
    lots_quantity: 0,
    legacy_quantity: result.rows[0].quantity,
  }, { lots, lotsSupported: false });
};

const getAlerts = async (client) => {
  const q = execOf(client);
  const lowStock = await q(
    'SELECT * FROM inventory_items WHERE is_active = true AND quantity <= min_quantity ORDER BY quantity ASC'
  );
  const lotsReady = await lotsTableReady(client);
  if (lotsReady) await assertLegacyNotNegative(client);
  const expiringTotal = await countExpiringBalances(client, lotsReady);
  return {
    low_stock: lowStock.rows,
    expiring: [],
    expiring_total: expiringTotal,
    expiring_legacy_items: [],
    lots_supported: lotsReady,
    legacy_expiry_undetailed: true,
  };
};

const create = async (data) => {
  const result = await db.query(
    `INSERT INTO inventory_items (sku, name, name_ar, category, unit, quantity, min_quantity, lot_number, expiry_date, location, supplier, cost_per_unit)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [data.sku, data.name, data.name_ar, data.category, data.unit, data.quantity, data.min_quantity, data.lot_number, data.expiry_date, data.location, data.supplier, data.cost_per_unit]
  );
  return result.rows[0];
};

const update = async (id, data, options = {}) => {
  const client = options.client || null;
  const existing = await getById(id, client);
  const lotsReady = existing.lots_supported;
  const showLegacy = existing.show_legacy_fields;
  const lotNumber = lotsReady && !showLegacy
    ? existing.lot_number
    : (data.lot_number ?? existing.lot_number);
  const expiryDate = lotsReady && !showLegacy
    ? existing.expiry_date
    : (data.expiry_date ?? existing.expiry_date);
  await execOf(client)(
    `UPDATE inventory_items SET name=$1, name_ar=$2, category=$3, unit=$4, min_quantity=$5,
     lot_number=$6, expiry_date=$7, location=$8, supplier=$9, cost_per_unit=$10, updated_at=NOW()
     WHERE id=$11 RETURNING *`,
    [
      data.name ?? existing.name,
      data.name_ar ?? existing.name_ar,
      data.category ?? existing.category,
      data.unit ?? existing.unit,
      data.min_quantity ?? existing.min_quantity,
      lotNumber,
      expiryDate,
      data.location ?? existing.location,
      data.supplier ?? existing.supplier,
      data.cost_per_unit ?? existing.cost_per_unit,
      id,
    ]
  );
  return getById(id, client);
};

const logInventoryAudit = async (client, {
  userId,
  action,
  entityId,
  oldValues = null,
  newValues = null,
  req = null,
}) => {
  if (!userId) {
    throw new AppError('Audit actor is required', 500, 'AUDIT_REQUIRED');
  }
  await client.query(
    `INSERT INTO audit_logs (id, user_id, action, module, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
     VALUES ($1, $2, $3, 'inventory', 'inventory_item', $4, $5, $6, $7, $8)`,
    [
      uuidv4(),
      userId,
      action,
      entityId,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      req?.ip || null,
      req?.get?.('user-agent') || null,
    ]
  );
};

const assertLotsWithinItem = async (client, itemId) => {
  await assertLegacyNotNegative(client, itemId);
};

const lockItem = async (client, id) => {
  const { rows } = await client.query(
    'SELECT * FROM inventory_items WHERE id = $1 FOR UPDATE',
    [id]
  );
  if (!rows[0]) throw new AppError('Inventory item not found', 404, 'NOT_FOUND');
  return rows[0];
};

const lockItemLots = async (client, itemId) => {
  const { rows } = await client.query(
    `SELECT id, lot_number, expiry_date, quantity, unlabeled
     FROM inventory_lots
     WHERE inventory_item_id = $1
     ORDER BY id
     FOR UPDATE`,
    [itemId]
  );
  return rows;
};

const insertTxn = async (client, {
  itemId, type, qty, lotNumber, expiry, lotId, notes, userId,
}) => {
  await client.query(
    `INSERT INTO inventory_transactions (
       item_id, type, quantity, lot_number, expiry_date, lot_id, notes, performed_by
     ) VALUES ($1, $2, $3::numeric, $4, $5, $6, $7, $8)`,
    [itemId, type, qty, lotNumber || null, expiry || null, lotId || null, notes || null, userId]
  );
};

const changeItemQty = async (client, itemId, deltaQty, allowNegative) => {
  const { rows } = await client.query(
    `UPDATE inventory_items SET
       quantity = quantity + $2::numeric,
       updated_at = NOW()
     WHERE id = $1
       AND ($3 OR quantity + $2::numeric >= 0)
     RETURNING quantity`,
    [itemId, deltaQty, allowNegative]
  );
  if (!rows[0]) throw new AppError('Insufficient stock', 400, 'INSUFFICIENT_STOCK');
  return rows[0];
};

const decrementLot = async (client, lotId, qty) => {
  const { rows } = await client.query(
    `UPDATE inventory_lots SET
       quantity = quantity - $2::numeric,
       updated_at = NOW()
     WHERE id = $1 AND quantity >= $2::numeric
     RETURNING id, quantity, lot_number, expiry_date`,
    [lotId, qty]
  );
  if (!rows[0]) {
    throw new AppError('Insufficient lot quantity', 400, 'INSUFFICIENT_LOT');
  }
  return rows[0];
};

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
  return found.rows[0] || null;
};

const createLot = async (client, itemId, lotNumber, expiry, unlabeled) => {
  const inserted = await client.query(
    `INSERT INTO inventory_lots (
       inventory_item_id, lot_number, expiry_date, quantity, cost_per_unit, unlabeled
     ) VALUES ($1, $2, $3, 0, 0, $4)
     RETURNING id, lot_number, expiry_date`,
    [itemId, unlabeled ? null : lotNumber, expiry, unlabeled]
  );
  await client.query('SELECT id FROM inventory_lots WHERE id = $1 FOR UPDATE', [inserted.rows[0].id]);
  return inserted.rows[0];
};

const resolveLabeledLot = async (client, itemId, lotNumber, expiry) => {
  const existing = await findLabeledLot(client, itemId, lotNumber, expiry);
  if (existing) return existing;
  await client.query('SAVEPOINT labeled_lot_insert');
  try {
    const created = await createLot(client, itemId, lotNumber, expiry, false);
    await client.query('RELEASE SAVEPOINT labeled_lot_insert');
    return created;
  } catch (err) {
    await client.query('ROLLBACK TO SAVEPOINT labeled_lot_insert');
    await client.query('RELEASE SAVEPOINT labeled_lot_insert');
    if (err.code !== '23505') throw err;
    const raced = await findLabeledLot(client, itemId, lotNumber, expiry);
    if (!raced) throw err;
    return raced;
  }
};

const fefoSort = (lots) => [...lots].sort((a, b) => {
  const aExp = a.expiry_date ? new Date(a.expiry_date).getTime() : null;
  const bExp = b.expiry_date ? new Date(b.expiry_date).getTime() : null;
  if (aExp != null && bExp != null && aExp !== bExp) return aExp - bExp;
  if (aExp != null && bExp == null) return -1;
  if (aExp == null && bExp != null) return 1;
  return String(a.id).localeCompare(String(b.id));
});

const applyOutWithLots = async (client, item, qtyText, extras, userId) => {
  const source = extras.source || null;
  if (!source || !['lot', 'legacy', 'fefo'].includes(source)) {
    throw new AppError('Outbound quantity source is required (lot, fefo, or legacy)', 400, 'SOURCE_REQUIRED');
  }
  const lots = await lockItemLots(client, item.id);
  const { rows: bal } = await client.query(
    `SELECT i.quantity AS item_qty,
            COALESCE((SELECT SUM(l.quantity) FROM inventory_lots l WHERE l.inventory_item_id = i.id), 0) AS lots_qty
     FROM inventory_items i WHERE i.id = $1`,
    [item.id]
  );
  const itemMilli = qtyToMilli(bal[0].item_qty, { allowZero: true });
  const lotsMilli = qtyToMilli(bal[0].lots_qty, { allowZero: true });
  const legacyMilli = itemMilli - lotsMilli;
  const needMilli = qtyToMilli(qtyText);

  if (source === 'lot') {
    if (!extras.lot_id) {
      throw new AppError('A lot is required for this outbound movement', 400, 'LOT_REQUIRED');
    }
    const lot = lots.find((row) => row.id === extras.lot_id);
    if (!lot) throw new AppError('Lot not found for this item', 404, 'LOT_NOT_FOUND');
    await decrementLot(client, lot.id, qtyText);
    await changeItemQty(client, item.id, `-${qtyText}`, false);
    await insertTxn(client, {
      itemId: item.id,
      type: 'out',
      qty: qtyText,
      lotNumber: lot.lot_number,
      expiry: lot.expiry_date,
      lotId: lot.id,
      notes: extras.notes,
      userId,
    });
    return;
  }

  if (source === 'legacy') {
    if (legacyMilli < needMilli) {
      throw new AppError('Insufficient unallocated legacy quantity', 400, 'INSUFFICIENT_LEGACY');
    }
    await changeItemQty(client, item.id, `-${qtyText}`, false);
    await insertTxn(client, {
      itemId: item.id,
      type: 'out',
      qty: qtyText,
      lotNumber: null,
      expiry: null,
      lotId: null,
      notes: extras.notes ? `${extras.notes} [legacy_unallocated]` : 'legacy_unallocated',
      userId,
    });
    return;
  }

  let remaining = needMilli;
  const slices = [];
  for (const lot of fefoSort(lots.filter((row) => qtyToMilli(row.quantity, { allowZero: true }) > 0))) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, qtyToMilli(lot.quantity, { allowZero: true }));
    slices.push({ lot, qty: milliToQty(take) });
    remaining -= take;
  }
  if (remaining > 0) {
    if (legacyMilli < remaining) {
      throw new AppError('Insufficient stock for FEFO allocation', 400, 'INSUFFICIENT_STOCK');
    }
    slices.push({ lot: null, qty: milliToQty(remaining) });
    remaining = 0;
  }
  for (const slice of slices) {
    if (slice.lot) await decrementLot(client, slice.lot.id, slice.qty);
  }
  await changeItemQty(client, item.id, `-${qtyText}`, false);
  for (const slice of slices) {
    await insertTxn(client, {
      itemId: item.id,
      type: 'out',
      qty: slice.qty,
      lotNumber: slice.lot?.lot_number || null,
      expiry: slice.lot?.expiry_date || null,
      lotId: slice.lot?.id || null,
      notes: slice.lot
        ? extras.notes
        : (extras.notes ? `${extras.notes} [legacy_unallocated]` : 'legacy_unallocated'),
      userId,
    });
  }
};

const applyInWithLots = async (client, item, qtyText, extras, userId) => {
  const lotNumber = String(extras.lot_number || '').trim() || null;
  const expiry = extras.expiry_date || null;
  let lot;
  if (lotNumber) {
    lot = await resolveLabeledLot(client, item.id, lotNumber, expiry);
  } else {
    lot = await createLot(client, item.id, null, expiry, true);
  }
  await client.query(
    `UPDATE inventory_lots SET
       quantity = quantity + $2::numeric,
       updated_at = NOW()
     WHERE id = $1`,
    [lot.id, qtyText]
  );
  await changeItemQty(client, item.id, qtyText, true);
  await insertTxn(client, {
    itemId: item.id,
    type: 'in',
    qty: qtyText,
    lotNumber: lotNumber,
    expiry,
    lotId: lot.id,
    notes: extras.notes,
    userId,
  });
};

const adjustStock = async (id, type, quantity, userId, notes, extras = {}) => {
  if (!['in', 'out'].includes(type)) {
    throw new AppError('Invalid stock movement type', 400, 'INVALID_TYPE');
  }
  const qtyText = milliToQty(qtyToMilli(quantity));
  const options = { ...extras, notes: notes || extras.notes || null };
  const own = !options.client;
  const client = options.client || await db.getClient();
  try {
    if (own) await client.query('BEGIN');
    const item = await lockItem(client, id);
    const lotsReady = await lotsTableReady(client);
    if (!lotsReady) {
      await changeItemQty(client, id, type === 'in' ? qtyText : `-${qtyText}`, false);
      await client.query(
        `INSERT INTO inventory_transactions (item_id, type, quantity, lot_number, notes, performed_by)
         VALUES ($1, $2, $3::numeric, $4, $5, $6)`,
        [id, type, qtyText, item.lot_number, options.notes, userId]
      );
    } else if (type === 'out') {
      await applyOutWithLots(client, item, qtyText, options, userId);
    } else {
      await applyInWithLots(client, item, qtyText, options, userId);
    }
    if (lotsReady) await assertLotsWithinItem(client, id);
    const next = await getById(id, client);
    await logInventoryAudit(client, {
      userId,
      action: 'adjust_inventory_stock',
      entityId: id,
      oldValues: { quantity: item.quantity, type },
      newValues: {
        quantity: next.quantity,
        type,
        source: options.source || null,
        lot_id: options.lot_id || next.transactions[0]?.lot_id || null,
      },
      req: options.req || null,
    });
    if (own) await client.query('COMMIT');
    return next;
  } catch (err) {
    if (own) {
      try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    }
    throw err;
  } finally {
    if (own) client.release();
  }
};

module.exports = { list, getById, create, update, adjustStock, getAlerts };
