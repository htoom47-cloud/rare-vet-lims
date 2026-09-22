/**
 * ZATCA link wiring: sandbox onboarding, gated live submit, no invoice-row mutation.
 * Usage: node src/scripts/verify-zatca-link.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const zatcaSrc = fs.readFileSync(path.join(__dirname, '../services/zatca.service.js'), 'utf8');
const billingSrc = fs.readFileSync(path.join(__dirname, '../services/billing.service.js'), 'utf8');
const routesSrc = fs.readFileSync(path.join(__dirname, '../routes/billing.routes.js'), 'utf8');
const envSrc = fs.readFileSync(path.join(__dirname, '../config/env.js'), 'utf8');
const configSrc = fs.readFileSync(path.join(__dirname, '../utils/zatca-config.js'), 'utf8');

assert.ok(!/UPDATE invoices|INSERT INTO invoices/.test(zatcaSrc));
assert.ok(!/createInvoice/.test(zatcaSrc));
assert.ok(/submitIssuedInvoiceSafe/.test(billingSrc));
assert.ok(/live submit must never block billing/.test(billingSrc));
assert.ok(/!options\.client/.test(billingSrc));
assert.ok(/router\.(get|put)\('\/zatca'/.test(routesSrc));
assert.ok(/router\.post\('\/zatca\/onboard'/.test(routesSrc));
assert.ok(/router\.post\('\/zatca\/compliance-tests'/.test(routesSrc));
assert.ok(/runComplianceTests/.test(zatcaSrc));
assert.ok(/requestSandboxProductionCsid/.test(zatcaSrc));
assert.ok(/router\.post\('\/zatca\/production-csid'/.test(routesSrc));
assert.ok(!/issueProductionCertificate|finishOnboarding/.test(zatcaSrc));
assert.ok(/reportInvoice/.test(zatcaSrc));
assert.ok(!/clearanceInvoice|invoices\/clearance/.test(zatcaSrc));
assert.ok(/zatcaEinvoice !== true/.test(zatcaSrc));
assert.ok(/sandbox_not_live/.test(zatcaSrc));
assert.ok(/PREZATCA-Code-Signing/.test(zatcaSrc));
assert.ok(/TSTZATCA-Code-Signing/.test(zatcaSrc));
assert.ok(/zatcaEinvoice: process\.env\.ZATCA_EINVOICE_ENABLED === 'true'/.test(envSrc));
assert.ok(configSrc.includes('developer-portal'));
assert.ok(configSrc.includes('e-invoicing/core'));

const { publicView, mergePublicFields, productionNeedsRefresh, sdkEnvironment, ENVIRONMENTS } = require('../utils/zatca-config');
const view = publicView({
  private_key_pem: 'SECRET',
  secret: 'SECRET',
  binary_security_token: 'TOKEN',
  vat_number: '311042487300003',
  status: 'sandbox_linked',
  street: 'King Fahd',
  building_number: '4371',
  city_subdivision: 'Al Muzahimiyah',
  city: 'Al Muzahimiyah',
  postal_code: '13771',
});
assert.strictEqual(view.has_certificate, true);
assert.strictEqual(view.has_production_certificate, false);
assert.strictEqual(view.production_status, 'not_issued');
assert.strictEqual(view.private_key_pem, undefined);
assert.strictEqual(view.secret, undefined);
assert.strictEqual(view.address_ready, true);
assert.strictEqual(view.send_live_invoices, false);
assert.strictEqual(ENVIRONMENTS.core, 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core');
assert.strictEqual(sdkEnvironment('core'), 'production');
assert.strictEqual(sdkEnvironment('simulation'), 'simulation');
assert.strictEqual(sdkEnvironment('sandbox'), 'sandbox');
assert.ok(/sdkEnvironment\(stored\.environment\)/.test(zatcaSrc));
assert.strictEqual(mergePublicFields({}, { vat_number: '3110-424-873-00003' }).vat_number, '311042487300003');
assert.strictEqual(mergePublicFields({}, { building_number: '4371', postal_code: '13771' }).building_number, '4371');
assert.strictEqual(productionNeedsRefresh({
  production_binary_security_token: 'OLD',
  production_secret: 'OLD',
  production_linked_at: '2026-09-22T10:02:00.000Z',
  compliance_ran_at: '2026-09-22T10:40:00.000Z',
}), true);
assert.strictEqual(publicView({
  production_binary_security_token: 'OLD',
  production_secret: 'OLD',
  private_key_pem: 'SECRET',
  production_linked_at: '2026-09-22T10:02:00.000Z',
  compliance_ran_at: '2026-09-22T10:40:00.000Z',
}).production_needs_refresh, true);

console.log('zatca link wiring ok');
