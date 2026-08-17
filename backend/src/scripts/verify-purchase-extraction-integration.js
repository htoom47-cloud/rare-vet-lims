/**
 * Local PostgreSQL integration for purchase invoice extraction.
 * Isolated schema. Transactions ROLLBACK. Refuses hosted databases.
 * Usage: node src/scripts/verify-purchase-extraction-integration.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const envCandidates = [
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../../../rare-vet-lims/backend/.env'),
];
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
    break;
  }
}

const { resetSuppliersSchemaCache } = require('../utils/suppliers-schema');
const { resetPurchasesSchemaCache } = require('../utils/purchases-schema');
const { AppError } = require('../middleware/errorHandler');

const splitSqlStatements = (sql) => {
  const parts = [];
  let current = '';
  for (let i = 0; i < sql.length; i += 1) {
    if (sql[i] === ';') {
      const statement = current.trim();
      if (statement && !statement.split('\n').every((line) => !line.trim() || line.trim().startsWith('--'))) {
        parts.push(statement);
      }
      current = '';
      continue;
    }
    current += sql[i];
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
};

const refuseIfNotLocalTestDb = () => {
  const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '';
  const host = process.env.DB_HOST || process.env.PGHOST || 'localhost';
  if (/render\.com|amazonaws|railway\.app|neon\.tech|supabase|onrender\.com/i.test(url)) {
    throw new Error('REFUSED: connection looks like a hosted/production database');
  }
  if (url && !/localhost|127\.0\.0\.1/i.test(url)) {
    throw new Error('REFUSED: DATABASE_URL/TEST_DATABASE_URL is not a local host');
  }
  if (!url && !/localhost|127\.0\.0\.1/i.test(host)) {
    throw new Error('REFUSED: DB_HOST is not local');
  }
};

const setSearchPath = (client, schema) => client.query(`SET search_path TO ${schema}, public`);
const skipCatalog = (statement) => (
  /INSERT INTO permissions|INSERT INTO role_permissions|INSERT INTO roles/i.test(statement)
);
const applySql = async (client, sql) => {
  for (const statement of splitSqlStatements(sql)) {
    if (skipCatalog(statement)) continue;
    await client.query(statement);
  }
};

const jpeg = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(32, 1)]);
const pdf3 = Buffer.from('%PDF-1.4\n/Type /Page\n/Type /Page\n/Type /Page\n');

const payloadFor = (kind) => {
  const base = {
    supplier_name: 'Acme Labs',
    supplier_name_en: 'Acme Labs',
    supplier_name_ar: 'مختبرات أكمي',
    supplier_tax_number: '300000000000003',
    supplier_invoice_number: `EXT-${kind}`,
    invoice_date: '2026-08-15',
    currency: 'SAR',
    payment_method: 'cash',
    items: [{ description: 'Reagent', quantity: 1, unit_price_sar: 10, discount_sar: 0, tax_category: 'standard', tax_rate: 15, vat_sar: 1.5, line_total_sar: 11.5, confidence: 0.9 }],
    subtotal_sar: 10,
    discount_sar: 0,
    vat_sar: 1.5,
    total_sar: 11.5,
    field_confidence: { supplier_tax_number: 0.9, supplier_invoice_number: 0.9, invoice_date: 0.9, total_sar: 0.9 },
    overall_confidence: 0.88,
  };
  if (kind === 'ar') return { ...base, supplier_name: 'مؤسسة النادر', items: [{ ...base.items[0], description: 'كاشف كيميائي' }] };
  if (kind === 'en') return base;
  if (kind === 'mix') {
    return {
      ...base,
      items: [
        { description: 'تحليل', quantity: 1, unit_price_sar: 10, tax_category: 'standard', tax_rate: 15, vat_sar: 1.5, line_total_sar: 11.5, confidence: 0.8 },
        { description: 'Control', quantity: 1, unit_price_sar: 10, tax_category: 'exempt', tax_rate: 0, vat_sar: 0, line_total_sar: 10, confidence: 0.55 },
      ],
      vat_sar: 1.5,
      total_sar: 21.5,
      subtotal_sar: 20,
    };
  }
  if (kind === 'novat') {
    return {
      ...base,
      supplier_tax_number: '',
      items: [{ description: 'Petty', quantity: 1, unit_price_sar: 5, tax_category: 'out_of_scope', tax_rate: 0, vat_sar: 0, line_total_sar: 5, confidence: 0.8 }],
      vat_sar: 0,
      total_sar: 5,
      subtotal_sar: 5,
    };
  }
  if (kind === 'mismatch') return { ...base, total_sar: 50 };
  if (kind === 'lowq') {
    return { ...base, field_confidence: { supplier_invoice_number: 0.4, invoice_date: 0.3, total_sar: 0.4 }, overall_confidence: 0.35 };
  }
  if (kind === 'invalid') return { sql: 'DROP', items: 'nope' };
  return base;
};

const run = async () => {
  refuseIfNotLocalTestDb();
  resetSuppliersSchemaCache();
  resetPurchasesSchemaCache();
  const db = require('../config/database');
  const extraction = require('../services/purchase-extraction.service');
  const purchases = require('../services/purchases.service');
  const suppliers = require('../services/suppliers.service');
  const purchasesAudit = require('../utils/purchases-audit');

  const suppliersSql = fs.readFileSync(path.join(__dirname, '../../migrations/proposed-suppliers.sql'), 'utf8');
  const purchasesSql = fs.readFileSync(path.join(__dirname, '../../migrations/proposed-purchase-invoices.sql'), 'utf8');
  const extractionSql = fs.readFileSync(path.join(__dirname, '../../migrations/proposed-purchase-invoice-extraction.sql'), 'utf8');

  const schema = `extract_sec_${Date.now()}`;
  const setup = await db.getClient();
  try {
    await setup.query(`CREATE SCHEMA ${schema}`);
    await setSearchPath(setup, schema);
    await applySql(setup, suppliersSql);
    await applySql(setup, purchasesSql);
    await applySql(setup, extractionSql);
    await applySql(setup, extractionSql);
  } finally {
    setup.release();
  }

  const userLookup = await db.getClient();
  let userId;
  try {
    userId = (await userLookup.query('SELECT id FROM users LIMIT 1')).rows[0]?.id;
  } finally {
    userLookup.release();
  }
  if (!userId) {
    const cleanup = await db.getClient();
    try { await cleanup.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); } finally { cleanup.release(); }
    throw new Error('local DB has no users');
  }

  const purchaser = { id: userId, role_name: 'purchaser', permissions: ['purchases.view', 'purchases.create', 'suppliers.view'] };
  const other = { id: '00000000-0000-4000-8000-000000000099', role_name: 'purchaser', permissions: ['purchases.view', 'purchases.create'] };
  const accountant = { id: userId, role_name: 'accountant', permissions: ['purchases.view', 'purchases.create', 'purchases.approve', 'purchases.cancel'] };

  const fakeFor = (kind, calls) => ({
    name: 'fake',
    modelVersion: 'test-1',
    configured: true,
    async extract({ originalName }) {
      calls.count += 1;
      if (kind === 'timeout') {
        const err = new AppError('Extraction provider timed out', 504, 'EXTRACTION_PROVIDER_TIMEOUT');
        throw err;
      }
      if (kind === 'invalid') return { raw: payloadFor('invalid'), providerName: 'fake', modelVersion: 'test-1' };
      const name = String(originalName || kind);
      const key = ['ar', 'en', 'mix', 'novat', 'mismatch', 'lowq', 'pdf'].find((item) => name.includes(item)) || kind;
      return { raw: payloadFor(key === 'pdf' ? 'en' : key), providerName: 'fake', modelVersion: 'test-1' };
    },
  });

  const client = await db.getClient();
  let rolledBack = false;
  try {
    await setSearchPath(client, schema);
    await client.query('BEGIN');

    const quick = await suppliers.createQuick({
      name: 'Acme Labs',
      tax_number: '300000000000003',
      confirm: true,
    }, userId, null, { client });

    const runKind = async (kind, file, originalname) => {
      const calls = { count: 0 };
      const created = await extraction.createFromUpload({ buffer: file, originalname }, purchaser, null, { client });
      assert.equal(created.status, 'queued');
      const processed = await extraction.processExtraction(created.id, purchaser, null, {
        client,
        provider: fakeFor(kind, calls),
      });
      return { created, processed, calls };
    };

    const ar = await runKind('ar', jpeg, 'ar.jpg');
    assert.equal(ar.processed.status, 'needs_review');
    assert.equal(ar.processed.payload.items[0].description, 'كاشف كيميائي');
    assert.equal(ar.processed.draft, undefined);

    const en = await runKind('en', jpeg, 'en.jpg');
    assert.equal(en.processed.payload.supplier_name, 'Acme Labs');

    const mix = await runKind('mix', jpeg, 'mix.jpg');
    assert.equal(mix.processed.payload.items.length, 2);
    assert.ok(mix.processed.warnings.some((w) => w.code === 'LOW_CONFIDENCE'));

    const novat = await runKind('novat', jpeg, 'novat.jpg');
    assert.equal(novat.processed.computed.vat_halalas, 0);

    const mismatch = await runKind('mismatch', jpeg, 'mismatch.jpg');
    assert.ok(mismatch.processed.warnings.some((w) => w.code === 'TOTALS_MISMATCH'));

    const lowq = await runKind('lowq', jpeg, 'lowq.jpg');
    assert.ok(lowq.processed.warnings.some((w) => w.code === 'LOW_CONFIDENCE'));

    const pdf = await runKind('pdf', pdf3, 'multi.pdf');
    assert.equal(pdf.created.page_count, 3);
    assert.equal(pdf.processed.status, 'needs_review');

    const timeoutCalls = { count: 0 };
    const timeoutRow = await extraction.createFromUpload({ buffer: jpeg, originalname: 'timeout.jpg' }, purchaser, null, { client });
    await assert.rejects(
      () => extraction.processExtraction(timeoutRow.id, purchaser, null, { client, provider: fakeFor('timeout', timeoutCalls) }),
      (err) => err.code === 'EXTRACTION_PROVIDER_TIMEOUT'
    );

    const badRow = await extraction.createFromUpload({ buffer: jpeg, originalname: 'invalid.jpg' }, purchaser, null, { client });
    await assert.rejects(
      () => extraction.processExtraction(badRow.id, purchaser, null, { client, provider: fakeFor('invalid', { count: 0 }) }),
      (err) => err.code === 'EXTRACTION_PAYLOAD_INVALID'
    );

    let hidden = false;
    try {
      await extraction.getById(ar.processed.id, other, { client });
    } catch (err) {
      hidden = err.code === 'NOT_FOUND';
    }
    assert.ok(hidden, 'purchaser must not see another extraction');
    const seen = await extraction.getById(ar.processed.id, accountant, { client });
    assert.equal(seen.id, ar.processed.id);

    const calls = { count: 0 };
    const once = await extraction.createFromUpload({ buffer: jpeg, originalname: 'en.jpg' }, purchaser, null, { client });
    const provider = fakeFor('en', calls);
    const first = await extraction.processExtraction(once.id, purchaser, null, { client, provider });
    const second = await extraction.processExtraction(once.id, purchaser, null, { client, provider });
    assert.equal(first.status, 'needs_review');
    assert.equal(second.status, 'needs_review');
    assert.equal(calls.count, 1, 'reload/process must not send the file twice');

    const ready = await extraction.correct(en.processed.id, {
      payload: en.processed.payload,
      supplier_id: quick.id,
    }, purchaser, null, { client });
    assert.equal(ready.status, 'needs_review');
    const confirmed = await extraction.confirm(en.processed.id, {
      payload: en.processed.payload,
      supplier_id: quick.id,
    }, purchaser, null, { client });
    assert.equal(confirmed.status, 'completed');
    assert.equal(confirmed.draft.status, 'draft');
    assert.ok(confirmed.draft.approved_at == null);

    const missing = await suppliers.searchQuick({ tax_number: '399999999999993' }, { client });
    assert.equal(missing.data.length, 0);

    const disabledRow = await extraction.createFromUpload({ buffer: jpeg, originalname: 'en.jpg' }, purchaser, null, { client });
    await assert.rejects(
      () => extraction.processExtraction(disabledRow.id, purchaser, null, {
        client,
        config: { provider: 'off', apiKey: '' },
      }),
      (err) => err.code === 'INVOICE_EXTRACTION_DISABLED'
    );
    const disabledStatus = await client.query('SELECT status FROM purchase_invoice_extractions WHERE id = $1', [disabledRow.id]);
    assert.equal(disabledStatus.rows[0].status, 'queued');

    const liveRow = await extraction.createFromUpload({ buffer: jpeg, originalname: 'en.jpg' }, purchaser, null, { client });
    await client.query(
      `UPDATE purchase_invoice_extractions
       SET status = 'processing', started_at = NOW(), processing_lease_until = NOW() + INTERVAL '2 minutes'
       WHERE id = $1`,
      [liveRow.id]
    );
    const liveCalls = { count: 0 };
    const liveSkipped = await extraction.processExtraction(liveRow.id, purchaser, null, {
      client,
      provider: fakeFor('en', liveCalls),
      retry: true,
    });
    assert.equal(liveSkipped.status, 'processing');
    assert.equal(liveCalls.count, 0, 'fresh processing lease must not send again');

    const staleRow = await extraction.createFromUpload({ buffer: jpeg, originalname: 'en.jpg' }, purchaser, null, { client });
    await client.query(
      `UPDATE purchase_invoice_extractions
       SET status = 'processing',
           started_at = NOW() - INTERVAL '10 minutes',
           processing_lease_until = NOW() - INTERVAL '1 second'
       WHERE id = $1`,
      [staleRow.id]
    );
    const staleCalls = { count: 0 };
    const staleHeld = await extraction.processExtraction(staleRow.id, purchaser, null, {
      client,
      provider: fakeFor('en', staleCalls),
    });
    assert.equal(staleHeld.status, 'processing');
    assert.equal(staleCalls.count, 0, 'stale processing waits for explicit retry');
    const recovered = await extraction.processExtraction(staleRow.id, purchaser, null, {
      client,
      provider: fakeFor('en', staleCalls),
      retry: true,
    });
    assert.equal(recovered.status, 'needs_review');
    assert.equal(staleCalls.count, 1);
    const recoveredAudit = await client.query(
      `SELECT action FROM audit_logs WHERE entity_id = $1 AND action = 'recover_purchase_extraction'`,
      [staleRow.id]
    );
    assert.ok(recoveredAudit.rows.length >= 1);

    const leakCalls = { count: 0 };
    const leakRow = await extraction.createFromUpload({ buffer: jpeg, originalname: 'en.jpg' }, purchaser, null, { client });
    await assert.rejects(
      () => extraction.processExtraction(leakRow.id, purchaser, null, {
        client,
        provider: {
          name: 'fake',
          configured: true,
          async extract() {
            leakCalls.count += 1;
            const err = new AppError('failed sk-secret /uploads/purchases/hidden.jpg', 503, 'EXTRACTION_PROVIDER_FAILED');
            throw err;
          },
        },
      }),
      (err) => err.code === 'EXTRACTION_PROVIDER_FAILED'
    );
    const leakStored = await client.query(
      'SELECT error_message FROM purchase_invoice_extractions WHERE id = $1',
      [leakRow.id]
    );
    assert.ok(!/sk-secret/.test(leakStored.rows[0].error_message));
    assert.ok(!/\/uploads\/purchases/.test(leakStored.rows[0].error_message));

    const attachment = await client.query(
      'SELECT file_url FROM purchase_invoice_attachments WHERE purchase_invoice_id = $1',
      [confirmed.draft.id]
    );
    const confirmedUrl = attachment.rows[0].file_url;
    await client.query(
      `UPDATE purchase_invoice_extractions
       SET status = 'failed',
           file_url = $2,
           purchase_invoice_id = NULL,
           updated_at = NOW() - INTERVAL '40 days'
       WHERE id = $1`,
      [timeoutRow.id, confirmedUrl]
    );
    const deletedFiles = [];
    const cleaned = await extraction.proposedCleanupExpiredExtractions({
      client,
      dryRun: false,
      olderThanDays: 30,
      deleteFileFn: async (url) => { deletedFiles.push(url); },
    });
    assert.ok(cleaned.skippedFileUrls.includes(confirmedUrl));
    assert.ok(!deletedFiles.includes(confirmedUrl));
    assert.ok(cleaned.deletedExtractionIds.includes(timeoutRow.id));
    const attachmentStill = await client.query(
      'SELECT 1 FROM purchase_invoice_attachments WHERE file_url = $1',
      [confirmedUrl]
    );
    assert.equal(attachmentStill.rows.length, 1);

    await client.query('ROLLBACK');
    rolledBack = true;
    console.log('  ok  extraction upload, review, confirm-to-draft, isolation, ROLLBACK');
  } catch (err) {
    if (!rolledBack) {
      try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    }
    throw err;
  } finally {
    client.release();
  }

  const originalGetClient = db.getClient;
  const originalAudit = purchasesAudit.logPurchaseAudit;
  db.getClient = async () => {
    const next = await originalGetClient();
    await next.query(`SET search_path TO ${schema}, public`);
    return next;
  };
  try {
    const created = await extraction.createFromUpload({ buffer: jpeg, originalname: 'en.jpg' }, purchaser);
    purchasesAudit.logPurchaseAudit = async () => { throw new Error('audit failed'); };
    await assert.rejects(
      () => extraction.processExtraction(created.id, purchaser, null, {
        provider: fakeFor('en', { count: 0 }),
      }),
      /audit failed/
    );
    const check = await originalGetClient();
    try {
      await check.query(`SET search_path TO ${schema}, public`);
      const row = await check.query('SELECT status FROM purchase_invoice_extractions WHERE id = $1', [created.id]);
      assert.equal(row.rows[0].status, 'queued');
      await check.query('DELETE FROM purchase_invoice_extractions WHERE id = $1', [created.id]);
    } finally {
      check.release();
    }
    console.log('  ok  audit failure rolls back process claim');
  } finally {
    purchasesAudit.logPurchaseAudit = originalAudit;
    db.getClient = originalGetClient;
  }

  db.getClient = async () => {
    const next = await originalGetClient();
    await next.query(`SET search_path TO ${schema}, public`);
    return next;
  };
  try {
    const created = await extraction.createFromUpload({ buffer: jpeg, originalname: 'en.jpg' }, purchaser);
    const calls = { count: 0 };
    let releaseGate;
    const gate = new Promise((resolve) => { releaseGate = resolve; });
    let markStarted;
    const started = new Promise((resolve) => { markStarted = resolve; });
    const provider = {
      name: 'fake',
      configured: true,
      modelVersion: 'test-1',
      async extract() {
        calls.count += 1;
        markStarted();
        await gate;
        return { raw: payloadFor('en'), providerName: 'fake', modelVersion: 'test-1' };
      },
    };
    const first = extraction.processExtraction(created.id, purchaser, null, { provider });
    await started;
    const second = await extraction.processExtraction(created.id, purchaser, null, { provider });
    releaseGate();
    const firstResult = await first;
    assert.equal(firstResult.status, 'needs_review');
    assert.equal(second.status, 'processing');
    assert.equal(calls.count, 1, 'concurrent process must send the file once');
    console.log('  ok  concurrent process sends the file once');
  } finally {
    db.getClient = originalGetClient;
  }

  const cleanup = await db.getClient();
  try {
    await cleanup.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  } finally {
    cleanup.release();
    resetSuppliersSchemaCache();
    resetPurchasesSchemaCache();
    await db.pool.end();
  }
};

run()
  .then(() => {
    console.log('\n=== Purchase extraction integration: RAN and passed (transactions rolled back) ===\n');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
