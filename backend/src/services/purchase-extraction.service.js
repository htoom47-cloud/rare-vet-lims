const db = require('../config/database');
const env = require('../config/env');
const purchasesAudit = require('../utils/purchases-audit');
const { AppError } = require('../middleware/errorHandler');
const { sniffPurchaseFile, safeOriginalName } = require('../utils/purchases-files');
const { saveFile, deleteFile, createReadStream } = require('../config/storage');
const { assertPurchasesReady } = require('../utils/purchases-schema');
const { createInvoiceExtractionProvider, isInvoiceExtractionEnabled } = require('../utils/invoice-extraction.provider');
const {
  parseProviderJson,
  emptyPayload,
  buildWarnings,
  canConfirm,
  toDraftBody,
  countPdfPages,
  sanitizeExtractionMessage,
} = require('../utils/invoice-extraction-contract');
const purchases = require('./purchases.service');
const suppliers = require('./suppliers.service');

const TABLE_MISSING = '42P01';
const STATUSES = ['queued', 'processing', 'needs_review', 'completed', 'failed'];
const DEFAULT_LEASE_MS = 120000;

const leaseMsOf = (extra = {}) => Number(extra.leaseMs || env.invoiceExtraction?.leaseMs || DEFAULT_LEASE_MS);

const isStaleProcessing = (row, nowMs = Date.now(), leaseMs = DEFAULT_LEASE_MS) => {
  if (!row || row.status !== 'processing') return false;
  if (row.processing_lease_until) return new Date(row.processing_lease_until).getTime() <= nowMs;
  if (!row.started_at) return false;
  return new Date(row.started_at).getTime() + Number(leaseMs) <= nowMs;
};

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
    throw new AppError('Purchase invoice extraction is not available', 503, 'EXTRACTION_UNAVAILABLE');
  }
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

const withClient = async (externalClient, work) => {
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

const assertExtractionReady = async (executor) => {
  await assertPurchasesReady(executor);
  const { rows } = await runQuery(
    executor,
    `SELECT to_regclass('purchase_invoice_extractions') IS NOT NULL AS ok`
  );
  if (!rows[0]?.ok) {
    throw new AppError('Purchase invoice extraction is not available', 503, 'EXTRACTION_UNAVAILABLE');
  }
};

const toPublic = (row, extras = {}) => {
  if (!row) return null;
  const payload = extras.payload || row.corrected_payload || row.raw_payload || emptyPayload();
  return {
    id: row.id,
    status: row.status,
    original_name: row.original_name,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    page_count: row.page_count,
    provider_name: row.provider_name,
    model_version: row.model_version,
    overall_confidence: row.overall_confidence == null ? null : Number(row.overall_confidence),
    error_code: row.error_code,
    error_message: row.error_message,
    created_by: row.created_by,
    purchase_invoice_id: row.purchase_invoice_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    started_at: row.started_at,
    finished_at: row.finished_at,
    file_download_path: `/purchases/extractions/${row.id}/file`,
    payload,
    warnings: extras.warnings || [],
    computed: extras.computed || null,
    supplier_match: extras.supplier_match || null,
    can_confirm: Boolean(extras.can_confirm),
  };
};

const assertVisible = (row, actor) => {
  if (!row) throw new AppError('Extraction not found', 404, 'NOT_FOUND');
  if (!canSeeAll(actor) && row.created_by !== actorIdOf(actor)) {
    throw new AppError('Extraction not found', 404, 'NOT_FOUND');
  }
};

const loadRow = async (client, id) => {
  const { rows } = await runQuery(client, 'SELECT * FROM purchase_invoice_extractions WHERE id = $1', [id]);
  return rows[0] || null;
};

const matchSuppliers = async (client, payload) => {
  const tax = String(payload.supplier_tax_number || '').trim();
  const name = String(payload.supplier_name_en || payload.supplier_name || payload.supplier_name_ar || '').trim();
  if (tax) {
    const byTax = await suppliers.searchQuick({ tax_number: tax }, { client });
    if (byTax.data.length === 1) {
      return { match: 'tax_number', supplier: byTax.data[0], candidates: byTax.data };
    }
    if (byTax.data.length > 1) {
      return { match: 'tax_number_ambiguous', supplier: null, candidates: byTax.data };
    }
  }
  if (name) {
    const byName = await suppliers.searchQuick({ q: name }, { client });
    if (byName.data.length === 1) {
      return { match: 'name_hint', supplier: byName.data[0], candidates: byName.data };
    }
    if (byName.data.length > 1) {
      return { match: 'name_ambiguous', supplier: null, candidates: byName.data };
    }
  }
  return {
    match: tax ? 'none' : 'unregistered',
    supplier: null,
    candidates: [],
    suggest_cash: !tax,
    suggest_quick: true,
  };
};

const findDuplicate = async (client, supplierId, invoiceNumber) => {
  if (!supplierId || !invoiceNumber) return null;
  const { rows } = await runQuery(
    client,
    `SELECT id, document_number, status
     FROM purchase_invoices
     WHERE supplier_id = $1
       AND lower(btrim(supplier_invoice_number)) = lower(btrim($2))
       AND deleted_at IS NULL
       AND status <> 'cancelled'
     LIMIT 1`,
    [supplierId, invoiceNumber]
  );
  return rows[0] || null;
};

const findSimilar = async (client, supplierId, invoiceDate, totalHalalas) => {
  if (!supplierId || !invoiceDate || totalHalalas == null) return [];
  const { rows } = await runQuery(
    client,
    `SELECT id, document_number, supplier_invoice_number, total_halalas, invoice_date, status
     FROM purchase_invoices
     WHERE supplier_id = $1
       AND invoice_date = $2
       AND total_halalas = $3
       AND deleted_at IS NULL
       AND status <> 'cancelled'
     LIMIT 5`,
    [supplierId, invoiceDate, totalHalalas]
  );
  return rows;
};

const enrich = async (client, row, actor, overrides = {}) => {
  const payload = { ...emptyPayload(), ...(row.corrected_payload || row.raw_payload || {}), ...overrides.payload };
  const supplierMatch = overrides.supplier_match || await matchSuppliers(client, payload);
  const supplierId = overrides.supplier_id
    || payload.supplier_id
    || supplierMatch.supplier?.id
    || null;
  const usesCash = Boolean(overrides.uses_cash_unregistered || payload.uses_cash_unregistered);
  const duplicate = await findDuplicate(client, supplierId, payload.supplier_invoice_number);
  const { warnings, computed } = buildWarnings(payload, {
    supplier_id: usesCash ? 'cash' : supplierId,
    uses_cash_unregistered: usesCash,
    duplicate,
    similar: await findSimilar(client, supplierId, payload.invoice_date, computedSafe(payload).total_halalas),
    supplier_candidates: supplierMatch.candidates,
  });
  return toPublic(row, {
    payload: { ...payload, supplier_id: supplierId, uses_cash_unregistered: usesCash },
    warnings,
    computed: {
      subtotal_halalas: computed.subtotal_halalas,
      discount_halalas: computed.discount_halalas,
      vat_halalas: computed.vat_halalas,
      total_halalas: computed.total_halalas,
      extracted_total_halalas: payload.total_sar == null ? null : Math.round(Number(payload.total_sar) * 100),
      difference_halalas: payload.total_sar == null
        ? null
        : Math.round(Number(payload.total_sar) * 100) - computed.total_halalas,
    },
    supplier_match: supplierMatch,
    can_confirm: canConfirm(warnings),
  });
};

const computedSafe = (payload) => {
  try {
    return require('../utils/invoice-extraction-contract').computeFromItems(payload);
  } catch {
    return { total_halalas: null };
  }
};

const createFromUpload = async (file, actor, reqOrOptions, maybeOptions) => {
  const options = pickOptions(reqOrOptions, maybeOptions);
  const req = requestOf(reqOrOptions, options);
  assertPerm(actor, 'purchases.create');
  await assertExtractionReady(options.client);
  const sniffed = sniffPurchaseFile(file.buffer, file.originalname);
  const pages = countPdfPages(file.buffer);
  const maxPages = Number(env.invoiceExtraction?.maxPages || 8);
  if (sniffed.mime === 'application/pdf' && pages > maxPages) {
    throw new AppError(`PDF exceeds ${maxPages} pages`, 400, 'PDF_TOO_MANY_PAGES');
  }
  let saved = null;
  try {
    saved = await saveFile(file.buffer, 'purchases', `${safeOriginalName(file.originalname)}${sniffed.ext}`);
    return await withClient(options.client, async (client) => {
      const { rows } = await client.query(
        `INSERT INTO purchase_invoice_extractions (
           status, file_url, original_name, mime_type, size_bytes, page_count, created_by
         ) VALUES ('queued', $1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [saved.url, safeOriginalName(file.originalname), sniffed.mime, file.buffer.length, pages, actorIdOf(actor)]
      );
      await purchasesAudit.logPurchaseAudit(client, {
        userId: actorIdOf(actor),
        action: 'upload_purchase_extraction',
        entityType: 'purchase_invoice_extraction',
        entityId: rows[0].id,
        newValues: { original_name: rows[0].original_name, mime_type: rows[0].mime_type, size_bytes: rows[0].size_bytes },
        req,
      });
      return toPublic(rows[0], { payload: emptyPayload() });
    });
  } catch (err) {
    if (saved?.url) {
      try { await deleteFile(saved.url); } catch (_) { /* ignore */ }
    }
    throwIfTableMissing(err);
    throw err;
  }
};

const processExtraction = async (id, actor, reqOrOptions, maybeOptions) => {
  const options = pickOptions(reqOrOptions, maybeOptions);
  const extra = (maybeOptions && typeof maybeOptions === 'object') ? maybeOptions : {};
  const req = requestOf(reqOrOptions, options);
  assertPerm(actor, 'purchases.create');
  await assertExtractionReady(options.client || extra.client);
  const retry = Boolean(extra.retry);
  const leaseMs = leaseMsOf(extra);
  const provider = createInvoiceExtractionProvider(extra);
  if (!extra.provider && !isInvoiceExtractionEnabled()) {
    throw new AppError('Purchase invoice extraction is disabled', 503, 'INVOICE_EXTRACTION_DISABLED');
  }
  if (!provider.configured) {
    throw new AppError('Purchase invoice extraction is disabled', 503, 'INVOICE_EXTRACTION_DISABLED');
  }

  const claimed = await withClient(options.client || extra.client, async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM purchase_invoice_extractions WHERE id = $1 FOR UPDATE',
      [id]
    );
    const row = rows[0];
    assertVisible(row, actor);
    const stale = isStaleProcessing(row, Date.now(), leaseMs);
    const canRecoverStale = row.status === 'processing' && stale && retry;
    const canRetryFailed = row.status === 'failed' && retry;
    const canStartQueued = row.status === 'queued';
    if (!canStartQueued && !canRetryFailed && !canRecoverStale) {
      return { skip: true, row };
    }
    const { rows: updated } = await client.query(
      `UPDATE purchase_invoice_extractions
       SET status = 'processing',
           started_at = NOW(),
           processing_lease_until = NOW() + ($3 * INTERVAL '1 millisecond'),
           provider_sent_at = NOW(),
           processed_by = $2,
           error_code = NULL,
           error_message = NULL,
           updated_at = NOW()
       WHERE id = $1
         AND (
           status = 'queued'
           OR (status = 'failed' AND $4)
           OR (
             status = 'processing'
             AND $4
             AND (
               (processing_lease_until IS NOT NULL AND processing_lease_until < NOW())
               OR (
                 processing_lease_until IS NULL
                 AND started_at IS NOT NULL
                 AND started_at < NOW() - ($3 * INTERVAL '1 millisecond')
               )
             )
           )
         )
       RETURNING *`,
      [id, actorIdOf(actor), leaseMs, retry]
    );
    if (!updated[0]) {
      const latest = await loadRow(client, id);
      return { skip: true, row: latest || row };
    }
    const action = canRecoverStale
      ? 'recover_purchase_extraction'
      : (canRetryFailed ? 'retry_purchase_extraction' : 'process_purchase_extraction');
    await purchasesAudit.logPurchaseAudit(client, {
      userId: actorIdOf(actor),
      action,
      entityType: 'purchase_invoice_extraction',
      entityId: id,
      oldValues: { status: row.status },
      newValues: { status: 'processing', recovered: canRecoverStale, retry: canRetryFailed },
      req,
    });
    return { skip: false, row: updated[0] };
  });

  if (claimed.skip) {
    return enrich(options.client || extra.client, claimed.row, actor);
  }

  try {
    const stream = await createReadStream(claimed.row.file_url);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    const result = await provider.extract({
      buffer,
      mimeType: claimed.row.mime_type,
      originalName: claimed.row.original_name,
    });
    const parsed = parseProviderJson(result.raw);
    return await withClient(options.client || extra.client, async (client) => {
      const { rows } = await client.query(
        `UPDATE purchase_invoice_extractions
         SET status = 'needs_review',
             raw_payload = $2,
             corrected_payload = $2,
             overall_confidence = $3,
             provider_name = $4,
             model_version = $5,
             processing_lease_until = NULL,
             finished_at = NOW(),
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
          id,
          JSON.stringify(parsed),
          parsed.overall_confidence,
          result.providerName || provider.name,
          result.modelVersion || provider.modelVersion,
        ]
      );
      return enrich(client, rows[0], actor);
    });
  } catch (err) {
    throwIfTableMissing(err);
    await withClient(options.client || extra.client, async (client) => {
      await client.query(
        `UPDATE purchase_invoice_extractions
         SET status = 'failed',
             error_code = $2,
             error_message = $3,
             processing_lease_until = NULL,
             finished_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [id, err.code || 'EXTRACTION_PROVIDER_FAILED', sanitizeExtractionMessage(err)]
      );
    });
    throw err;
  }
};

const getById = async (id, actor, options = {}) => {
  await assertExtractionReady(options.client);
  const row = await loadRow(options.client, id);
  assertVisible(row, actor);
  return enrich(options.client, row, actor);
};

const list = async (filters, actor, options = {}) => {
  await assertExtractionReady(options.client);
  const params = [];
  const where = [];
  if (!canSeeAll(actor)) {
    params.push(actorIdOf(actor));
    where.push(`created_by = $${params.length}`);
  }
  if (filters.status && STATUSES.includes(filters.status)) {
    params.push(filters.status);
    where.push(`status = $${params.length}`);
  }
  const sql = `
    SELECT * FROM purchase_invoice_extractions
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY created_at DESC
    LIMIT 50
  `;
  const { rows } = await runQuery(options.client, sql, params);
  return { data: rows.map((row) => toPublic(row)) };
};

const correct = async (id, patch, actor, reqOrOptions, maybeOptions) => {
  const options = pickOptions(reqOrOptions, maybeOptions);
  const req = requestOf(reqOrOptions, options);
  assertPerm(actor, 'purchases.create');
  await assertExtractionReady(options.client);
  return withClient(options.client, async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM purchase_invoice_extractions WHERE id = $1 FOR UPDATE',
      [id]
    );
    const row = rows[0];
    assertVisible(row, actor);
    if (!['needs_review', 'failed'].includes(row.status)) {
      throw new AppError('Extraction cannot be edited in its current status', 409, 'EXTRACTION_LOCKED');
    }
    const current = { ...emptyPayload(), ...(row.corrected_payload || row.raw_payload || {}) };
    const next = parseProviderJson({ ...current, ...patch.payload, items: patch.payload?.items || current.items });
    if (patch.supplier_id) next.supplier_id = patch.supplier_id;
    if (patch.uses_cash_unregistered != null) next.uses_cash_unregistered = Boolean(patch.uses_cash_unregistered);
    const { rows: updated } = await client.query(
      `UPDATE purchase_invoice_extractions
       SET corrected_payload = $2,
           reviewed_by = $3,
           status = 'needs_review',
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, JSON.stringify(next), actorIdOf(actor)]
    );
    await purchasesAudit.logPurchaseAudit(client, {
      userId: actorIdOf(actor),
      action: 'correct_purchase_extraction',
      entityType: 'purchase_invoice_extraction',
      entityId: id,
      oldValues: { status: row.status },
      newValues: { status: 'needs_review' },
      req,
    });
    return enrich(client, updated[0], actor, {
      payload: next,
      supplier_id: patch.supplier_id,
      uses_cash_unregistered: patch.uses_cash_unregistered,
    });
  });
};

const confirm = async (id, body, actor, reqOrOptions, maybeOptions) => {
  const options = pickOptions(reqOrOptions, maybeOptions);
  const req = requestOf(reqOrOptions, options);
  assertPerm(actor, 'purchases.create');
  await assertExtractionReady(options.client);
  return withClient(options.client, async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM purchase_invoice_extractions WHERE id = $1 FOR UPDATE',
      [id]
    );
    const row = rows[0];
    assertVisible(row, actor);
    if (row.status === 'completed' && row.purchase_invoice_id) {
      const draft = await purchases.getById(row.purchase_invoice_id, actor, { client });
      return { ...await enrich(client, row, actor), draft };
    }
    if (row.status !== 'needs_review') {
      throw new AppError('Human review is required before creating a draft', 409, 'REVIEW_REQUIRED');
    }
    const payload = parseProviderJson({
      ...(row.corrected_payload || row.raw_payload || {}),
      ...(body.payload || {}),
      items: body.payload?.items || (row.corrected_payload || row.raw_payload || {}).items,
    });
    const usesCash = Boolean(body.uses_cash_unregistered || payload.uses_cash_unregistered);
    const supplierId = usesCash ? null : (body.supplier_id || payload.supplier_id);
    const publicRow = await enrich(client, row, actor, {
      payload,
      supplier_id: supplierId,
      uses_cash_unregistered: usesCash,
    });
    if (!publicRow.can_confirm) {
      throw new AppError('Required extraction fields must be corrected first', 400, 'EXTRACTION_NOT_READY');
    }
    const draftBody = toDraftBody(payload, {
      supplier_id: supplierId,
      uses_cash_unregistered: usesCash,
    });
    const draft = body.purchase_invoice_id
      ? await purchases.update(body.purchase_invoice_id, draftBody, actor, req, { client })
      : await purchases.create(draftBody, actor, req, { client });
    if (draft.status !== 'draft') {
      throw new AppError('Extraction can only create a draft', 500, 'DRAFT_REQUIRED');
    }
    await client.query(
      `INSERT INTO purchase_invoice_attachments (
         purchase_invoice_id, file_url, original_name, mime_type, size_bytes, uploaded_by
       ) VALUES ($1,$2,$3,$4,$5,$6)`,
      [draft.id, row.file_url, row.original_name, row.mime_type, row.size_bytes, actorIdOf(actor)]
    );
    const { rows: done } = await client.query(
      `UPDATE purchase_invoice_extractions
       SET status = 'completed',
           corrected_payload = $2,
           purchase_invoice_id = $3,
           confirmed_by = $4,
           updated_at = NOW(),
           finished_at = COALESCE(finished_at, NOW())
       WHERE id = $1
       RETURNING *`,
      [id, JSON.stringify(payload), draft.id, actorIdOf(actor)]
    );
    await purchasesAudit.logPurchaseAudit(client, {
      userId: actorIdOf(actor),
      action: 'confirm_purchase_extraction',
      entityType: 'purchase_invoice_extraction',
      entityId: id,
      oldValues: { status: 'needs_review' },
      newValues: { status: 'completed', purchase_invoice_id: draft.id },
      req,
    });
    return { ...await enrich(client, done[0], actor, { payload, supplier_id: supplierId, uses_cash_unregistered: usesCash }), draft };
  });
};

const openFile = async (id, actor, options = {}) => {
  await assertExtractionReady(options.client);
  const row = await loadRow(options.client, id);
  assertVisible(row, actor);
  const stream = await createReadStream(row.file_url);
  return {
    stream,
    mime_type: row.mime_type,
    original_name: row.original_name,
  };
};

/**
 * Proposed cleanup for failed/queued extractions past retention.
 * Default dryRun=true. Not wired to cron, migrate.js, or process startup.
 * Never deletes a file referenced by a purchase draft attachment or a completed extraction.
 */
const proposedCleanupExpiredExtractions = async ({
  client,
  dryRun = true,
  olderThanDays,
  now,
  deleteFileFn,
} = {}) => {
  await assertExtractionReady(client);
  const days = Number(olderThanDays ?? env.invoiceExtraction?.retentionDays ?? 30);
  const cutoff = new Date((now || Date.now()) - (days * 24 * 60 * 60 * 1000));
  const { rows } = await runQuery(
    client,
    `SELECT *
     FROM purchase_invoice_extractions
     WHERE status IN ('failed', 'queued')
       AND purchase_invoice_id IS NULL
       AND updated_at < $1`,
    [cutoff.toISOString()]
  );
  const plannedExtractionIds = [];
  const plannedFileUrls = [];
  const skippedFileUrls = [];
  for (const row of rows) {
    plannedExtractionIds.push(row.id);
    const attached = await runQuery(
      client,
      `SELECT 1 FROM purchase_invoice_attachments WHERE file_url = $1 LIMIT 1`,
      [row.file_url]
    );
    const completedUses = await runQuery(
      client,
      `SELECT 1 FROM purchase_invoice_extractions
       WHERE file_url = $1 AND status = 'completed' AND id <> $2
       LIMIT 1`,
      [row.file_url, row.id]
    );
    if (attached.rows[0] || completedUses.rows[0]) {
      skippedFileUrls.push(row.file_url);
    } else if (row.file_url) {
      plannedFileUrls.push(row.file_url);
    }
  }
  if (dryRun) {
    return {
      dryRun: true,
      deletedExtractionIds: [],
      plannedExtractionIds,
      plannedFileUrls,
      skippedFileUrls,
    };
  }
  const remover = deleteFileFn || deleteFile;
  for (const url of plannedFileUrls) {
    try { await remover(url); } catch (_) { /* missing file is not fatal */ }
  }
  if (plannedExtractionIds.length) {
    await runQuery(
      client,
      'DELETE FROM purchase_invoice_extractions WHERE id = ANY($1::uuid[]) AND status IN (\'failed\', \'queued\') AND purchase_invoice_id IS NULL',
      [plannedExtractionIds]
    );
  }
  return {
    dryRun: false,
    deletedExtractionIds: plannedExtractionIds,
    plannedExtractionIds,
    plannedFileUrls,
    skippedFileUrls,
  };
};

module.exports = {
  createFromUpload,
  processExtraction,
  getById,
  list,
  correct,
  confirm,
  openFile,
  assertExtractionReady,
  proposedCleanupExpiredExtractions,
  isStaleProcessing,
};
