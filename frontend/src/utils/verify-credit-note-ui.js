/**
 * Credit-note UI contract and preview checks.
 * Usage: node src/utils/verify-credit-note-ui.js
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  toHalalas,
  fromHalalas,
  invoiceCreditAvailable,
  canIssueCreditNote,
  previewCreditNote,
  validateCreditNoteForm,
  buildCreditNoteRequest,
  formErrorKey,
} from './creditNotePreview.js';
import { issueCreditNoteOnce } from './creditNoteIssue.js';

const i18nSrc = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../i18n/index.js'),
  'utf8'
);

let passed = 0;
let failed = 0;
const checks = [];

const check = (name, fn) => {
  checks.push({ name, fn });
};

console.log('\n=== Credit note UI preview ===\n');

check('full credit note splits VAT in proportion to the invoice', () => {
  const note = previewCreditNote({
    invoiceTotal: 65,
    invoiceTax: 8.48,
    priorCredits: 0,
  });
  assert.equal(note.ok, true);
  assert.equal(note.total, 65);
  assert.equal(toHalalas(note.subtotal) + toHalalas(note.tax_amount), toHalalas(note.total));
  assert.equal(note.tax_amount, 8.48);
  assert.equal(note.subtotal, 56.52);
});

check('partial credit note uses the same proportional tax split as the backend', () => {
  const note = previewCreditNote({
    invoiceTotal: 65,
    invoiceTax: 8.48,
    priorCredits: 0,
    requestedTotal: 32.50,
  });
  assert.equal(note.ok, true);
  assert.equal(note.total, 32.5);
  assert.equal(note.tax_amount, fromHalalas(Math.round((3250 * 848) / 6500)));
  assert.equal(toHalalas(note.subtotal) + toHalalas(note.tax_amount), 3250);
});

check('zero and negative amounts are rejected', () => {
  assert.equal(previewCreditNote({
    invoiceTotal: 65, invoiceTax: 8.48, requestedTotal: 0,
  }).code, 'INVALID_AMOUNT');
  assert.equal(previewCreditNote({
    invoiceTotal: 65, invoiceTax: 8.48, requestedTotal: -1,
  }).code, 'INVALID_AMOUNT');
});

check('amount above available is rejected', () => {
  const over = previewCreditNote({
    invoiceTotal: 65,
    invoiceTax: 8.48,
    priorCredits: 20,
    requestedTotal: 45.01,
  });
  assert.equal(over.ok, false);
  assert.equal(over.code, 'CREDIT_EXCEEDS_BALANCE');
});

check('nothing remains after a full prior credit note', () => {
  const none = previewCreditNote({
    invoiceTotal: 65,
    invoiceTax: 8.48,
    priorCredits: 65,
    requestedTotal: 0.01,
  });
  assert.equal(none.ok, false);
  assert.equal(none.code, 'NOTHING_TO_CREDIT');
});

console.log('\n=== Form validation / request contract ===\n');

check('reason must be at least 3 characters', () => {
  const result = validateCreditNoteForm({ reason: 'ab', amount: '10', available: 65 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'REASON_TOO_SHORT');
});

check('request body matches POST /billing/credit-notes', () => {
  const result = buildCreditNoteRequest({
    invoiceId: '11111111-1111-1111-1111-111111111111',
    reason: '  Complimentary repeat  ',
    amount: '32.50',
    available: 65,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.body, {
    invoice_id: '11111111-1111-1111-1111-111111111111',
    reason: 'Complimentary repeat',
    total: 32.5,
  });
});

check('form rejects zero, negative, empty, and over-available amounts', () => {
  assert.equal(validateCreditNoteForm({ reason: 'ok reason', amount: '', available: 65 }).code, 'AMOUNT_REQUIRED');
  assert.equal(validateCreditNoteForm({ reason: 'ok reason', amount: '0', available: 65 }).code, 'INVALID_AMOUNT');
  assert.equal(validateCreditNoteForm({ reason: 'ok reason', amount: '-5', available: 65 }).code, 'INVALID_AMOUNT');
  assert.equal(validateCreditNoteForm({ reason: 'ok reason', amount: '65.01', available: 65 }).code, 'CREDIT_EXCEEDS_BALANCE');
});

check('create button is hidden for cancelled, refunded, or fully credited invoices', () => {
  assert.equal(canIssueCreditNote({ status: 'issued', credit_available: 65 }), true);
  assert.equal(canIssueCreditNote({ status: 'paid', credit_available: 65 }), true);
  assert.equal(canIssueCreditNote({ status: 'cancelled', credit_available: 65 }), false);
  assert.equal(canIssueCreditNote({ status: 'refunded', credit_available: 65 }), false);
  assert.equal(canIssueCreditNote({ status: 'issued', credit_available: 0 }), false);
});

check('available amount prefers the invoice settlement field', () => {
  assert.equal(invoiceCreditAvailable({
    total: 65,
    credit_notes_total: 10,
    credit_available: 55,
  }), 55);
});

check('reason longer than 1000 characters uses the max-length message', () => {
  const result = validateCreditNoteForm({
    reason: 'x'.repeat(1001),
    amount: '10',
    available: 65,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'REASON_TOO_LONG');
  assert.equal(formErrorKey(result.code), 'billing.creditNoteReasonTooLong');
  assert.notEqual(formErrorKey(result.code), formErrorKey('REASON_TOO_SHORT'));
  assert.match(i18nSrc, /creditNoteReasonTooLong: 'Reason cannot exceed 1000 characters'/);
  assert.match(i18nSrc, /creditNoteReasonTooLong: 'لا يمكن أن يتجاوز السبب 1000 حرف'/);
});

console.log('\n=== Issue lock and refresh isolation ===\n');

check('two concurrent issue clicks send only one request', async () => {
  const lock = { current: false };
  let calls = 0;
  let resolveFirst;
  const createCreditNote = () => {
    calls += 1;
    return new Promise((resolve) => {
      resolveFirst = () => resolve({
        data: { data: { id: 'cn-1', credit_note_number: 'CN-1', status: 'issued' } },
      });
    });
  };

  const first = issueCreditNoteOnce({ lock, createCreditNote, body: { total: 10 } });
  const second = issueCreditNoteOnce({ lock, createCreditNote, body: { total: 10 } });
  assert.equal(calls, 1);
  assert.equal(lock.current, true);

  resolveFirst();
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.ok, true);
  assert.equal(firstResult.note.credit_note_number, 'CN-1');
  assert.equal(secondResult.skipped, true);
  assert.equal(secondResult.ok, false);
  assert.equal(calls, 1);
});

check('issue success with refresh failure is not an issue failure', async () => {
  const lock = { current: false };
  const note = {
    id: 'cn-2',
    credit_note_number: 'CN-2',
    status: 'issued',
    created_at: '2026-08-15T12:00:00.000Z',
  };
  const toasts = [];
  const result = await issueCreditNoteOnce({
    lock,
    createCreditNote: async () => ({ data: { data: note } }),
    body: { total: 10 },
    onIssued: async () => {
      throw new Error('reload failed');
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.refreshFailed, true);
  assert.equal(result.skipped, undefined);
  assert.equal(result.error, undefined);
  assert.deepEqual(result.note, note);
  assert.equal(lock.current, true);
  toasts.push(result.ok ? 'issued' : 'issue-failed');
  if (result.refreshFailed) toasts.push('refresh-failed');
  assert.deepEqual(toasts, ['issued', 'refresh-failed']);
  assert.notEqual(toasts.includes('issue-failed'), true);
});

check('failed issue releases the lock so a later attempt can run', async () => {
  const lock = { current: false };
  const first = await issueCreditNoteOnce({
    lock,
    createCreditNote: async () => {
      throw Object.assign(new Error('unavailable'), {
        response: { data: { error: { code: 'CREDIT_NOTES_UNAVAILABLE' } } },
      });
    },
    body: { total: 10 },
  });
  assert.equal(first.ok, false);
  assert.equal(lock.current, false);

  const second = await issueCreditNoteOnce({
    lock,
    createCreditNote: async () => ({
      data: { data: { credit_note_number: 'CN-3', status: 'issued' } },
    }),
    body: { total: 10 },
  });
  assert.equal(second.ok, true);
  assert.equal(second.note.credit_note_number, 'CN-3');
});

for (const { name, fn } of checks) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL ${name}`);
    console.error(`       ${err.message}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
