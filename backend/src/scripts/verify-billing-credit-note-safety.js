/**
 * Billing / credit-note safety verification.
 * Usage: node src/scripts/verify-billing-credit-note-safety.js
 * No database connection. No migrations. No production data.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { toHalalas, fromHalalas } = require('../utils/money');
const {
  evaluatePayment,
  allocateCreditNote,
  computeBalanceHalalas,
  computeCreditAvailableHalalas,
  computeRefundableAmount,
  computePaymentRefundableHalalas,
  attachPaymentRefundTotals,
  computeRefundDueHalalas,
  computeSettlement,
  journalIsBalanced,
  buildInvoiceJournalLines,
  buildPaymentJournalLines,
  buildRefundJournalLines,
  buildCreditNoteJournalLines,
  registerJournalSource,
  invoiceStatusAfterSettlement,
  afterSqlErrorInTransaction,
  netVatPeriod,
  customerArBalance,
} = require('../utils/invoice-settlement');
const { paymentSchema, creditNoteSchema, refundSchema } = require('../validators/schemas');
const { labDay, labDateSql, ACCOUNTING_TIMEZONE } = require('../utils/accounting-time');

let passed = 0;
let failed = 0;

const check = (label, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${label}: ${err.message}`);
  }
};

const billingSrc = fs.readFileSync(path.join(__dirname, '../services/billing.service.js'), 'utf8');
const ledgerSrc = fs.readFileSync(path.join(__dirname, '../services/ledger.service.js'), 'utf8');
const creditNoteSrc = fs.readFileSync(path.join(__dirname, '../services/credit-note.service.js'), 'utf8');
const accountingSrc = fs.readFileSync(path.join(__dirname, '../services/accounting.service.js'), 'utf8');
const proposedSql = fs.readFileSync(path.join(__dirname, '../../migrations/proposed-credit-notes.sql'), 'utf8');
const recordPaymentSrc = billingSrc.slice(
  billingSrc.indexOf('const recordPayment'),
  billingSrc.indexOf('const listPackages')
);
const createInvoiceSrc = billingSrc.slice(
  billingSrc.indexOf('const createInvoice'),
  billingSrc.indexOf('const recordPayment')
);

console.log('\n=== Payment on zero balance ===\n');

check('0.01 payment on zero stored total is rejected', () => {
  const result = evaluatePayment({
    storedTotal: 0,
    alreadyPaid: 0,
    amount: 0.01,
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 'ZERO_BALANCE');
});

check('0.01 payment on fully paid invoice is rejected', () => {
  const result = evaluatePayment({
    storedTotal: 65,
    alreadyPaid: 65,
    amount: 0.01,
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 'ZERO_BALANCE');
});

check('0.01 payment after full credit note is rejected', () => {
  const result = evaluatePayment({
    storedTotal: 65,
    alreadyPaid: 0,
    creditNotesTotal: 65,
    amount: 0.01,
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 'ZERO_BALANCE');
});

console.log('\n=== 100% discount ===\n');

check('invoice issued at 0 total rejects any payment', () => {
  const result = evaluatePayment({
    storedTotal: 0,
    alreadyPaid: 0,
    amount: 0.01,
    paymentData: {},
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 'ZERO_BALANCE');
});

check('100% discount at issue creates no invoice journal lines', () => {
  const lines = buildInvoiceJournalLines({
    total: 0,
    tax_amount: 0,
    arId: 'ar',
    revId: 'rev',
    vatId: 'vat',
  });
  assert.deepStrictEqual(lines, []);
});

check('post-issue complimentary service is a full credit note, not an invoice rewrite', () => {
  const note = allocateCreditNote({
    invoiceTotal: 65,
    invoiceTax: 8.48,
    alreadyPaid: 0,
    priorCredits: 0,
  });
  assert.strictEqual(note.ok, true);
  assert.strictEqual(note.total, 65);
  assert.strictEqual(toHalalas(note.subtotal) + toHalalas(note.tax_amount), toHalalas(note.total));
  assert.strictEqual(
    computeBalanceHalalas({ storedTotal: 65, alreadyPaid: 0, creditNotesTotal: note.total }),
    0
  );
});

console.log('\n=== Two 0.01 (halala) payments ===\n');

check('first 0.01 on 0.02 balance is accepted', () => {
  const first = evaluatePayment({ storedTotal: 0.02, alreadyPaid: 0, amount: 0.01 });
  assert.strictEqual(first.ok, true);
  assert.strictEqual(first.amountHalalas, 1);
  assert.strictEqual(first.newPaidHalalas, 1);
});

check('second 0.01 on remaining 0.01 is accepted', () => {
  const second = evaluatePayment({ storedTotal: 0.02, alreadyPaid: 0.01, amount: 0.01 });
  assert.strictEqual(second.ok, true);
  assert.strictEqual(second.newPaidHalalas, 2);
});

check('third 0.01 after two halala payments is rejected', () => {
  const third = evaluatePayment({ storedTotal: 0.02, alreadyPaid: 0.02, amount: 0.01 });
  assert.strictEqual(third.ok, false);
  assert.strictEqual(third.code, 'ZERO_BALANCE');
});

check('halala math does not use 0.01 float tolerance', () => {
  const over = evaluatePayment({ storedTotal: 65, alreadyPaid: 64.99, amount: 0.02 });
  assert.strictEqual(over.ok, false);
  assert.strictEqual(over.code, 'OVERPAYMENT');
  assert.strictEqual(toHalalas(0.01), 1);
  assert.strictEqual(fromHalalas(1), 0.01);
});

console.log('\n=== Discount change during payment ===\n');

check('evaluatePayment rejects discount fields on the payment payload', () => {
  const result = evaluatePayment({
    storedTotal: 65,
    alreadyPaid: 0,
    amount: 65,
    paymentData: { discount_percent: 100 },
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 'INVOICE_TOTALS_LOCKED');
});

check('paymentSchema forbids discount fields', () => {
  const { error } = paymentSchema.validate({
    invoice_id: '11111111-1111-1111-1111-111111111111',
    amount: 10,
    method: 'cash',
    discount_percent: 100,
  });
  assert.ok(error, 'expected validation error');
  assert.ok(error.details.some((d) => d.path.includes('discount_percent')));
});

check('recordPayment source no longer updates invoice discounts or totals', () => {
  assert.ok(!/calcDocumentTotals/.test(recordPaymentSrc));
  assert.ok(!/UPDATE invoices SET discount_amount/.test(recordPaymentSrc));
  assert.ok(!/shouldHealHalala/.test(recordPaymentSrc));
  assert.ok(!/balance \+ 0\.01/.test(recordPaymentSrc));
  assert.ok(!/newTotal/.test(recordPaymentSrc));
  assert.ok(/evaluatePayment/.test(recordPaymentSrc));
  assert.ok(/storedTotal/.test(recordPaymentSrc));
});

console.log('\n=== Full credit note ===\n');

check('creditNoteSchema requires invoice, reason, optional total', () => {
  const bad = creditNoteSchema.validate({ invoice_id: '11111111-1111-1111-1111-111111111111' });
  assert.ok(bad.error);
  const ok = creditNoteSchema.validate({
    invoice_id: '11111111-1111-1111-1111-111111111111',
    reason: 'Complimentary service after issue',
  });
  assert.ok(!ok.error);
  assert.strictEqual(ok.value.reason, 'Complimentary service after issue');
});

check('allocateCreditNote builds subtotal + VAT + total from stored invoice', () => {
  const note = allocateCreditNote({
    invoiceTotal: 115,
    invoiceTax: 15,
    alreadyPaid: 0,
    requestedTotal: 115,
  });
  assert.strictEqual(note.ok, true);
  assert.strictEqual(note.total, 115);
  assert.strictEqual(note.tax_amount, 15);
  assert.strictEqual(note.subtotal, 100);
});

check('credit note cannot exceed invoice total minus prior credits (payments ignored)', () => {
  const note = allocateCreditNote({
    invoiceTotal: 65,
    invoiceTax: 8.48,
    priorCredits: 10,
    requestedTotal: 60,
  });
  assert.strictEqual(note.ok, false);
  assert.strictEqual(note.code, 'CREDIT_EXCEEDS_BALANCE');
});

check('credit note service persists number, reason, amounts, status, events, and reversing journal', () => {
  assert.ok(/INSERT INTO credit_notes/.test(creditNoteSrc));
  assert.ok(/credit_note_number/.test(creditNoteSrc));
  assert.ok(/reason/.test(creditNoteSrc));
  assert.ok(/subtotal/.test(creditNoteSrc) && /tax_amount/.test(creditNoteSrc) && /total/.test(creditNoteSrc));
  assert.ok(/INSERT INTO credit_note_events/.test(creditNoteSrc));
  assert.ok(/ledger\.postCreditNote/.test(creditNoteSrc));
  assert.ok(/FOR UPDATE/.test(creditNoteSrc));
  assert.ok(!/UPDATE invoices SET[\s\S]*total\s*=/.test(creditNoteSrc));
});

console.log('\n=== Journal balance and no duplicate posting ===\n');

check('invoice journal lines balance', () => {
  const lines = buildInvoiceJournalLines({
    total: 65,
    tax_amount: 8.48,
    arId: 'ar',
    revId: 'rev',
    vatId: 'vat',
  });
  assert.ok(journalIsBalanced(lines));
});

check('payment journal lines balance', () => {
  const lines = buildPaymentJournalLines({ amount: 0.01, cashId: 'cash', arId: 'ar' });
  assert.ok(journalIsBalanced(lines));
  assert.strictEqual(toHalalas(lines[0].debit), 1);
});

check('credit note reversing lines balance (revenue + VAT vs AR)', () => {
  const lines = buildCreditNoteJournalLines({
    total: 65,
    tax_amount: 8.48,
    arId: 'ar',
    revId: 'rev',
    vatId: 'vat',
  });
  assert.ok(journalIsBalanced(lines));
  const debit = lines.reduce((s, l) => s + toHalalas(l.debit), 0);
  const credit = lines.reduce((s, l) => s + toHalalas(l.credit), 0);
  assert.strictEqual(debit, credit);
  assert.strictEqual(credit, 6500);
});

check('registerJournalSource blocks a second post for the same source', () => {
  const posted = new Set();
  const first = registerJournalSource(posted, 'credit_note', 'note-1');
  const second = registerJournalSource(posted, 'credit_note', 'note-1');
  assert.strictEqual(first.ok, true);
  assert.strictEqual(second.ok, false);
  assert.strictEqual(second.code, 'DUPLICATE_JOURNAL');
});

check('ledger createEntry checks duplicate source and balanced lines', () => {
  assert.ok(/assertNoDuplicateJournal/.test(ledgerSrc));
  assert.ok(/journalIsBalanced/.test(ledgerSrc));
  assert.ok(/postCreditNote/.test(ledgerSrc));
  assert.ok(/source_type = \$1 AND source_id = \$2/.test(ledgerSrc));
});

check('invoice and payment ledger posting happen inside the same transaction', () => {
  assert.ok(/ledger\.postInvoice\(issued, userId, client\)/.test(createInvoiceSrc));
  assert.ok(/syncCustomerArBalance\(data.customer_id, client\)/.test(createInvoiceSrc));
  assert.ok(/withBillingClient/.test(createInvoiceSrc));
  assert.ok(!/ledger optional/.test(createInvoiceSrc));
  assert.ok(/ledger\.postPayment\(payment, invoice, userId, client\)/.test(recordPaymentSrc));
  assert.ok(/syncCustomerArBalance\(invoice.customer_id, client\)/.test(recordPaymentSrc));
  assert.ok(/withBillingClient/.test(recordPaymentSrc));
  assert.ok(!/ledger optional/.test(recordPaymentSrc));
  assert.ok(/syncCustomerArBalance\(invoice.customer_id, client\)/.test(creditNoteSrc));
  assert.ok(creditNoteSrc.indexOf('syncCustomerArBalance') < creditNoteSrc.indexOf('COMMIT'));
});

check('fully credited unpaid invoice stays issued; cash collection can be paid', () => {
  assert.strictEqual(invoiceStatusAfterSettlement(65, 0, 65), 'issued');
  assert.strictEqual(invoiceStatusAfterSettlement(65, 6500, 0), 'paid');
  assert.strictEqual(computeSettlement({ storedTotal: 65, alreadyPaid: 0, creditNotesTotal: 65 }).coverage, 'credited');
});

console.log('\n=== Paid invoice then full credit note ===\n');

check('paid 65 invoice can receive a full 65 credit note', () => {
  assert.strictEqual(computeCreditAvailableHalalas({ storedTotal: 65, priorCredits: 0 }), 6500);
  const note = allocateCreditNote({
    invoiceTotal: 65,
    invoiceTax: 8.48,
    priorCredits: 0,
    requestedTotal: 65,
  });
  assert.strictEqual(note.ok, true);
  assert.strictEqual(note.total, 65);
});

check('after paid 65 + CN 65, customer owes 0 and refund due is 65', () => {
  const settlement = computeSettlement({
    storedTotal: 65,
    alreadyPaid: 65,
    creditNotesTotal: 65,
    alreadyRefunded: 0,
  });
  assert.strictEqual(settlement.balance_due, 0);
  assert.strictEqual(settlement.refund_due, 65);
  assert.strictEqual(settlement.coverage, 'refund_due');
  assert.strictEqual(computeRefundDueHalalas({
    storedTotal: 65,
    alreadyPaid: 65,
    creditNotesTotal: 65,
  }), 6500);
  assert.strictEqual(computeRefundableAmount(65, 0), 65);
});

check('refund 65 reversing journal is balanced (debit AR, credit cash)', () => {
  const lines = buildRefundJournalLines({ amount: 65, cashId: 'cash', arId: 'ar' });
  assert.ok(journalIsBalanced(lines));
  assert.strictEqual(lines[0].accountId, 'ar');
  assert.strictEqual(toHalalas(lines[0].debit), 6500);
  assert.strictEqual(lines[1].accountId, 'cash');
  assert.strictEqual(toHalalas(lines[1].credit), 6500);
});

console.log('\n=== Anomalous stored invoice (total 0, paid 0.02, original journal 65) ===\n');

check('does not rewrite stored total or invent a 65 credit note', () => {
  const payment = evaluatePayment({ storedTotal: 0, alreadyPaid: 0.02, amount: 0.01 });
  assert.strictEqual(payment.ok, false);
  assert.strictEqual(payment.code, 'ZERO_BALANCE');
  const note = allocateCreditNote({ invoiceTotal: 0, invoiceTax: 0, priorCredits: 0, requestedTotal: 65 });
  assert.strictEqual(note.ok, false);
  assert.strictEqual(computeCreditAvailableHalalas({ storedTotal: 0 }), 0);
  const settlement = computeSettlement({
    storedTotal: 0,
    alreadyPaid: 0.02,
    creditNotesTotal: 0,
  });
  assert.strictEqual(settlement.balance_due, 0);
  assert.strictEqual(settlement.refund_due, 0.02);
  assert.strictEqual(toHalalas(65), 6500);
});

console.log('\n=== Customer AR and VAT period netting ===\n');

check('customer AR excludes credited and paid amounts', () => {
  const ar = customerArBalance([
    { storedTotal: 65, alreadyPaid: 0, creditNotesTotal: 65 },
    { storedTotal: 65, alreadyPaid: 65, creditNotesTotal: 65 },
    { storedTotal: 100, alreadyPaid: 40, creditNotesTotal: 0 },
  ]);
  assert.strictEqual(ar, 6000);
});

check('VAT keeps invoice on issue date and credit note on its own date', () => {
  const before = netVatPeriod({
    invoices: [{ date: '2026-01-01', number: 'INV-1', tax: 8.48, total: 65 }],
    creditNotes: [],
  });
  assert.strictEqual(before.totals.tax, 8.48);
  assert.strictEqual(before.totals.gross, 65);
  const after = netVatPeriod({
    invoices: [{ date: '2026-01-01', number: 'INV-1', tax: 8.48, total: 65 }],
    creditNotes: [{ date: '2026-08-15', number: 'CN-1', tax: 8.48, total: 65 }],
  });
  assert.strictEqual(after.documents[0].date, '2026-01-01');
  assert.strictEqual(after.documents[1].date, '2026-08-15');
  assert.strictEqual(after.documents[1].type, 'credit_note');
  assert.strictEqual(after.documents[1].gross, -65);
  assert.strictEqual(after.totals.gross, 0);
  assert.ok(Math.abs(after.totals.tax) < 0.001);
});

console.log('\n=== Duplicate journals and aborted transaction ===\n');

check('duplicate invoice/payment/refund/credit_note journals are rejected', () => {
  const posted = new Set();
  ['invoice', 'payment', 'refund', 'credit_note'].forEach((type) => {
    assert.strictEqual(registerJournalSource(posted, type, `${type}-1`).ok, true);
    const second = registerJournalSource(posted, type, `${type}-1`);
    assert.strictEqual(second.ok, false);
    assert.strictEqual(second.code, 'DUPLICATE_JOURNAL');
  });
});

check('SQL error inside a transaction must rollback and must not continue', () => {
  const decision = afterSqlErrorInTransaction({ code: '42P01' });
  assert.strictEqual(decision.continue, false);
  assert.strictEqual(decision.rollback, true);
  assert.strictEqual(decision.code, 'CREDIT_NOTES_UNAVAILABLE');
});

check('transactional credit-note/payment paths do not swallow 42P01 as zero', () => {
  assert.ok(!/if \(err\.code === ['"]42P01['"]\) return 0/.test(creditNoteSrc));
  assert.ok(!/if \(err\.code === ['"]42P01['"]\) return \[\]/.test(creditNoteSrc));
  assert.ok(/assertCreditNotesAvailable/.test(creditNoteSrc));
  assert.ok(/creditNotesTableExists/.test(creditNoteSrc));
  assert.ok(creditNoteSrc.indexOf('assertCreditNotesAvailable') < creditNoteSrc.indexOf('BEGIN'));
  assert.ok(!/UPDATE invoices SET status/.test(creditNoteSrc));
});

check('processRefund posts a refund journal in the same transaction', () => {
  const refundSrc = billingSrc.slice(
    billingSrc.indexOf('const processRefund'),
    billingSrc.indexOf('const exportInvoicesCsv')
  );
  assert.ok(/ledger\.postRefund/.test(refundSrc));
  assert.ok(/withBillingClient/.test(refundSrc));
  assert.ok(/payment_id/.test(refundSrc));
  assert.ok(!/refundMethod = 'cash'/.test(refundSrc));
  assert.ok(/PAYMENT_INVOICE_MISMATCH/.test(refundSrc));
  assert.ok(/computePaymentRefundableHalalas/.test(refundSrc));
  assert.ok(/syncCustomerArBalance\(invoice.customer_id, client\)/.test(refundSrc));
  assert.ok(/source_type/.test(ledgerSrc) && /refund/.test(ledgerSrc));
  assert.ok(/postRefund/.test(ledgerSrc));
  assert.ok(!/ledger optional/.test(refundSrc));
});

check('refundSchema requires payment_id', () => {
  const missing = refundSchema.validate({
    invoice_id: '11111111-1111-1111-1111-111111111111',
    amount: 65,
  });
  assert.ok(missing.error);
  const ok = refundSchema.validate({
    invoice_id: '11111111-1111-1111-1111-111111111111',
    payment_id: '22222222-2222-2222-2222-222222222222',
    amount: 65,
    reason: 'test',
  });
  assert.ok(!ok.error);
});

check('refund remaining is capped per payment, not mixed methods', () => {
  assert.strictEqual(computePaymentRefundableHalalas({
    paymentAmount: 40,
    refundedAgainstPayment: 10,
  }), 3000);
  assert.strictEqual(computePaymentRefundableHalalas({
    paymentAmount: 40,
    refundedAgainstPayment: 40,
  }), 0);
});

check('processRefund asserts the refund day, not the invoice issue date', () => {
  const refundSrc = billingSrc.slice(
    billingSrc.indexOf('const processRefund'),
    billingSrc.indexOf('const exportInvoicesCsv')
  );
  assert.ok(!/assertDayOpen\(invoiceDate\(invoice\)\)/.test(refundSrc));
  assert.ok(/assertDayOpen\(refundDay, client\)/.test(refundSrc));
  assert.ok(/labDay\(\)/.test(refundSrc));
  assert.ok(!/toISOString\(\)\.slice\(0, 10\)/.test(refundSrc));
  assert.ok(/created_at/.test(refundSrc) && /NOW\(\)/.test(refundSrc));
});

check('refund journal uses the refund timestamp as entry_date', () => {
  assert.ok(/entry_date/.test(ledgerSrc));
  assert.ok(/entryDate: refund\.created_at/.test(ledgerSrc));
});

check('invoice payments expose exact refunded_amount and refundable_amount', () => {
  assert.ok(/refunded_amount/.test(billingSrc));
  assert.ok(/refundable_amount/.test(billingSrc));
  assert.ok(/ROUND\(p\.amount \* 100\)/.test(billingSrc));
  const partial = attachPaymentRefundTotals([{ id: 'p1', amount: 65 }], { p1: 20 });
  assert.strictEqual(partial[0].refunded_amount, 20);
  assert.strictEqual(partial[0].refundable_amount, 45);
  const full = attachPaymentRefundTotals([{ id: 'p1', amount: 65 }], { p1: 65 });
  assert.strictEqual(full[0].refundable_amount, 0);
});

check('daily closing includes refunds by refund created_at, not invoice date', () => {
  const summarySrc = accountingSrc.slice(
    accountingSrc.indexOf('const getDailyFullSummary'),
    accountingSrc.indexOf('const getDashboardSummary')
  );
  assert.ok(/labDateSql\('created_at'\)/.test(summarySrc) || /labDateSql\(`created_at`\)/.test(summarySrc));
  assert.ok(/refunds_total/.test(summarySrc));
  assert.ok(/net_collections/.test(summarySrc));
  assert.ok(!/created_at::date/.test(summarySrc));
});

check('lab day 20:59 UTC stays on the same Riyadh calendar day', () => {
  assert.strictEqual(ACCOUNTING_TIMEZONE, 'Asia/Riyadh');
  assert.strictEqual(labDay('2026-08-15T20:59:00.000Z'), '2026-08-15');
  assert.strictEqual(labDay(new Date(Date.UTC(2026, 7, 15, 20, 59, 0))), '2026-08-15');
});

check('lab day 21:00 UTC rolls to the next Riyadh calendar day', () => {
  assert.strictEqual(labDay('2026-08-15T21:00:00.000Z'), '2026-08-16');
  assert.strictEqual(labDay(new Date(Date.UTC(2026, 7, 15, 21, 0, 0))), '2026-08-16');
});

check('labDay does not use OS local getters or toISOString date slicing', () => {
  const src = fs.readFileSync(path.join(__dirname, '../utils/accounting-time.js'), 'utf8');
  assert.ok(!/toISOString\(\)\.slice/.test(src));
  assert.ok(!/\.getFullYear\(\)/.test(src));
  assert.ok(!/\.getMonth\(\)/.test(src));
  assert.ok(!/\.getDate\(\)/.test(src));
  assert.ok(/getUTCFullYear/.test(src));
  assert.ok(/AT TIME ZONE/.test(labDateSql('created_at')));
});

check('payment, refund, and credit-note day checks use labDay', () => {
  assert.ok(/assertDayOpen\(labDay\(\), client\)/.test(recordPaymentSrc));
  assert.ok(/assertDayOpen\(labDay\(\), client\)/.test(creditNoteSrc));
  assert.ok(!/toISOString\(\)\.slice\(0, 10\)/.test(recordPaymentSrc));
  assert.ok(!/toISOString\(\)\.slice\(0, 10\)/.test(creditNoteSrc));
});

check('accounting reports group by Asia/Riyadh, not session or UTC ::date', () => {
  assert.ok(!/created_at::date/.test(accountingSrc));
  assert.ok(!/entry_date::date/.test(accountingSrc));
  assert.ok((accountingSrc.match(/labDateSql\(/g) || []).length >= 8);
  assert.ok(labDateSql('created_at').includes("AT TIME ZONE 'Asia/Riyadh'"));
  const closingSrc = fs.readFileSync(path.join(__dirname, '../services/daily-closing.service.js'), 'utf8');
  assert.ok(/labDay\(\)/.test(closingSrc));
  assert.ok(!/toISOString\(\)\.slice\(0, 10\)/.test(closingSrc));
});

check('credit-note admin override requires a dedicated role, not a session GUC', () => {
  const executable = proposedSql.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
  assert.ok(/lims_credit_note_admin/.test(proposedSql));
  assert.ok(/pg_roles/.test(proposedSql));
  assert.ok(/pg_has_role\(CURRENT_USER, 'lims_credit_note_admin'/.test(proposedSql));
  assert.ok(!/CREATE ROLE lims_credit_note_admin/.test(executable));
  assert.ok(!/GRANT lims_credit_note_admin/.test(executable));
  const fnSrc = proposedSql.slice(
    proposedSql.indexOf('CREATE OR REPLACE FUNCTION lims_credit_note_admin_override'),
    proposedSql.indexOf('CREATE OR REPLACE FUNCTION lims_protect_credit_notes')
  );
  assert.ok(!/current_setting\('lims.allow_credit_note_admin'/.test(fnSrc));
  assert.ok(/RETURN FALSE/.test(fnSrc));
});

console.log(`\n=== Credit-note safety result: ${passed} passed, ${failed} failed ===\n`);

if (failed) process.exit(1);

const integration = require('./verify-billing-credit-note-integration');
integration.run()
  .then((result) => {
    if (result.ran) {
      console.log('=== Integration: RAN and passed (transaction rolled back) ===\n');
      process.exit(0);
    }
    console.log(`=== Integration: SKIPPED (${result.reason || 'not a local/test database'}) ===\n`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(`=== Integration: FAILED — ${err.message} ===\n`);
    process.exit(1);
  });
