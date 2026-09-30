/**
 * AR balance must refresh after invoice trash / hard purge.
 * Usage: node src/scripts/verify-ar-balance-sync.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const accountingSrc = fs.readFileSync(path.join(__dirname, '../services/accounting.service.js'), 'utf8');
const purgeSrc = fs.readFileSync(path.join(__dirname, '../services/data-purge.service.js'), 'utf8');
const softSrc = fs.readFileSync(path.join(__dirname, '../services/soft-delete.service.js'), 'utf8');
const migrateSrc = fs.readFileSync(path.join(__dirname, 'migrate.js'), 'utf8');

assert.ok(/resyncAllCustomerArBalances/.test(accountingSrc));
assert.ok(/UPDATE customers c SET account_balance/.test(accountingSrc));
assert.ok(/syncCustomerArBalance\(customerId, client\)/.test(purgeSrc));
assert.ok(/SELECT customer_id FROM invoices WHERE id = \$1/.test(purgeSrc));
assert.ok(/syncCustomerArBalance\(row\.customer_id, client\)/.test(softSrc));
assert.ok(/syncCustomerArBalance\(restored\.customer_id, client\)/.test(softSrc));
assert.ok(/resyncAllCustomerArBalances\(client\)/.test(migrateSrc));

console.log('ar balance sync wiring ok');
