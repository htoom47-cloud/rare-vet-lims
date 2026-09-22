/**
 * Live-send safety: simplified B2C only, skip incomplete seller address,
 * never enable by default, never mutate invoice rows.
 * Usage: node src/scripts/verify-zatca-live-safety.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { buildLiveInvoice, sellerAddressReady, sellerAddress } = require('../utils/zatca-invoice-map');

const zatcaSrc = fs.readFileSync(path.join(__dirname, '../services/zatca.service.js'), 'utf8');
const billingSrc = fs.readFileSync(path.join(__dirname, '../services/billing.service.js'), 'utf8');
const envSrc = fs.readFileSync(path.join(__dirname, '../config/env.js'), 'utf8');

const cfg = {
  vat_number: '311042487300003',
  organization: 'Rare Vet Care',
  organization_unit: 'Lab',
  street: 'King Fahd',
  building_number: '4371',
  city_subdivision: 'Al Muzahimiyah',
  city: 'Al Muzahimiyah',
  postal_code: '13771',
  country_subentity: 'Riyadh',
};

const invoice = {
  id: '11111111-1111-1111-1111-111111111111',
  invoice_number: 'INV-1001',
  discount_amount: 0,
  field_visit_discount_amount: 0,
  tax_amount: 15,
  total: 115,
  created_at: '2026-09-22T10:00:00.000Z',
};

const items = [{ description: 'CBC', quantity: 1, total_price: 100 }];

const ready = buildLiveInvoice({
  invoice,
  items,
  cfg,
  customerName: 'عميل تجريبي',
  invoiceCounterValue: 1,
  previousInvoiceHash: 'x'.repeat(64),
  issueDate: '2026-09-22',
});
assert.strictEqual(ready.ok, true);
assert.strictEqual(ready.invoice.invoiceSubType, '0200000');
assert.strictEqual(ready.invoice.invoiceTypeCode, '388');
assert.ok(!ready.invoice.buyer?.vatNumber);

const incomplete = buildLiveInvoice({
  invoice,
  items,
  cfg: { ...cfg, building_number: '12' },
  invoiceCounterValue: 1,
  previousInvoiceHash: 'x'.repeat(64),
  issueDate: '2026-09-22',
});
assert.strictEqual(incomplete.ok, false);
assert.strictEqual(incomplete.reason, 'seller_address_incomplete');

const badVat = buildLiveInvoice({
  invoice,
  items,
  cfg: { ...cfg, vat_number: '123' },
  invoiceCounterValue: 1,
  previousInvoiceHash: 'x'.repeat(64),
  issueDate: '2026-09-22',
});
assert.strictEqual(badVat.ok, false);
assert.strictEqual(badVat.reason, 'seller_vat_invalid');

assert.strictEqual(sellerAddressReady(sellerAddress({})), false);
assert.ok(sellerAddressReady(sellerAddress(cfg)));

assert.ok(/ZATCA_EINVOICE_ENABLED === 'true'/.test(envSrc));
assert.ok(!/ZATCA_EINVOICE_ENABLED === 'true' \|\|/.test(envSrc));
assert.ok(/submitIssuedInvoiceSafe/.test(billingSrc));
assert.ok(/void zatcaService\.submitIssuedInvoiceSafe/.test(billingSrc));
assert.ok(!/UPDATE invoices|INSERT INTO invoices/.test(zatcaSrc));
assert.ok(!/clearanceInvoice/.test(zatcaSrc));
assert.ok(/environment !== 'simulation' && stored.environment !== 'core'/.test(zatcaSrc)
  || /sandbox_not_live/.test(zatcaSrc));

console.log('zatca live safety ok');
