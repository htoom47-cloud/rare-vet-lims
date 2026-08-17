const db = require('../config/database');
const helpers = require('../utils/helpers');
const purchasesAudit = require('../utils/purchases-audit');
const { AppError } = require('../middleware/errorHandler');
const {
  toHalalas,
  fromHalalas,
  computeInvoiceTotals,
  assertTotalsMatch,
} = require('../utils/purchases-money');
const { sniffPurchaseFile, safeOriginalName } = require('../utils/purchases-files');
const { saveFile, deleteFile, createReadStream } = require('../config/storage');
const { assertPurchasesReady } = require('../utils/purchases-schema');

const TABLE_MISSING = '42P01';
const UNIQUE_VIOLATION = '23505';
const APPROVED_NUMBER_CONSTRAINT = 'idx_purchase_invoices_supplier_number_approved';
const DOCUMENT_CONSTRAINT = 'idx_purchase_invoices_document';
const CASH_SUPPLIER_NUMBER = 'SUP-CASH-UNREG';
const MAX_DOC_RETRIES = 8;

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

const runQuery = (client, sql, params) => (client ? client.query(sql, params) : db.query(sql, params));

const throwIfTableMissing = (err) => {
  if (err && err.code === TABLE_MISSING) {
    throw new AppError('Purchase invoices are not available', 503, 'PURCHASES_UNAVAILABLE');
  }
};

const withPurchaseClient = async (externalClient, work) => {
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

const toPublicItem = (row) => ({
  id: row.id,
  line_no: row.line_no,
  description: row.description,
  quantity: Number(row.quantity),
  unit_price_halalas: row.unit_price_halalas,
  discount_halalas: row.discount_halalas,
  line_net_halalas: row.line_net_halalas,
  tax_category: row.tax_category,
  tax_rate_bps: row.tax_rate_bps,
  tax_rate: Number(row.tax_rate_bps || 0) / 100,
  vat_halalas: row.vat_halalas,
  unit_price_sar: fromHalalas(row.unit_price_halalas),
  discount_sar: fromHalalas(row.discount_halalas),
  line_net_sar: fromHalalas(row.line_net_halalas),
  vat_sar: fromHalalas(row.vat_halalas),
  destination: row.destination || null,
  inventory_item_id: row.inventory_item_id || null,
  inventory_sku: row.inventory_sku || null,
  inventory_name: row.inventory_name || null,
  expense_account_id: row.expense_account_id || null,
  expense_account_code: row.expense_account_code || null,
  expense_account_name: row.expense_account_name || null,
  lot_number: row.lot_number || null,
  expiry_date: row.expiry_date || null,
});

const toPublicAttachment = (row, invoiceId) => ({
  id: row.id,
  original_name: row.original_name,
  mime_type: row.mime_type,
  size_bytes: row.size_bytes,
  created_at: row.created_at,
  download_path: `/purchases/${invoiceId || row.purchase_invoice_id}/attachments/${row.id}`,
});

const toPublic = (row, extras = {}) => {
  if (!row) return null;
  return {
    id: row.id,
    document_number: row.document_number,
    supplier_id: row.supplier_id,
    supplier_invoice_number: row.supplier_invoice_number,
    invoice_date: row.invoice_date,
    status: row.status,
    payment_method: row.payment_method,
    notes: row.notes,
    subtotal_halalas: row.subtotal_halalas,
    discount_halalas: row.discount_halalas,
    vat_halalas: row.vat_halalas,
    total_halalas: row.total_halalas,
    subtotal_sar: fromHalalas(row.subtotal_halalas),
    discount_sar: fromHalalas(row.discount_halalas),
    vat_sar: fromHalalas(row.vat_halalas),
    total_sar: fromHalalas(row.total_halalas),
    uses_cash_unregistered: row.uses_cash_unregistered,
    created_by: row.created_by,
    approved_by: row.approved_by,
    cancelled_by: row.cancelled_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    approved_at: row.approved_at,
    cancelled_at: row.cancelled_at,
    cancel_reason: row.cancel_reason,
    stock_applied_at: row.stock_applied_at,
    ledger_posted_at: row.ledger_posted_at,
    posting_date: row.posting_date || null,
    posted_by: row.posted_by || null,
    posted: row.status === 'posted' || Boolean(row.stock_applied_at && row.ledger_posted_at),
    ...extras,
  };
};

const canSeeAll = (actor) => {
  const perms = actor?.permissions || [];
  return perms.includes('purchases.approve') || actor?.role_name === 'admin';
};

const assertPerm = (actor, code) => {
  if (!actor || typeof actor === 'string') return;
  if (actor.role_name === 'admin') return;
  if (!Array.isArray(actor.permissions)) return;
  if (!actor.permissions.includes(code)) {
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
  }
};

const lockInvoice = async (client, id) => {
  const { rows } = await client.query(
    'SELECT * FROM purchase_invoices WHERE id = $1 FOR UPDATE',
    [id]
  );
  return rows[0] || null;
};

const loadItems = async (client, id) => {
  try {
    const { rows } = await runQuery(
      client,
      `SELECT i.*,
              inv.sku AS inventory_sku,
              inv.name AS inventory_name,
              inv.name_ar AS inventory_name_ar,
              acc.code AS expense_account_code,
              acc.name AS expense_account_name
       FROM purchase_invoice_items i
       LEFT JOIN inventory_items inv ON inv.id = i.inventory_item_id
       LEFT JOIN ledger_accounts acc ON acc.id = i.expense_account_id
       WHERE i.purchase_invoice_id = $1
       ORDER BY i.line_no`,
      [id]
    );
    return rows.map(toPublicItem);
  } catch (err) {
    if (err.code !== '42703') throw err;
    const { rows } = await runQuery(
      client,
      'SELECT * FROM purchase_invoice_items WHERE purchase_invoice_id = $1 ORDER BY line_no',
      [id]
    );
    return rows.map(toPublicItem);
  }
};

const loadAttachments = async (client, id) => {
  const { rows } = await runQuery(
    client,
    'SELECT * FROM purchase_invoice_attachments WHERE purchase_invoice_id = $1 ORDER BY created_at',
    [id]
  );
  return rows.map((row) => toPublicAttachment(row, id));
};

const getCashSupplier = async (client) => {
  const { rows } = await runQuery(
    client,
    'SELECT * FROM suppliers WHERE supplier_number = $1 AND deleted_at IS NULL',
    [CASH_SUPPLIER_NUMBER]
  );
  if (!rows[0]) {
    throw new AppError('Cash unregistered supplier is not configured', 503, 'CASH_SUPPLIER_MISSING');
  }
  return rows[0];
};

const assertSupplierUsable = async (client, supplierId, usesCash) => {
  const { rows } = await runQuery(
    client,
    'SELECT * FROM suppliers WHERE id = $1 AND deleted_at IS NULL',
    [supplierId]
  );
  const supplier = rows[0];
  if (!supplier) throw new AppError('Supplier not found', 404, 'SUPPLIER_NOT_FOUND');
  if (!supplier.is_active) throw new AppError('Supplier is inactive', 409, 'SUPPLIER_INACTIVE');
  if (usesCash && supplier.supplier_number !== CASH_SUPPLIER_NUMBER) {
    throw new AppError('Cash-unregistered flag requires the system cash supplier', 400, 'INVALID_CASH_SUPPLIER');
  }
  if (!usesCash && supplier.supplier_number === CASH_SUPPLIER_NUMBER) {
    throw new AppError('Use the cash-unregistered option for this supplier', 400, 'CASH_SUPPLIER_REQUIRED');
  }
  if (usesCash && supplier.tax_number) {
    throw new AppError('Cash unregistered supplier cannot carry a tax number', 400, 'CASH_SUPPLIER_HAS_TAX');
  }
  return supplier;
};

const similarWarnings = async (client, { supplierId, invoiceDate, totalHalalas, excludeId }) => {
  const params = [supplierId, invoiceDate, totalHalalas];
  let sql = `
    SELECT id, document_number, supplier_invoice_number, total_halalas, invoice_date, status
    FROM purchase_invoices
    WHERE supplier_id = $1
      AND invoice_date = $2
      AND total_halalas = $3
      AND deleted_at IS NULL
      AND status <> 'cancelled'
  `;
  if (excludeId) {
    params.push(excludeId);
    sql += ` AND id <> $${params.length}`;
  }
  const { rows } = await runQuery(client, sql, params);
  return rows.map((row) => ({
    code: 'SIMILAR_INVOICE',
    message: 'Another invoice for this supplier has the same date and total',
    document_number: row.document_number,
    id: row.id,
  }));
};

const replaceItems = async (client, invoiceId, computedItems) => {
  await client.query('DELETE FROM purchase_invoice_items WHERE purchase_invoice_id = $1', [invoiceId]);
  for (const item of computedItems) {
    await client.query(
      `INSERT INTO purchase_invoice_items (
         purchase_invoice_id, line_no, description, quantity, unit_price_halalas, discount_halalas,
         line_net_halalas, tax_category, tax_rate_bps, vat_halalas
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        invoiceId,
        item.line_no,
        item.description,
        item.quantity,
        item.unit_price_halalas,
        item.discount_halalas,
        item.line_net_halalas,
        item.tax_category,
        item.tax_rate_bps,
        item.vat_halalas,
      ]
    );
  }
};

const insertDocumentWithRetry = async (client, fields) => {
  for (let attempt = 1; attempt <= MAX_DOC_RETRIES; attempt += 1) {
    const documentNumber = helpers.generateCode('PIN');
    await client.query('SAVEPOINT purchase_insert');
    try {
      const { rows } = await client.query(
        `INSERT INTO purchase_invoices (
           document_number, supplier_id, supplier_invoice_number, invoice_date, status,
           payment_method, notes, vat_rate_bps, subtotal_halalas, discount_halalas,
           vat_halalas, total_halalas, uses_cash_unregistered, created_by
         ) VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING *`,
        [
          documentNumber,
          fields.supplier_id,
          fields.supplier_invoice_number,
          fields.invoice_date,
          fields.payment_method,
          fields.notes,
          fields.vat_rate_bps,
          fields.subtotal_halalas,
          fields.discount_halalas,
          fields.vat_halalas,
          fields.total_halalas,
          fields.uses_cash_unregistered,
          fields.created_by,
        ]
      );
      await client.query('RELEASE SAVEPOINT purchase_insert');
      return rows[0];
    } catch (err) {
      try { await client.query('ROLLBACK TO SAVEPOINT purchase_insert'); } catch (_) { /* ignore */ }
      throwIfTableMissing(err);
      if (err.code === UNIQUE_VIOLATION && String(err.constraint || '').includes(DOCUMENT_CONSTRAINT)
        && attempt < MAX_DOC_RETRIES) {
        continue;
      }
      throw err;
    }
  }
  throw new AppError('Could not allocate a document number', 409, 'DOCUMENT_NUMBER_CONFLICT');
};

const buildComputed = (data, { cash } = {}) => {
  const headerDiscount = data.discount_halalas != null
    ? Number(data.discount_halalas)
    : toHalalas(data.discount_sar);
  const computed = computeInvoiceTotals(
    data.items || [],
    headerDiscount,
    { defaultCategory: cash ? 'out_of_scope' : 'standard' }
  );
  assertTotalsMatch(computed, data);
  if (!computed.items.length) {
    throw new AppError('At least one line item is required', 400, 'ITEMS_REQUIRED');
  }
  if (computed.total_halalas !== computed.subtotal_halalas - computed.discount_halalas + computed.vat_halalas) {
    throw new AppError('Submitted totals do not match line items', 400, 'TOTALS_MISMATCH');
  }
  return computed;
};

const list = async (filters = {}, actor, options = {}) => {
  await assertPurchasesReady(options.client);
  try {
    const { search, status, supplier_id, page, limit } = filters;
    const { page: p, limit: lim, offset } = helpers.paginate(page, limit);
    const params = [];
    const where = ['pi.deleted_at IS NULL'];

    if (status) {
      params.push(status);
      where.push(`pi.status = $${params.length}`);
    }
    if (supplier_id) {
      params.push(supplier_id);
      where.push(`pi.supplier_id = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(
        pi.document_number ILIKE $${params.length}
        OR pi.supplier_invoice_number ILIKE $${params.length}
        OR COALESCE(s.name, '') ILIKE $${params.length}
        OR COALESCE(s.name_ar, '') ILIKE $${params.length}
      )`);
    }
    if (!canSeeAll(actor)) {
      params.push(actorIdOf(actor));
      where.push(`pi.created_by = $${params.length}`);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const count = await runQuery(
      options.client,
      `SELECT COUNT(*)::int AS total
       FROM purchase_invoices pi
       LEFT JOIN suppliers s ON s.id = pi.supplier_id
       ${whereSql}`,
      params
    );
    const listResult = await runQuery(
      options.client,
      `SELECT pi.*, s.name AS supplier_name, s.name_ar AS supplier_name_ar, s.tax_number AS supplier_tax_number
       FROM purchase_invoices pi
       LEFT JOIN suppliers s ON s.id = pi.supplier_id
       ${whereSql}
       ORDER BY pi.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, lim, offset]
    );
    return {
      data: listResult.rows.map((row) => toPublic(row, {
        supplier_name: row.supplier_name,
        supplier_name_ar: row.supplier_name_ar,
        supplier_tax_number: row.supplier_tax_number,
      })),
      pagination: helpers.buildPagination(count.rows[0]?.total || 0, p, lim),
    };
  } catch (err) {
    throwIfTableMissing(err);
    throw err;
  }
};

const getById = async (id, actor, options = {}) => {
  await assertPurchasesReady(options.client);
  try {
    const { rows } = await runQuery(
      options.client,
      `SELECT pi.*, s.name AS supplier_name, s.name_ar AS supplier_name_ar, s.tax_number AS supplier_tax_number
       FROM purchase_invoices pi
       LEFT JOIN suppliers s ON s.id = pi.supplier_id
       WHERE pi.id = $1 AND pi.deleted_at IS NULL`,
      [id]
    );
    if (!rows[0]) throw new AppError('Purchase invoice not found', 404, 'NOT_FOUND');
    if (!canSeeAll(actor) && rows[0].created_by !== actorIdOf(actor)) {
      throw new AppError('Purchase invoice not found', 404, 'NOT_FOUND');
    }
    const items = await loadItems(options.client, id);
    const attachments = await loadAttachments(options.client, id);
    const warnings = await similarWarnings(options.client, {
      supplierId: rows[0].supplier_id,
      invoiceDate: rows[0].invoice_date,
      totalHalalas: rows[0].total_halalas,
      excludeId: id,
    });
    const tax_summary = computeInvoiceTotals(
      items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit_price_halalas: item.unit_price_halalas,
        discount_halalas: item.discount_halalas,
        tax_category: item.tax_category,
        tax_rate_bps: item.tax_rate_bps,
      })),
      rows[0].discount_halalas,
      { defaultCategory: rows[0].uses_cash_unregistered ? 'out_of_scope' : 'standard' }
    ).tax_summary;
    return toPublic(rows[0], {
      supplier_name: rows[0].supplier_name,
      supplier_name_ar: rows[0].supplier_name_ar,
      supplier_tax_number: rows[0].supplier_tax_number,
      items,
      attachments,
      warnings,
      tax_summary,
    });
  } catch (err) {
    throwIfTableMissing(err);
    throw err;
  }
};

const create = async (data, actor, reqOrOptions, maybeOptions) => {
  const options = pickOptions(reqOrOptions, maybeOptions);
  const req = requestOf(reqOrOptions, options);
  assertPerm(actor, 'purchases.create');
  await assertPurchasesReady(options.client);
  try {
    return await withPurchaseClient(options.client, async (client) => {
      let supplierId = data.supplier_id;
      let usesCash = Boolean(data.uses_cash_unregistered);
      if (usesCash) {
        const cash = await getCashSupplier(client);
        supplierId = cash.id;
      }
      await assertSupplierUsable(client, supplierId, usesCash);
      const computed = buildComputed(data, { cash: usesCash });
      const header = await insertDocumentWithRetry(client, {
        supplier_id: supplierId,
        supplier_invoice_number: String(data.supplier_invoice_number).trim(),
        invoice_date: data.invoice_date,
        payment_method: data.payment_method || 'cash',
        notes: data.notes || null,
        vat_rate_bps: null,
        subtotal_halalas: computed.subtotal_halalas,
        discount_halalas: computed.discount_halalas,
        vat_halalas: computed.vat_halalas,
        total_halalas: computed.total_halalas,
        uses_cash_unregistered: usesCash,
        created_by: actorIdOf(actor),
      });
      await replaceItems(client, header.id, computed.items);
      const publicRow = toPublic(header, {
        items: computed.items.map(toPublicItem),
        attachments: [],
        tax_summary: computed.tax_summary,
      });
      await purchasesAudit.logPurchaseAudit(client, {
        userId: actorIdOf(actor),
        action: 'create_purchase_invoice',
        entityId: header.id,
        newValues: publicRow,
        req,
      });
      const warnings = await similarWarnings(client, {
        supplierId: header.supplier_id,
        invoiceDate: header.invoice_date,
        totalHalalas: header.total_halalas,
        excludeId: header.id,
      });
      return { ...publicRow, warnings };
    });
  } catch (err) {
    throwIfTableMissing(err);
    throw err;
  }
};

const assertDraftWritable = (existing) => {
  if (!existing || existing.deleted_at) {
    throw new AppError('Purchase invoice not found', 404, 'NOT_FOUND');
  }
  if (existing.status !== 'draft') {
    throw new AppError('Approved or cancelled invoices cannot be edited', 409, 'INVOICE_LOCKED');
  }
};

const update = async (id, data, actor, reqOrOptions, maybeOptions) => {
  const options = pickOptions(reqOrOptions, maybeOptions);
  const req = requestOf(reqOrOptions, options);
  assertPerm(actor, 'purchases.create');
  await assertPurchasesReady(options.client);
  try {
    return await withPurchaseClient(options.client, async (client) => {
      const existing = await lockInvoice(client, id);
      assertDraftWritable(existing);
      if (!canSeeAll(actor) && existing.created_by !== actorIdOf(actor)) {
        throw new AppError('Purchase invoice not found', 404, 'NOT_FOUND');
      }
      let supplierId = data.supplier_id;
      let usesCash = Boolean(data.uses_cash_unregistered);
      if (usesCash) {
        supplierId = (await getCashSupplier(client)).id;
      }
      await assertSupplierUsable(client, supplierId, usesCash);
      const computed = buildComputed(data, { cash: usesCash });
      const { rows } = await client.query(
        `UPDATE purchase_invoices SET
           supplier_id = $1,
           supplier_invoice_number = $2,
           invoice_date = $3,
           payment_method = $4,
           notes = $5,
           vat_rate_bps = $6,
           subtotal_halalas = $7,
           discount_halalas = $8,
           vat_halalas = $9,
           total_halalas = $10,
           uses_cash_unregistered = $11,
           updated_at = NOW()
         WHERE id = $12
         RETURNING *`,
        [
          supplierId,
          String(data.supplier_invoice_number).trim(),
          data.invoice_date,
          data.payment_method || 'cash',
          data.notes || null,
          null,
          computed.subtotal_halalas,
          computed.discount_halalas,
          computed.vat_halalas,
          computed.total_halalas,
          usesCash,
          id,
        ]
      );
      await replaceItems(client, id, computed.items);
      const publicRow = toPublic(rows[0], {
        items: computed.items.map(toPublicItem),
        tax_summary: computed.tax_summary,
      });
      await purchasesAudit.logPurchaseAudit(client, {
        userId: actorIdOf(actor),
        action: 'update_purchase_invoice',
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
  assertPerm(actor, 'purchases.create');
  await assertPurchasesReady(options.client);
  const filesToRemove = [];
  try {
    const publicRow = await withPurchaseClient(options.client, async (client) => {
      const existing = await lockInvoice(client, id);
      if (!existing) throw new AppError('Purchase invoice not found', 404, 'NOT_FOUND');
      if (existing.deleted_at) return toPublic(existing);
      if (existing.status !== 'draft') {
        throw new AppError('Only drafts can be deleted', 409, 'INVOICE_LOCKED');
      }
      if (!canSeeAll(actor) && existing.created_by !== actorIdOf(actor)) {
        throw new AppError('Purchase invoice not found', 404, 'NOT_FOUND');
      }
      const attachments = await client.query(
        'SELECT id, file_url, original_name FROM purchase_invoice_attachments WHERE purchase_invoice_id = $1',
        [id]
      );
      attachments.rows.forEach((row) => filesToRemove.push(row.file_url));
      await client.query('DELETE FROM purchase_invoice_attachments WHERE purchase_invoice_id = $1', [id]);
      const { rows } = await client.query(
        `UPDATE purchase_invoices SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id]
      );
      const next = toPublic(rows[0]);
      await purchasesAudit.logPurchaseAudit(client, {
        userId: actorIdOf(actor),
        action: 'soft_delete_purchase_invoice',
        entityId: id,
        oldValues: toPublic(existing),
        newValues: { ...next, removed_attachments: attachments.rows.map((row) => row.original_name) },
        req,
      });
      return next;
    });
    if (!options.client) {
      await Promise.all(filesToRemove.map((url) => deleteFile(url).catch(() => null)));
    }
    return publicRow;
  } catch (err) {
    throwIfTableMissing(err);
    throw err;
  }
};

const approve = async (id, actor, reqOrOptions, maybeOptions) => {
  const options = pickOptions(reqOrOptions, maybeOptions);
  const req = requestOf(reqOrOptions, options);
  assertPerm(actor, 'purchases.approve');
  await assertPurchasesReady(options.client);
  try {
    return await withPurchaseClient(options.client, async (client) => {
      const existing = await lockInvoice(client, id);
      if (!existing || existing.deleted_at) {
        throw new AppError('Purchase invoice not found', 404, 'NOT_FOUND');
      }
      if (existing.status === 'approved') return toPublic(existing);
      if (existing.status !== 'draft') {
        throw new AppError('Only drafts can be approved', 409, 'INVOICE_LOCKED');
      }
      await client.query('SAVEPOINT purchase_approve');
      let updated;
      try {
        const result = await client.query(
          `UPDATE purchase_invoices SET
             status = 'approved',
             approved_by = $2,
             approved_at = NOW(),
             updated_at = NOW()
           WHERE id = $1
           RETURNING *`,
          [id, actorIdOf(actor)]
        );
        updated = result.rows[0];
        await client.query('RELEASE SAVEPOINT purchase_approve');
      } catch (err) {
        try { await client.query('ROLLBACK TO SAVEPOINT purchase_approve'); } catch (_) { /* ignore */ }
        if (err.code === UNIQUE_VIOLATION && String(err.constraint || '').includes(APPROVED_NUMBER_CONSTRAINT)) {
          throw new AppError('An approved invoice with this supplier invoice number already exists', 409, 'DUPLICATE_SUPPLIER_INVOICE');
        }
        throw err;
      }
      const publicRow = toPublic(updated);
      await purchasesAudit.logPurchaseAudit(client, {
        userId: actorIdOf(actor),
        action: 'approve_purchase_invoice',
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

const cancel = async (id, reason, actor, reqOrOptions, maybeOptions) => {
  const options = pickOptions(reqOrOptions, maybeOptions);
  const req = requestOf(reqOrOptions, options);
  assertPerm(actor, 'purchases.cancel');
  await assertPurchasesReady(options.client);
  try {
    return await withPurchaseClient(options.client, async (client) => {
      const existing = await lockInvoice(client, id);
      if (!existing || existing.deleted_at) {
        throw new AppError('Purchase invoice not found', 404, 'NOT_FOUND');
      }
      if (existing.status === 'cancelled') return toPublic(existing);
      if (existing.status === 'posted' || existing.stock_applied_at || existing.ledger_posted_at) {
        throw new AppError(
          'Posted purchases cannot be cancelled. A reversal is required.',
          409,
          'POSTED_PURCHASE_REQUIRES_REVERSAL'
        );
      }
      if (existing.status === 'approved' && !String(reason || '').trim()) {
        throw new AppError('A cancellation reason is required for approved invoices', 400, 'CANCEL_REASON_REQUIRED');
      }
      const { rows } = await client.query(
        `UPDATE purchase_invoices SET
           status = 'cancelled',
           cancelled_by = $2,
           cancelled_at = NOW(),
           cancel_reason = $3,
           updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id, actorIdOf(actor), reason || null]
      );
      const publicRow = toPublic(rows[0]);
      await purchasesAudit.logPurchaseAudit(client, {
        userId: actorIdOf(actor),
        action: 'cancel_purchase_invoice',
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

const addAttachment = async (id, file, actor, reqOrOptions, maybeOptions) => {
  const options = pickOptions(reqOrOptions, maybeOptions);
  const req = requestOf(reqOrOptions, options);
  assertPerm(actor, 'purchases.create');
  await assertPurchasesReady(options.client);
  const sniffed = sniffPurchaseFile(file.buffer, file.originalname);
  let saved = null;
  try {
    saved = await saveFile(file.buffer, 'purchases', `${safeOriginalName(file.originalname)}${sniffed.ext}`);
    return await withPurchaseClient(options.client, async (client) => {
      const existing = await lockInvoice(client, id);
      assertDraftWritable(existing);
      if (!canSeeAll(actor) && existing.created_by !== actorIdOf(actor)) {
        throw new AppError('Purchase invoice not found', 404, 'NOT_FOUND');
      }
      const { rows } = await client.query(
        `INSERT INTO purchase_invoice_attachments (
           purchase_invoice_id, file_url, original_name, mime_type, size_bytes, uploaded_by
         ) VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING *`,
        [id, saved.url, safeOriginalName(file.originalname), sniffed.mime, file.buffer.length, actorIdOf(actor)]
      );
      await purchasesAudit.logPurchaseAudit(client, {
        userId: actorIdOf(actor),
        action: 'attach_purchase_invoice',
        entityId: id,
        newValues: toPublicAttachment(rows[0], id),
        req,
      });
      return toPublicAttachment(rows[0], id);
    });
  } catch (err) {
    if (saved?.url) {
      try { await deleteFile(saved.url); } catch (_) { /* orphan file is logged by storage */ }
    }
    throwIfTableMissing(err);
    throw err;
  }
};

const openAttachment = async (invoiceId, attachmentId, actor, options = {}) => {
  await assertPurchasesReady(options.client);
  const load = async (client) => {
    const { rows: invoices } = await client.query(
      `SELECT id, created_by FROM purchase_invoices WHERE id = $1 AND deleted_at IS NULL`,
      [invoiceId]
    );
    if (!invoices[0]) throw new AppError('Purchase invoice not found', 404, 'NOT_FOUND');
    if (!canSeeAll(actor) && invoices[0].created_by !== actorIdOf(actor)) {
      throw new AppError('Purchase invoice not found', 404, 'NOT_FOUND');
    }
    const { rows } = await client.query(
      `SELECT a.file_url, a.mime_type, a.original_name
       FROM purchase_invoice_attachments a
       WHERE a.id = $1 AND a.purchase_invoice_id = $2`,
      [attachmentId, invoiceId]
    );
    if (!rows[0]) throw new AppError('Attachment not found', 404, 'NOT_FOUND');
    return rows[0];
  };
  const row = options.client
    ? await load(options.client)
    : await withPurchaseClient(null, load);
  const stream = await createReadStream(row.file_url);
  return {
    stream,
    mime_type: row.mime_type,
    original_name: row.original_name,
  };
};

module.exports = {
  list,
  getById,
  create,
  update,
  softDelete,
  approve,
  cancel,
  addAttachment,
  openAttachment,
  toPublic,
  toPublicItem,
  withPurchaseClient,
  lockInvoice,
  CASH_SUPPLIER_NUMBER,
};
