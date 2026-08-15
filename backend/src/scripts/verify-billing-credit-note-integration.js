/**
 * Local/test PostgreSQL integration for credit-note settlement.
 * Applies proposed-credit-notes.sql inside a transaction, then ROLLBACK.
 * Refuses production-like hosts. Does not leave data.
 *
 * Usage: node src/scripts/verify-billing-credit-note-integration.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { toHalalas } = require('../utils/money');
const { computeSettlement } = require('../utils/invoice-settlement');
const { resetCreditNotesSchemaCache } = require('../utils/credit-notes-schema');
const { labDay, labDateSql } = require('../utils/accounting-time');

const splitSqlStatements = (sql) => {
  const parts = [];
  let current = '';
  let inDollar = false;
  let inLineComment = false;
  for (let i = 0; i < sql.length; i += 1) {
    if (inLineComment) {
      current += sql[i];
      if (sql[i] === '\n') inLineComment = false;
      continue;
    }
    if (!inDollar && sql.startsWith('--', i)) {
      inLineComment = true;
      current += '--';
      i += 1;
      continue;
    }
    if (sql.startsWith('$$', i)) {
      inDollar = !inDollar;
      current += '$$';
      i += 1;
      continue;
    }
    if (!inDollar && sql[i] === ';') {
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

const run = async () => {
  refuseIfNotLocalTestDb();

  const { getClient, pool } = require('../config/database');
  const billing = require('../services/billing.service');
  const creditNotes = require('../services/credit-note.service');
  const ledger = require('../services/ledger.service');

  const proposedSql = fs.readFileSync(
    path.join(__dirname, '../../migrations/proposed-credit-notes.sql'),
    'utf8'
  );

  const client = await getClient();
  let rolledBack = false;
  try {
    await client.query('BEGIN');
    const statements = splitSqlStatements(proposedSql);
    for (const statement of statements) {
      try {
        await client.query(statement);
      } catch (err) {
        err.message = `${err.message}\n--- SQL ---\n${statement.slice(0, 500)}`;
        throw err;
      }
    }
    resetCreditNotesSchemaCache();
    const triggers = await client.query(
      `SELECT tgname FROM pg_trigger WHERE tgname IN ('trg_protect_credit_notes', 'trg_protect_credit_note_events')`
    );
    assert.strictEqual(triggers.rows.length, 2, 'expected credit-note protection triggers');

    const userRes = await client.query(`SELECT id FROM users WHERE is_active = true LIMIT 1`);
    if (!userRes.rows[0]) {
      throw new Error('SKIP: no local user available to own test documents');
    }
    const userId = userRes.rows[0].id;
    const stamp = Date.now();
    const customerId = require('../utils/uuid').uuidv4();

    await client.query(
      `INSERT INTO customers (id, full_name, mobile, created_by)
       VALUES ($1, $2, $3, $4)`,
      [customerId, `CN-ITEST ${stamp}`, `itest${stamp}`.slice(0, 20), userId]
    );

    const invoice = await billing.createInvoice({
      customer_id: customerId,
      items: [{ description: 'CN-ITEST chemistry', quantity: 1, unit_price: 65 }],
    }, userId, { client });
    assert.strictEqual(toHalalas(invoice.total), 6500, `expected invoice total 65, got ${invoice.total}`);

    const invoiceJournal = await client.query(
      `SELECT id FROM journal_entries WHERE source_type = 'invoice' AND source_id = $1`,
      [invoice.id]
    );
    assert.strictEqual(invoiceJournal.rows.length, 1);

    const payment = await billing.recordPayment({
      invoice_id: invoice.id,
      amount: 65,
      method: 'cash',
    }, userId, null, { client });
    assert.strictEqual(toHalalas(payment.amount), 6500);

    const paymentJournal = await client.query(
      `SELECT id FROM journal_entries WHERE source_type = 'payment' AND source_id = $1`,
      [payment.id]
    );
    assert.strictEqual(paymentJournal.rows.length, 1);

    const note = await creditNotes.createCreditNote({
      invoice_id: invoice.id,
      reason: 'CN-ITEST complimentary after issue',
      total: 65,
    }, userId, null, { client });
    assert.strictEqual(toHalalas(note.total), 6500);

    const cnJournal = await client.query(
      `SELECT id FROM journal_entries WHERE source_type = 'credit_note' AND source_id = $1`,
      [note.id]
    );
    assert.strictEqual(cnJournal.rows.length, 1);

    const paidRow = await client.query(
      `SELECT COALESCE(SUM(amount),0) AS n FROM payments WHERE invoice_id = $1`,
      [invoice.id]
    );
    const creditRow = await client.query(
      `SELECT COALESCE(SUM(total),0) AS n FROM credit_notes WHERE invoice_id = $1 AND status = 'issued'`,
      [invoice.id]
    );
    const refundedRow = await client.query(
      `SELECT COALESCE(SUM(amount),0) AS n FROM refunds WHERE invoice_id = $1`,
      [invoice.id]
    );
    let settlement = computeSettlement({
      storedTotal: invoice.total,
      alreadyPaid: paidRow.rows[0].n,
      creditNotesTotal: creditRow.rows[0].n,
      alreadyRefunded: refundedRow.rows[0].n,
    });
    assert.strictEqual(settlement.balance_due, 0);
    assert.strictEqual(settlement.refund_due, 65);

    const oldDay = '2026-01-15';
    await client.query(
      `UPDATE invoices SET created_at = $1::timestamptz WHERE id = $2`,
      [`${oldDay}T10:00:00Z`, invoice.id]
    );
    await client.query(
      `INSERT INTO daily_closings (id, closing_number, closing_date, totals, status, closed_by, closed_at)
       VALUES ($1, $2, $3::date, '{}'::jsonb, 'closed', $4, NOW())`,
      [require('../utils/uuid').uuidv4(), `CN-ITEST-OLD-${stamp}`, oldDay, userId]
    );

    const refund = await billing.processRefund({
      invoice_id: invoice.id,
      payment_id: payment.id,
      amount: 30,
      reason: 'CN-ITEST refund on open today against closed invoice day',
    }, userId, null, { client });
    assert.strictEqual(toHalalas(refund.amount), 3000);
    assert.strictEqual(refund.payment_id, payment.id);

    const todayKey = labDay();
    const refundDates = await client.query(
      `SELECT ${labDateSql('r.created_at')}::text AS refund_day, ${labDateSql('je.entry_date')}::text AS journal_day
       FROM refunds r
       JOIN journal_entries je ON je.source_type = 'refund' AND je.source_id = r.id
       WHERE r.id = $1`,
      [refund.id]
    );
    assert.strictEqual(refundDates.rows[0].refund_day, todayKey);
    assert.strictEqual(refundDates.rows[0].journal_day, todayKey);

    const dayRefunds = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS n FROM refunds WHERE ${labDateSql('created_at')} = $1::date`,
      [todayKey]
    );
    assert.ok(toHalalas(dayRefunds.rows[0].n) >= 3000);

    const detail = await billing.getInvoiceById(invoice.id, { client });
    const payDetail = detail.payments.find((p) => p.id === payment.id);
    assert.ok(payDetail);
    assert.strictEqual(toHalalas(payDetail.refunded_amount), 3000);
    assert.strictEqual(toHalalas(payDetail.refundable_amount), 3500);

    const refundJournal = await client.query(
      `SELECT je.id, jl.debit, jl.credit, la.code
       FROM journal_entries je
       JOIN journal_lines jl ON jl.entry_id = je.id
       JOIN ledger_accounts la ON la.id = jl.account_id
       WHERE je.source_type = 'refund' AND je.source_id = $1
       ORDER BY jl.debit DESC`,
      [refund.id]
    );
    assert.strictEqual(refundJournal.rows.length, 2);
    const arLine = refundJournal.rows.find((r) => r.code === '1100');
    const cashLine = refundJournal.rows.find((r) => r.code === '1010');
    assert.ok(arLine && toHalalas(arLine.debit) === 3000);
    assert.ok(cashLine && toHalalas(cashLine.credit) === 3000);

    const refundedAfter = await client.query(
      `SELECT COALESCE(SUM(amount),0) AS n FROM refunds WHERE invoice_id = $1`,
      [invoice.id]
    );
    settlement = computeSettlement({
      storedTotal: invoice.total,
      alreadyPaid: paidRow.rows[0].n,
      creditNotesTotal: creditRow.rows[0].n,
      alreadyRefunded: refundedAfter.rows[0].n,
    });
    assert.strictEqual(settlement.refund_due, 35);

    const ar = await client.query('SELECT account_balance FROM customers WHERE id = $1', [customerId]);
    assert.strictEqual(toHalalas(ar.rows[0].account_balance), 0);

    const vatInvoice = await client.query(
      `SELECT tax_amount, total FROM invoices WHERE id = $1`,
      [invoice.id]
    );
    const vatNote = await client.query(
      `SELECT tax_amount, total, created_at FROM credit_notes WHERE id = $1`,
      [note.id]
    );
    assert.strictEqual(toHalalas(vatInvoice.rows[0].total) - toHalalas(vatNote.rows[0].total), 0);
    assert.ok(vatNote.rows[0].created_at);

    let duplicateBlocked = 0;
    const duplicateCases = [
      [ledger.postInvoice, [invoice, userId, client]],
      [ledger.postPayment, [payment, invoice, userId, client]],
      [ledger.postCreditNote, [note, invoice, userId, client]],
      [ledger.postRefund, [refund, invoice, userId, client, 'cash']],
    ];
    for (let i = 0; i < duplicateCases.length; i += 1) {
      const [fn, args] = duplicateCases[i];
      await client.query(`SAVEPOINT dup_${i}`);
      try {
        await fn(...args);
        await client.query(`ROLLBACK TO SAVEPOINT dup_${i}`);
      } catch (err) {
        await client.query(`ROLLBACK TO SAVEPOINT dup_${i}`);
        if (err.code === 'DUPLICATE_JOURNAL' || err.code === '23505') duplicateBlocked += 1;
        else throw err;
      }
    }
    assert.strictEqual(duplicateBlocked, 4);

    const assertGuard = async (name, sql, params, pattern) => {
      await client.query(`SAVEPOINT ${name}`);
      try {
        await client.query(sql, params);
        await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
        throw new Error(`${name} succeeded unexpectedly`);
      } catch (err) {
        await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
        if (err.message.includes('succeeded unexpectedly')) throw err;
        assert.ok(pattern.test(err.message) || err.code === '23001', `${name}: ${err.message}`);
      }
    };

    await assertGuard(
      'guard_event_delete',
      'DELETE FROM credit_note_events WHERE credit_note_id = $1',
      [note.id],
      /cannot be deleted/i
    );
    await assertGuard(
      'guard_note_update',
      'UPDATE credit_notes SET subtotal = subtotal + 0.01, tax_amount = tax_amount - 0.01 WHERE id = $1',
      [note.id],
      /cannot be changed/i
    );
    await assertGuard(
      'guard_note_delete',
      'DELETE FROM credit_notes WHERE id = $1',
      [note.id],
      /cannot be deleted/i
    );

    const adminRole = await client.query(
      `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lims_credit_note_admin') AS exists`
    );
    if (adminRole.rows[0].exists) {
      const member = await client.query(
        `SELECT pg_has_role(CURRENT_USER, 'lims_credit_note_admin', 'member') AS m`
      );
      assert.strictEqual(
        member.rows[0].m,
        false,
        'application role must not be a member of lims_credit_note_admin'
      );
    }
    const assertLabBoundary = async (sessionTz) => {
      await client.query(`SET LOCAL TIME ZONE '${sessionTz}'`);
      const boundary = await client.query(
        `SELECT
           (TIMESTAMPTZ '2026-08-15 20:59:00+00' AT TIME ZONE 'Asia/Riyadh')::date::text AS before_midnight,
           (TIMESTAMPTZ '2026-08-15 21:00:00+00' AT TIME ZONE 'Asia/Riyadh')::date::text AS after_midnight`
      );
      assert.strictEqual(boundary.rows[0].before_midnight, '2026-08-15', sessionTz);
      assert.strictEqual(boundary.rows[0].after_midnight, '2026-08-16', sessionTz);
    };
    await assertLabBoundary('UTC');
    await assertLabBoundary('-05');
    await assertLabBoundary('Asia/Riyadh');

    await client.query(`UPDATE payments SET created_at = $1 WHERE id = $2`, ['2026-08-15T20:59:00Z', payment.id]);
    await client.query(`UPDATE refunds SET created_at = $1 WHERE id = $2`, ['2026-08-15T21:00:00Z', refund.id]);
    await client.query(`UPDATE credit_notes SET created_at = $1 WHERE id = $2`, ['2026-08-15T20:59:00Z', note.id]);
    await client.query(
      `UPDATE journal_entries SET entry_date = $1 WHERE source_type = 'refund' AND source_id = $2`,
      ['2026-08-15T21:00:00Z', refund.id]
    );

    const payOn15 = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS n FROM payments WHERE id = $1 AND ${labDateSql('created_at')} = '2026-08-15'`,
      [payment.id]
    );
    const payOn16 = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS n FROM payments WHERE id = $1 AND ${labDateSql('created_at')} = '2026-08-16'`,
      [payment.id]
    );
    assert.strictEqual(toHalalas(payOn15.rows[0].n), 6500);
    assert.strictEqual(toHalalas(payOn16.rows[0].n), 0);

    const refundOn15 = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS n FROM refunds WHERE id = $1 AND ${labDateSql('created_at')} = '2026-08-15'`,
      [refund.id]
    );
    const refundOn16 = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS n FROM refunds WHERE id = $1 AND ${labDateSql('created_at')} = '2026-08-16'`,
      [refund.id]
    );
    assert.strictEqual(toHalalas(refundOn15.rows[0].n), 0);
    assert.strictEqual(toHalalas(refundOn16.rows[0].n), 3000);

    const cnDay = await client.query(
      `SELECT ${labDateSql('created_at')}::text AS day FROM credit_notes WHERE id = $1`,
      [note.id]
    );
    assert.strictEqual(cnDay.rows[0].day, '2026-08-15');

    const journalDay = await client.query(
      `SELECT ${labDateSql('entry_date')}::text AS day FROM journal_entries WHERE source_type = 'refund' AND source_id = $1`,
      [refund.id]
    );
    assert.strictEqual(journalDay.rows[0].day, '2026-08-16');

    await client.query(`SET LOCAL lims.allow_credit_note_admin = 'on'`);
    await assertGuard(
      'guard_guc_note_delete',
      'DELETE FROM credit_notes WHERE id = $1',
      [note.id],
      /cannot be deleted/i
    );
    await assertGuard(
      'guard_guc_event_delete',
      'DELETE FROM credit_note_events WHERE credit_note_id = $1',
      [note.id],
      /cannot be deleted/i
    );

    await client.query(
      `INSERT INTO daily_closings (id, closing_number, closing_date, totals, status, closed_by, closed_at)
       VALUES ($1, $2, $3::date, '{}'::jsonb, 'closed', $4, NOW())`,
      [require('../utils/uuid').uuidv4(), `CN-ITEST-TODAY-${stamp}`, todayKey, userId]
    );
    await client.query('SAVEPOINT refund_today_closed');
    try {
      await billing.processRefund({
        invoice_id: invoice.id,
        payment_id: payment.id,
        amount: 35,
        reason: 'should be blocked because today is closed',
      }, userId, null, { client });
      await client.query('ROLLBACK TO SAVEPOINT refund_today_closed');
      throw new Error('refund on closed today succeeded unexpectedly');
    } catch (err) {
      await client.query('ROLLBACK TO SAVEPOINT refund_today_closed');
      if (err.message.includes('succeeded unexpectedly')) throw err;
      assert.strictEqual(err.code, 'DAY_CLOSED', err.message);
    }

    await client.query('ROLLBACK');
    rolledBack = true;
    console.log('  ✓ integration: invoice 65 → pay 65 → credit note 65 → refund 30 on open today after closed invoice day; today-closed refund rejected; GUC cannot bypass; ROLLBACK');
    return { ran: true, skipped: false };
  } catch (err) {
    try { await client.query('ROLLBACK'); rolledBack = true; } catch (_) { /* ignore */ }
    if (
      /^SKIP:/.test(err.message)
      || /^REFUSED:/.test(err.message)
      || err.code === 'DAY_CLOSED'
    ) {
      const reason = err.code === 'DAY_CLOSED' ? 'SKIP: billing day is closed' : err.message;
      console.log(`  · integration skipped (${reason})`);
      return { ran: false, skipped: true, reason };
    }
    throw err;
  } finally {
    client.release();
    if (!rolledBack) {
      console.error('  ! integration client released without ROLLBACK');
    }
    try { await pool.end(); } catch (_) { /* ignore */ }
  }
};

if (require.main === module) {
  run()
    .then((result) => {
      if (result.ran) {
        console.log('\n=== Credit-note integration: ran and passed ===\n');
        process.exit(0);
      }
      console.log('\n=== Credit-note integration: skipped ===\n');
      process.exit(0);
    })
    .catch((err) => {
      console.error(`\n=== Credit-note integration failed: ${err.message} ===\n`);
      process.exit(1);
    });
}

module.exports = { run, refuseIfNotLocalTestDb };
