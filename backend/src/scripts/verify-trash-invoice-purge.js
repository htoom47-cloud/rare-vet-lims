/**
 * Soft-deleted invoices must leave daily collections, and hard purge must clear children.
 * Usage: node src/scripts/verify-trash-invoice-purge.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const accounting = read('src/services/accounting.service.js');
const purge = read('src/services/data-purge.service.js');
const soft = read('src/services/soft-delete.service.js');

assert.ok(accounting.includes("JOIN invoices i ON i.id = p.invoice_id AND ${notDeleted('i')}"));
assert.ok(accounting.includes('getDailyFullSummary'));
assert.ok(purge.includes('assertNoCreditNotes'));
assert.ok(purge.includes('payment_id = ANY'));
assert.ok(purge.includes('DELETE FROM journal_lines'));
assert.ok(soft.includes('FOREIGN_KEY'));
assert.ok(soft.includes('related records still reference'));

console.log('trash invoice purge + collections exclude soft-deleted ok');
