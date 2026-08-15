const db = require('../config/database');
const helpers = require('../utils/helpers');
const suppliersAudit = require('../utils/suppliers-audit');
const { AppError } = require('../middleware/errorHandler');

const TABLE_MISSING = '42P01';
const UNIQUE_VIOLATION = '23505';
const SUPPLIER_NUMBER_CONSTRAINT = 'idx_suppliers_number';
const TAX_NUMBER_CONSTRAINT = 'idx_suppliers_tax_number_active';
const MAX_NUMBER_RETRIES = 8;

const actorIdOf = (actor) => (typeof actor === 'string' ? actor : actor?.id || null);

const pickOptions = (...candidates) => {
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const candidate = candidates[i];
    if (candidate && typeof candidate === 'object' && candidate.client) return candidate;
  }
  return candidates.find((candidate) => candidate && typeof candidate === 'object' && !candidate.method) || {};
};

const requestOf = (reqOrOptions, options) => {
  if (reqOrOptions && typeof reqOrOptions.get === 'function') return reqOrOptions;
  return options.req || null;
};

const runQuery = (client, sql, params) => (
  client ? client.query(sql, params) : db.query(sql, params)
);

const isTableMissing = (err) => err && err.code === TABLE_MISSING;

const throwIfTableMissing = (err) => {
  if (isTableMissing(err)) {
    throw new AppError('Suppliers table is not available', 503, 'SUPPLIERS_UNAVAILABLE');
  }
};

const uniqueConstraintName = (err) => String(err?.constraint || err?.detail || '');

const isUniqueViolation = (err, constraint) => (
  err && err.code === UNIQUE_VIOLATION && uniqueConstraintName(err).includes(constraint)
);

const throwDuplicateTax = () => {
  throw new AppError('Tax number already exists for an active supplier', 409, 'DUPLICATE_TAX_NUMBER');
};

const throwNumberConflict = () => {
  throw new AppError('Could not allocate a unique supplier number', 409, 'SUPPLIER_NUMBER_CONFLICT');
};

const mapWriteError = (err) => {
  if (isUniqueViolation(err, TAX_NUMBER_CONSTRAINT)) throwDuplicateTax();
  if (isUniqueViolation(err, SUPPLIER_NUMBER_CONSTRAINT)) throwNumberConflict();
  throw err;
};

const emptyToNull = (value) => {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
};

const toPublic = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    supplier_number: row.supplier_number,
    name: row.name,
    name_ar: row.name_ar,
    tax_number: row.tax_number,
    phone: row.phone,
    email: row.email,
    address: row.address,
    notes: row.notes,
    is_active: row.is_active,
    deleted_at: row.deleted_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

const withSupplierClient = async (externalClient, work) => {
  const client = externalClient || await db.getClient();
  const ownTxn = !externalClient;
  let committed = false;
  try {
    if (ownTxn) await client.query('BEGIN');
    const result = await work(client);
    if (ownTxn) {
      await client.query('COMMIT');
      committed = true;
    }
    return result;
  } catch (err) {
    if (ownTxn && !committed) {
      try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    }
    throw err;
  } finally {
    if (ownTxn) client.release();
  }
};

const lockSupplier = async (client, id) => {
  const { rows } = await client.query('SELECT * FROM suppliers WHERE id = $1 FOR UPDATE', [id]);
  return rows[0] || null;
};

const insertSupplierWithRetry = async (client, data, createdBy) => {
  for (let attempt = 1; attempt <= MAX_NUMBER_RETRIES; attempt += 1) {
    const supplierNumber = helpers.generateCode('SUP');
    await client.query('SAVEPOINT supplier_insert');
    try {
      const { rows } = await client.query(
        `INSERT INTO suppliers (
           supplier_number, name, name_ar, tax_number, phone, email, address, notes, is_active, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          supplierNumber,
          data.name,
          data.name_ar,
          emptyToNull(data.tax_number),
          emptyToNull(data.phone),
          emptyToNull(data.email),
          emptyToNull(data.address),
          emptyToNull(data.notes),
          data.is_active !== false,
          createdBy || null,
        ]
      );
      await client.query('RELEASE SAVEPOINT supplier_insert');
      return rows[0];
    } catch (err) {
      try { await client.query('ROLLBACK TO SAVEPOINT supplier_insert'); } catch (_) { /* ignore */ }
      throwIfTableMissing(err);
      if (isUniqueViolation(err, TAX_NUMBER_CONSTRAINT)) throwDuplicateTax();
      if (isUniqueViolation(err, SUPPLIER_NUMBER_CONSTRAINT) && attempt < MAX_NUMBER_RETRIES) {
        continue;
      }
      mapWriteError(err);
    }
  }
  throwNumberConflict();
};

const list = async (filters = {}, options = {}) => {
  try {
    const { search, is_active, page, limit } = filters;
    const { page: p, limit: lim, offset } = helpers.paginate(page, limit);
    const params = [];
    const where = ['deleted_at IS NULL'];

    if (search) {
      params.push(`%${search}%`);
      where.push(`(
        name ILIKE $${params.length}
        OR name_ar ILIKE $${params.length}
        OR supplier_number ILIKE $${params.length}
        OR COALESCE(tax_number, '') ILIKE $${params.length}
      )`);
    }
    if (is_active === true || is_active === false) {
      params.push(is_active);
      where.push(`is_active = $${params.length}`);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const countSql = `SELECT COUNT(*)::int AS total FROM suppliers ${whereSql}`;
    const listSql = `
      SELECT *
      FROM suppliers
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const countResult = await runQuery(options.client, countSql, params);
    const listResult = await runQuery(options.client, listSql, [...params, lim, offset]);
    const total = countResult.rows[0]?.total || 0;

    return {
      data: listResult.rows.map(toPublic),
      pagination: helpers.buildPagination(total, p, lim),
    };
  } catch (err) {
    throwIfTableMissing(err);
    throw err;
  }
};

const getById = async (id, viewOrOptions = {}, maybeOptions = {}) => {
  try {
    const options = pickOptions(viewOrOptions, maybeOptions);
    const { rows } = await runQuery(
      options.client,
      'SELECT * FROM suppliers WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (!rows[0]) {
      throw new AppError('Supplier not found', 404, 'NOT_FOUND');
    }
    return toPublic(rows[0]);
  } catch (err) {
    throwIfTableMissing(err);
    throw err;
  }
};

const create = async (data, actor, reqOrOptions, maybeOptions) => {
  const options = pickOptions(reqOrOptions, maybeOptions);
  const req = requestOf(reqOrOptions, options);
  try {
    return await withSupplierClient(options.client, async (client) => {
      const row = await insertSupplierWithRetry(client, data, actorIdOf(actor));
      const publicRow = toPublic(row);
      await suppliersAudit.logSupplierAudit(client, {
        userId: actorIdOf(actor),
        action: 'create_supplier',
        entityId: row.id,
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

const update = async (id, data, actor, reqOrOptions, maybeOptions) => {
  const options = pickOptions(reqOrOptions, maybeOptions);
  const req = requestOf(reqOrOptions, options);
  try {
    return await withSupplierClient(options.client, async (client) => {
      const existing = await lockSupplier(client, id);
      if (!existing || existing.deleted_at) {
        throw new AppError('Supplier not found', 404, 'NOT_FOUND');
      }

      let updated;
      await client.query('SAVEPOINT supplier_update');
      try {
        const result = await client.query(
          `UPDATE suppliers SET
             name = $1,
             name_ar = $2,
             tax_number = $3,
             phone = $4,
             email = $5,
             address = $6,
             notes = $7,
             is_active = $8,
             updated_at = NOW()
           WHERE id = $9
           RETURNING *`,
          [
            data.name,
            data.name_ar,
            emptyToNull(data.tax_number),
            emptyToNull(data.phone),
            emptyToNull(data.email),
            emptyToNull(data.address),
            emptyToNull(data.notes),
            data.is_active !== false,
            id,
          ]
        );
        updated = result.rows[0];
        await client.query('RELEASE SAVEPOINT supplier_update');
      } catch (err) {
        try { await client.query('ROLLBACK TO SAVEPOINT supplier_update'); } catch (_) { /* ignore */ }
        throwIfTableMissing(err);
        mapWriteError(err);
      }

      const publicRow = toPublic(updated);
      await suppliersAudit.logSupplierAudit(client, {
        userId: actorIdOf(actor),
        action: 'update_supplier',
        entityId: id,
        oldValues: toPublic(existing),
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

const softDelete = async (id, actor, reqOrOptions, maybeOptions) => {
  const options = pickOptions(reqOrOptions, maybeOptions);
  const req = requestOf(reqOrOptions, options);
  try {
    return await withSupplierClient(options.client, async (client) => {
      const existing = await lockSupplier(client, id);
      if (!existing) {
        throw new AppError('Supplier not found', 404, 'NOT_FOUND');
      }
      if (existing.deleted_at) return toPublic(existing);

      const { rows } = await client.query(
        `UPDATE suppliers SET is_active = false, deleted_at = NOW(), updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id]
      );
      const publicRow = toPublic(rows[0]);
      await suppliersAudit.logSupplierAudit(client, {
        userId: actorIdOf(actor),
        action: 'soft_delete_supplier',
        entityId: id,
        oldValues: toPublic(existing),
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

module.exports = { list, getById, create, update, softDelete, toPublic };
