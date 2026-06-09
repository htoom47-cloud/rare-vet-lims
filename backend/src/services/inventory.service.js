const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { paginate, buildPagination } = require('../utils/helpers');

const list = async ({ category, low_stock, expiring, page, limit }) => {
  const { offset, page: p, limit: l } = paginate(page, limit);
  const params = [];
  let where = 'WHERE i.is_active = true';

  if (category) { params.push(category); where += ` AND i.category = $${params.length}`; }
  if (low_stock === 'true') where += ' AND i.quantity <= i.min_quantity';
  if (expiring === 'true') where += " AND i.expiry_date IS NOT NULL AND i.expiry_date <= CURRENT_DATE + INTERVAL '30 days'";

  const countResult = await query(`SELECT COUNT(*) FROM inventory_items i ${where}`, params);
  const total = parseInt(countResult.rows[0].count, 10);

  params.push(l, offset);
  const result = await query(
    `SELECT i.*, CASE WHEN i.quantity <= i.min_quantity THEN true ELSE false END as is_low_stock,
            CASE WHEN i.expiry_date <= CURRENT_DATE THEN true ELSE false END as is_expired
     FROM inventory_items i ${where} ORDER BY i.name LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { data: result.rows, pagination: buildPagination(total, p, l) };
};

const getById = async (id) => {
  const result = await query('SELECT * FROM inventory_items WHERE id = $1', [id]);
  if (!result.rows[0]) throw new AppError('Inventory item not found', 404, 'NOT_FOUND');

  const transactions = await query(
    'SELECT * FROM inventory_transactions WHERE item_id = $1 ORDER BY created_at DESC LIMIT 20',
    [id]
  );

  return { ...result.rows[0], transactions: transactions.rows };
};

const create = async (data) => {
  const result = await query(
    `INSERT INTO inventory_items (sku, name, name_ar, category, unit, quantity, min_quantity, lot_number, expiry_date, location, supplier, cost_per_unit)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [data.sku, data.name, data.name_ar, data.category, data.unit, data.quantity, data.min_quantity, data.lot_number, data.expiry_date, data.location, data.supplier, data.cost_per_unit]
  );
  return result.rows[0];
};

const update = async (id, data) => {
  await getById(id);
  const result = await query(
    `UPDATE inventory_items SET name=$1, name_ar=$2, category=$3, unit=$4, min_quantity=$5,
     lot_number=$6, expiry_date=$7, location=$8, supplier=$9, cost_per_unit=$10, updated_at=NOW()
     WHERE id=$11 RETURNING *`,
    [data.name, data.name_ar, data.category, data.unit, data.min_quantity, data.lot_number, data.expiry_date, data.location, data.supplier, data.cost_per_unit, id]
  );
  return result.rows[0];
};

const adjustStock = async (id, type, quantity, userId, notes) => {
  const item = await getById(id);
  const newQty = type === 'in' ? parseFloat(item.quantity) + quantity : parseFloat(item.quantity) - quantity;

  if (newQty < 0) throw new AppError('Insufficient stock', 400, 'INSUFFICIENT_STOCK');

  await query('UPDATE inventory_items SET quantity = $1, updated_at = NOW() WHERE id = $2', [newQty, id]);
  await query(
    `INSERT INTO inventory_transactions (item_id, type, quantity, lot_number, notes, performed_by) VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, type, quantity, item.lot_number, notes, userId]
  );

  return getById(id);
};

const getAlerts = async () => {
  const [lowStock, expiring] = await Promise.all([
    query('SELECT * FROM inventory_items WHERE is_active = true AND quantity <= min_quantity ORDER BY quantity ASC'),
    query(`SELECT * FROM inventory_items WHERE is_active = true AND expiry_date IS NOT NULL
           AND expiry_date <= CURRENT_DATE + INTERVAL '30 days' ORDER BY expiry_date ASC`),
  ]);
  return { low_stock: lowStock.rows, expiring: expiring.rows };
};

module.exports = { list, getById, create, update, adjustStock, getAlerts };
