/**
 * Tamara checkout + webhook wiring (static checks).
 * Usage: node src/scripts/verify-tamara-billing.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const migrateSrc = fs.readFileSync(path.join(__dirname, 'migrate.js'), 'utf8');
const envSrc = fs.readFileSync(path.join(__dirname, '../config/env.js'), 'utf8');
const featuresSrc = fs.readFileSync(path.join(__dirname, '../utils/staff-features.js'), 'utf8');
const schemasSrc = fs.readFileSync(path.join(__dirname, '../validators/schemas.js'), 'utf8');
const routesSrc = fs.readFileSync(path.join(__dirname, '../routes/billing.routes.js'), 'utf8');
const serviceSrc = fs.readFileSync(path.join(__dirname, '../services/tamara.service.js'), 'utf8');
const ledgerSrc = fs.readFileSync(path.join(__dirname, '../services/ledger.service.js'), 'utf8');
const billingSrc = fs.readFileSync(path.join(__dirname, '../services/billing.service.js'), 'utf8');
const envExample = fs.readFileSync(path.join(__dirname, '../../.env.example'), 'utf8');
const billingUi = fs.readFileSync(
  path.join(__dirname, '../../../frontend/src/pages/Billing.jsx'),
  'utf8',
);
const apiSrc = fs.readFileSync(
  path.join(__dirname, '../../../frontend/src/services/api.js'),
  'utf8',
);

assert.ok(migrateSrc.includes("ADD VALUE IF NOT EXISTS 'tamara'") || migrateSrc.includes("ADD VALUE 'tamara'"));
assert.ok(migrateSrc.includes('CREATE TABLE IF NOT EXISTS tamara_checkouts'));
assert.ok(envSrc.includes('tamaraPayments: process.env.TAMARA_ENABLED'));
assert.ok(envSrc.includes('TAMARA_API_TOKEN'));
assert.ok(envSrc.includes('TAMARA_NOTIFICATION_TOKEN'));
assert.ok(featuresSrc.includes('tamaraPayments:'));
assert.ok(schemasSrc.includes("'tamara'"));
assert.ok(routesSrc.includes("/tamara/webhook"));
assert.ok(routesSrc.indexOf("/tamara/webhook") < routesSrc.indexOf('router.use(authenticate)'));
assert.ok(routesSrc.includes('/invoices/:id/tamara/checkout'));
assert.ok(routesSrc.includes('/invoices/:id/tamara/status'));
assert.ok(serviceSrc.includes('createCheckout'));
assert.ok(serviceSrc.includes('handleWebhook'));
assert.ok(serviceSrc.includes('verifyWebhookToken'));
assert.ok(serviceSrc.includes('recordTamaraPaymentOnce'));
assert.ok(serviceSrc.includes('skipDayAssert: true'));
assert.ok(serviceSrc.includes('alreadyPaidForCheckout'));
assert.ok(!/SELECT[^;]*\bemail\b[^;]*FROM customers/i.test(serviceSrc));
assert.ok(ledgerSrc.includes("method === 'tamara'"));
assert.ok(billingSrc.includes('skipDayAssert'));
assert.ok(envExample.includes('TAMARA_ENABLED'));
assert.ok(envExample.includes('api-sandbox.tamara.co'));
assert.ok(envExample.includes('/api/billing/tamara/webhook'));
assert.ok(envExample.includes('Sandbox checklist'));
assert.ok(billingUi.includes('payWithTamara'));
assert.ok(billingUi.includes('tamaraPayments'));
assert.ok(billingUi.includes("value=\"tamara\""));
assert.ok(billingUi.includes('pollTamaraStatus'));
assert.ok(billingUi.includes('tamaraChannel'));
assert.ok(!billingUi.includes('wa.me'));
assert.ok(serviceSrc.includes("type: 'tamara_checkout'"));
assert.ok(serviceSrc.includes('sendCheckoutLinkToCustomer'));
assert.ok(apiSrc.includes('tamaraCheckout'));
assert.ok(apiSrc.includes('tamaraStatus'));
assert.ok(!serviceSrc.includes('try to settle immediately as well'));
assert.ok(serviceSrc.includes("eventType === 'order_approved'"));
assert.ok(serviceSrc.includes("eventType === 'order_authorised'"));

console.log('tamara billing rules ok');
console.log('Before production: sandbox checklist in backend/.env.example (TAMARA_*). Keep TAMARA_ENABLED=false until verified.');
