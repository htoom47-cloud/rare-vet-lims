/**
 * Vet-supervised sample billing wiring (no DB).
 * Usage: node src/scripts/verify-vet-supervised-billing.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const envSrc = read('config', 'env.js');
const staffSrc = read('utils', 'staff-features.js');
const migrateSrc = read('scripts', 'migrate.js');
const vetSrc = read('utils', 'vet-supervised.js');
const portalSrc = read('services', 'portal.service.js');
const billingSrc = read('services', 'billing.service.js');
const samplesSrc = read('services', 'samples.service.js');
const customersSrc = read('services', 'customers.service.js');
const customersUi = fs.readFileSync(path.join(root, '../../frontend/src/pages/Customers.jsx'), 'utf8');
const workflowUi = fs.readFileSync(path.join(root, '../../frontend/src/pages/WorkflowCase.jsx'), 'utf8');
const samplesUi = fs.readFileSync(path.join(root, '../../frontend/src/pages/Samples.jsx'), 'utf8');
const envExample = fs.readFileSync(path.join(root, '../.env.example'), 'utf8');

assert.ok(envSrc.includes("vetSupervisedSamples: process.env.VET_SUPERVISED_SAMPLES === 'true'"));
assert.ok(staffSrc.includes('vetSupervisedSamples:'));
assert.ok(envExample.includes('VET_SUPERVISED_SAMPLES=false'));
assert.ok(migrateSrc.includes("ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'customer'"));
assert.ok(migrateSrc.includes('supervising_veterinarian_id'));
assert.ok(vetSrc.includes('samplePortalAccessSql'));
assert.ok(vetSrc.includes('assertSupervisingVeterinarian'));
assert.ok(portalSrc.includes('samplePortalAccessSql'));
assert.ok(portalSrc.includes('animalPortalAccessSql'));
assert.ok(!/listInvoices[\s\S]{0,400}samplePortalAccessSql/.test(portalSrc), 'invoices must stay on invoice.customer_id');
assert.ok(billingSrc.includes('resolveSupervisedBilling'));
assert.ok(billingSrc.includes('buildSampleOwnerInvoiceNote'));
assert.ok(samplesSrc.includes('supervising_veterinarian_id'));
assert.ok(samplesSrc.includes('setSupervisingVeterinarian'));
assert.ok(customersSrc.includes('normalizeCustomerKind'));
assert.ok(customersSrc.includes('c.kind ='));
assert.ok(customersSrc.includes('Preserve veterinarian/customer kind') || customersSrc.includes('existing.kind'));
assert.ok(read('validators', 'schemas.js').includes("kind: Joi.string().valid('customer', 'veterinarian')"));
assert.ok(customersUi.includes('kindVeterinarian'));
assert.ok(customersUi.includes('kindFilter'));
assert.ok(workflowUi.includes('supervisingVetId'));
assert.ok(workflowUi.includes('supervising_veterinarian_id'));
assert.ok(samplesUi.includes('setSupervisor'));
assert.ok(samplesUi.includes('vetSupervisedSamples'));

assert.ok(vetSrc.includes("normalizeCustomerKind"));
assert.ok(vetSrc.includes("CUSTOMER_KIND_VETERINARIAN = 'veterinarian'"));
assert.ok(vetSrc.includes('supervising_veterinarian_id = ANY'));
assert.ok(vetSrc.includes('Sample for end client') || vetSrc.includes('العينة باسم العميل'));

console.log('vet supervised billing wiring ok');
