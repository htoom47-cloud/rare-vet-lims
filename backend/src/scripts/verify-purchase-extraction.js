/**
 * Purchase invoice extraction — static checks. No database writes.
 * Usage: node src/scripts/verify-purchase-extraction.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {
  parseProviderJson,
  buildWarnings,
  canConfirm,
  toDraftBody,
  countPdfPages,
  stripUntrustedKeys,
  sanitizeExtractionMessage,
} = require('../utils/invoice-extraction-contract');
const { createInvoiceExtractionProvider, isInvoiceExtractionEnabled } = require('../utils/invoice-extraction.provider');
const { createOpenAIInvoiceExtractionProvider, parseRetryAfterMs } = require('../utils/providers/openai-invoice-extraction.provider');

const root = path.join(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

let passed = 0;
let failed = 0;
const check = (name, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL ${name}`);
    console.error(`       ${err.message}`);
  }
};

const checkAsync = async (name, fn) => {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL ${name}`);
    console.error(`       ${err.message}`);
  }
};

const vat15 = {
  supplier_name: 'Acme Labs',
  supplier_name_en: 'Acme Labs',
  supplier_name_ar: 'مختبرات أكمي',
  supplier_tax_number: '300000000000003',
  supplier_invoice_number: 'INV-AR-1',
  invoice_date: '2026-08-15',
  currency: 'SAR',
  payment_method: 'cash',
  items: [{ description: 'Reagent', quantity: 1, unit_price_sar: 10, discount_sar: 0, tax_category: 'standard', tax_rate: 15, vat_sar: 1.5, line_total_sar: 11.5, confidence: 0.9 }],
  subtotal_sar: 10,
  discount_sar: 0,
  vat_sar: 1.5,
  total_sar: 11.5,
  field_confidence: { supplier_tax_number: 0.95, supplier_invoice_number: 0.9, invoice_date: 0.9, total_sar: 0.9 },
  overall_confidence: 0.9,
};

console.log('\n=== Extraction contract ===\n');

check('Arabic + English mixed payload validates', () => {
  const parsed = parseProviderJson({
    ...vat15,
    supplier_name: 'مؤسسة النادر',
    items: [
      { description: 'تحليل', quantity: 2, unit_price_sar: 10, tax_category: 'standard', tax_rate: 15, confidence: 0.8 },
      { description: 'Slide pack', quantity: 1, unit_price_sar: 5, tax_category: 'exempt', tax_rate: 0, confidence: 0.6 },
    ],
  });
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.items[1].tax_category, 'exempt');
});

check('15% invoice identity holds', () => {
  const parsed = parseProviderJson(vat15);
  const { warnings, computed } = buildWarnings(parsed, { supplier_id: 's1' });
  assert.equal(computed.vat_halalas, 150);
  assert.equal(computed.total_halalas, 1150);
  assert.ok(!warnings.some((w) => w.code === 'TOTALS_MISMATCH'));
  assert.ok(canConfirm(warnings));
});

check('zero-VAT and mixed lines, mismatch, invalid tax, future date', () => {
  const zero = parseProviderJson({
    ...vat15,
    supplier_tax_number: '',
    items: [{ description: 'Petty', quantity: 1, unit_price_sar: 5, tax_category: 'out_of_scope', tax_rate: 0, vat_sar: 0, line_total_sar: 5, confidence: 0.8 }],
    vat_sar: 0,
    total_sar: 5,
    subtotal_sar: 5,
  });
  const zeroWarn = buildWarnings(zero, { uses_cash_unregistered: true, supplier_id: 'cash' });
  assert.equal(zeroWarn.computed.vat_halalas, 0);
  assert.ok(canConfirm(zeroWarn.warnings));

  const mismatch = parseProviderJson({ ...vat15, total_sar: 99 });
  const mis = buildWarnings(mismatch, { supplier_id: 's1' });
  assert.ok(mis.warnings.some((w) => w.code === 'TOTALS_MISMATCH'));

  const badTax = parseProviderJson({ ...vat15, supplier_tax_number: 'ABC' });
  const taxW = buildWarnings(badTax, { supplier_id: 's1' });
  assert.ok(taxW.warnings.some((w) => w.code === 'INVALID_TAX_NUMBER' && w.blocking));

  const future = parseProviderJson({ ...vat15, invoice_date: '2099-01-01' });
  const fut = buildWarnings(future, { supplier_id: 's1' });
  assert.ok(fut.warnings.some((w) => w.code === 'FUTURE_DATE' && w.blocking));
  assert.ok(!canConfirm(fut.warnings));
});

check('missing invoice number blocks confirm; draft mapping stays draft-shaped', () => {
  const parsed = parseProviderJson({ ...vat15, supplier_invoice_number: '' });
  const { warnings } = buildWarnings(parsed, { supplier_id: 's1' });
  assert.ok(!canConfirm(warnings));
  const body = toDraftBody(vat15, { supplier_id: '11111111-1111-1111-1111-111111111111' });
  assert.equal(body.supplier_invoice_number, 'INV-AR-1');
  assert.ok(!body.status);
});

check('prompt-injection keys and chain-of-thought are stripped', () => {
  const stripped = stripUntrustedKeys({
    supplier_name: 'X',
    sql: 'DROP TABLE',
    path: '/etc/passwd',
    status: 'approved',
    chain_of_thought: 'secret',
    permissions: ['admin'],
  });
  assert.equal(stripped.sql, undefined);
  assert.equal(stripped.status, undefined);
  assert.equal(stripped.chain_of_thought, undefined);
  assert.throws(() => parseProviderJson({ tax_rate: 5, items: 'bad' }), (err) => err.code === 'EXTRACTION_PAYLOAD_INVALID');
});

check('PDF page count and jpeg is one page', () => {
  const pdf = Buffer.from('%PDF-1.4\n/Type /Page\n/Type /Page\n/Type /Pages\n');
  assert.equal(countPdfPages(pdf), 2);
  assert.equal(countPdfPages(Buffer.from([0xFF, 0xD8, 0xFF])), 1);
});

check('extraction is disabled by default and ignores OPENAI_API_KEY', () => {
  const envSrc = read('src/config/env.js');
  assert.ok(/INVOICE_EXTRACTION_PROVIDER \|\| 'off'/.test(envSrc));
  assert.ok(/apiKey: process\.env\.INVOICE_EXTRACTION_OPENAI_API_KEY \|\| ''/.test(envSrc));
  assert.ok(!/process\.env\.OPENAI_API_KEY/.test(envSrc));
  assert.equal(isInvoiceExtractionEnabled({ provider: 'off', apiKey: 'sk-test' }), false);
  assert.equal(isInvoiceExtractionEnabled({ provider: 'openai', apiKey: '' }), false);
  assert.equal(isInvoiceExtractionEnabled({ provider: 'openai', apiKey: 'sk-test' }), true);
  assert.equal(createInvoiceExtractionProvider({ config: { provider: 'off', apiKey: 'sk-test' } }).name, 'disabled');
  assert.equal(createInvoiceExtractionProvider({ config: { provider: 'openai', apiKey: '' } }).configured, false);
  const factory = createOpenAIInvoiceExtractionProvider({ apiKey: '' });
  assert.equal(factory.configured, false);
});

check('proposed SQL is re-runnable, not wired to migrate.js, and has no inventory/ledger', () => {
  const sql = read('migrations/proposed-purchase-invoice-extraction.sql');
  const migrate = read('src/scripts/migrate.js');
  assert.ok(/purchase_invoice_extractions/.test(sql));
  assert.ok(/needs_review/.test(sql));
  assert.ok(/ADD COLUMN IF NOT EXISTS processing_lease_until/.test(sql));
  assert.ok(/ADD COLUMN IF NOT EXISTS status/.test(sql));
  assert.ok(/ADD COLUMN IF NOT EXISTS file_url/.test(sql));
  assert.ok(/ADD COLUMN IF NOT EXISTS raw_payload/.test(sql));
  assert.ok(/DROP CONSTRAINT IF EXISTS purchase_invoice_extractions_status_check/.test(sql));
  assert.ok(/INVOICE_EXTRACTION_RETENTION_DAYS|retain 30 days|30 days/.test(sql));
  assert.ok(!/chain.of.thought|reasoning/i.test(sql));
  assert.ok(!migrate.includes('proposed-purchase-invoice-extraction.sql'));
  assert.ok(!migrate.includes('proposed-cleanup-purchase-extractions'));
  assert.ok(!/adjustStock|ledger_entries/.test(sql));
  const routes = read('src/routes/purchases.routes.js');
  assert.ok(routes.indexOf("router.post('/extractions'") < routes.indexOf("router.get('/:id'"));
  const openai = read('src/utils/providers/openai-invoice-extraction.provider.js');
  assert.ok(/store:\s*false/.test(openai));
  assert.ok(!/console\.log\(.*apiKey|logger\.(info|debug)\(.*buffer/.test(openai));
  assert.ok(/untrusted data/.test(openai));
  const svc = read('src/services/purchase-extraction.service.js');
  assert.ok(svc.indexOf('INVOICE_EXTRACTION_DISABLED') < svc.indexOf('createReadStream(claimed'));
  assert.ok(/recover_purchase_extraction/.test(svc));
  assert.ok(/retry_purchase_extraction/.test(svc));
  const cleanup = read('src/scripts/proposed-cleanup-purchase-extractions.js');
  assert.ok(/process\.exit\(1\)/.test(cleanup));
  assert.ok(/dryRun/.test(cleanup));
});

check('errors never leak API keys or file URLs', () => {
  const cleaned = sanitizeExtractionMessage({
    message: 'failed sk-abc123Bearer tok /uploads/purchases/secret.jpg https://api.openai.com/v1/x',
  });
  assert.ok(!/sk-abc/.test(cleaned));
  assert.ok(!/\/uploads\/purchases/.test(cleaned));
  assert.ok(!/api\.openai\.com/.test(cleaned));
  assert.equal(parseRetryAfterMs('2', 0, 500, 8000), 2000);
  assert.equal(parseRetryAfterMs('999', 0, 500, 8000), 8000);
  assert.equal(parseRetryAfterMs(null, 0, 500, 8000), 500);
  assert.equal(parseRetryAfterMs(null, 1, 500, 8000), 1000);
});

check('UI uses create-draft copy, not approve, and is mobile-friendly', () => {
  const page = read('../frontend/src/pages/Purchases.jsx');
  const modal = read('../frontend/src/pages/PurchaseExtractionModal.jsx');
  const i18n = read('../frontend/src/i18n/index.js');
  assert.ok(/PurchaseExtractionModal/.test(page));
  assert.ok(/createDraft/.test(modal));
  assert.ok(!/purchasesAPI\.approve/.test(modal));
  assert.ok(/grid-cols-1 md:grid-cols-2/.test(modal));
  assert.ok(/capture="environment"/.test(modal));
  assert.ok(/processingLock/.test(modal));
  assert.ok(/استخراج البيانات من الفاتورة/.test(i18n));
  assert.ok(/Extract data from invoice/.test(i18n));
});

const openaiOk = (payload, model = 'gpt-5.6-terra') => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  json: async () => ({ output_text: JSON.stringify(payload), model }),
  text: async () => '',
});

const runAsync = async () => {
  await checkAsync('disabled provider does not call fetch', async () => {
    let calls = 0;
    const originalFetch = global.fetch;
    global.fetch = async () => {
      calls += 1;
      return openaiOk(vat15);
    };
    try {
      const off = createInvoiceExtractionProvider({ config: { provider: 'off', apiKey: 'sk-test' } });
      await assert.rejects(
        () => off.extract({ buffer: Buffer.from('a'), mimeType: 'image/jpeg', originalName: 'a.jpg' }),
        (err) => err.code === 'INVOICE_EXTRACTION_DISABLED'
      );
      const noKey = createOpenAIInvoiceExtractionProvider({ apiKey: '' });
      await assert.rejects(
        () => noKey.extract({ buffer: Buffer.from('a'), mimeType: 'image/jpeg', originalName: 'a.jpg' }),
        (err) => err.code === 'INVOICE_EXTRACTION_DISABLED'
      );
      assert.equal(calls, 0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  await checkAsync('openai timeout maps to EXTRACTION_PROVIDER_TIMEOUT', async () => {
    const originalFetch = global.fetch;
    global.fetch = () => new Promise((_, reject) => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      reject(err);
    });
    try {
      const provider = createOpenAIInvoiceExtractionProvider({
        apiKey: 'sk-test',
        timeoutMs: 5,
        maxRetries: 0,
      });
      await assert.rejects(
        () => provider.extract({ buffer: Buffer.from('a'), mimeType: 'image/jpeg', originalName: 'a.jpg' }),
        (err) => err.code === 'EXTRACTION_PROVIDER_TIMEOUT'
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  await checkAsync('store:false is sent and Retry-After plus backoff are honored', async () => {
    const originalFetch = global.fetch;
    const bodies = [];
    const sleeps = [];
    const responses = [
      {
        ok: false,
        status: 429,
        headers: { get: (name) => (String(name).toLowerCase() === 'retry-after' ? '2' : null) },
        json: async () => ({ error: 'rate' }),
        text: async () => 'rate',
      },
      openaiOk(vat15),
    ];
    global.fetch = async (_url, opts) => {
      bodies.push(JSON.parse(opts.body));
      return responses.shift();
    };
    try {
      const provider = createOpenAIInvoiceExtractionProvider({
        apiKey: 'sk-test',
        maxRetries: 1,
        sleep: async (ms) => { sleeps.push(ms); },
      });
      const result = await provider.extract({ buffer: Buffer.from('a'), mimeType: 'image/jpeg', originalName: 'a.jpg' });
      assert.equal(result.providerName, 'openai');
      assert.equal(bodies.length, 2);
      assert.equal(bodies[0].store, false);
      assert.equal(bodies[1].store, false);
      assert.deepEqual(sleeps, [2000]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  await checkAsync('5xx uses exponential backoff; other 4xx and invalid JSON are not retried', async () => {
    const originalFetch = global.fetch;
    const sleeps = [];
    let calls = 0;
    const fiveHundred = {
      ok: false,
      status: 500,
      headers: { get: () => null },
      json: async () => ({}),
      text: async () => 'err',
    };
    global.fetch = async () => {
      calls += 1;
      if (calls < 3) return fiveHundred;
      return openaiOk(vat15);
    };
    try {
      const provider = createOpenAIInvoiceExtractionProvider({
        apiKey: 'sk-test',
        maxRetries: 2,
        retryBaseMs: 500,
        retryCapMs: 8000,
        sleep: async (ms) => { sleeps.push(ms); },
      });
      await provider.extract({ buffer: Buffer.from('a'), mimeType: 'image/jpeg', originalName: 'a.jpg' });
      assert.equal(calls, 3);
      assert.deepEqual(sleeps, [500, 1000]);
    } finally {
      global.fetch = originalFetch;
    }

    calls = 0;
    global.fetch = async () => {
      calls += 1;
      return {
        ok: false,
        status: 400,
        headers: { get: () => null },
        json: async () => ({ error: 'bad' }),
        text: async () => 'bad',
      };
    };
    try {
      const provider = createOpenAIInvoiceExtractionProvider({
        apiKey: 'sk-test',
        maxRetries: 3,
        sleep: async () => { throw new Error('sleep should not run for 4xx'); },
      });
      await assert.rejects(
        () => provider.extract({ buffer: Buffer.from('a'), mimeType: 'image/jpeg', originalName: 'a.jpg' }),
        (err) => err.code === 'EXTRACTION_PROVIDER_FAILED'
      );
      assert.equal(calls, 1);
    } finally {
      global.fetch = originalFetch;
    }

    calls = 0;
    global.fetch = async () => {
      calls += 1;
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ output_text: 'not-json' }),
        text: async () => '',
      };
    };
    try {
      const provider = createOpenAIInvoiceExtractionProvider({
        apiKey: 'sk-test',
        maxRetries: 2,
        sleep: async () => { throw new Error('sleep should not run for invalid JSON'); },
      });
      await assert.rejects(
        () => provider.extract({ buffer: Buffer.from('a'), mimeType: 'image/jpeg', originalName: 'a.jpg' }),
        (err) => err.code === 'EXTRACTION_PAYLOAD_INVALID'
      );
      assert.equal(calls, 1);
    } finally {
      global.fetch = originalFetch;
    }
  });
};

runAsync()
  .then(() => {
    console.log(`\n${passed} passed, ${failed} failed\n`);
    if (failed) process.exit(1);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
