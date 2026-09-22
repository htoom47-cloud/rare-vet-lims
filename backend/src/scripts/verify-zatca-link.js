/**
 * ZATCA link is sandbox onboarding only and must not touch invoices.
 * Usage: node src/scripts/verify-zatca-link.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const zatcaSrc = fs.readFileSync(path.join(__dirname, '../services/zatca.service.js'), 'utf8');
const billingSrc = fs.readFileSync(path.join(__dirname, '../services/billing.service.js'), 'utf8');
const routesSrc = fs.readFileSync(path.join(__dirname, '../routes/billing.routes.js'), 'utf8');
const envSrc = fs.readFileSync(path.join(__dirname, '../config/env.js'), 'utf8');

assert.ok(!/UPDATE invoices|INSERT INTO invoices|createInvoice/.test(zatcaSrc));
assert.ok(!/zatca/i.test(billingSrc));
assert.ok(/router\.(get|put)\('\/zatca'/.test(routesSrc));
assert.ok(/router\.post\('\/zatca\/onboard'/.test(routesSrc));
assert.ok(/zatcaEinvoice: process\.env\.ZATCA_EINVOICE_ENABLED === 'true'/.test(envSrc));
assert.ok(zatcaSrc.includes('developer-portal') || fs.readFileSync(path.join(__dirname, '../utils/zatca-config.js'), 'utf8').includes('developer-portal'));

const { publicView, mergePublicFields } = require('../utils/zatca-config');
const view = publicView({
  private_key_pem: 'SECRET',
  secret: 'SECRET',
  binary_security_token: 'TOKEN',
  vat_number: '311042487300003',
  status: 'sandbox_linked',
});
assert.strictEqual(view.has_certificate, true);
assert.strictEqual(view.private_key_pem, undefined);
assert.strictEqual(view.secret, undefined);
assert.strictEqual(mergePublicFields({}, { vat_number: '3110-424-873-00003' }).vat_number, '311042487300003');

console.log('zatca link wiring ok');
