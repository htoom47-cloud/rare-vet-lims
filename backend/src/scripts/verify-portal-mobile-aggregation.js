/**
 * Verify: portal mobile aggregation + duplicate customer guard.
 * Pure unit tests — no database required.
 */
const { normalizeMobileDigits } = require('../utils/helpers');

let pass = 0;
let fail = 0;
const results = [];

function assert(name, condition) {
  if (condition) {
    pass++;
    results.push({ name, ok: true });
  } else {
    fail++;
    results.push({ name, ok: false });
    console.error(`  ✗ FAIL: ${name}`);
  }
}

// ─── 1. normalizeMobileDigits ──────────────────────────────────────
console.log('\n=== 1. Mobile Normalization ===');

assert('05x → 9 digits', normalizeMobileDigits('0541148900') === '541148900');
assert('+966 → 9 digits', normalizeMobileDigits('+966541148900') === '541148900');
assert('966 → 9 digits', normalizeMobileDigits('966541148900') === '541148900');
assert('raw 9 digits', normalizeMobileDigits('541148900') === '541148900');
assert('empty → empty', normalizeMobileDigits('') === '');
assert('null → empty', normalizeMobileDigits(null) === '');
assert('Arabic text → empty', normalizeMobileDigits('لا') === '');
assert('Short → short', normalizeMobileDigits('10') === '10');

// ─── 2. asArray helper (simulate portal.service logic) ─────────────
console.log('\n=== 2. asArray helper ===');

const asArray = (v) => (Array.isArray(v) ? v : [v]);
assert('single ID → array', JSON.stringify(asArray('abc')) === '["abc"]');
assert('array stays array', JSON.stringify(asArray(['a', 'b'])) === '["a","b"]');
assert('empty array stays', JSON.stringify(asArray([])) === '[]');

// ─── 3. Portal aggregation logic (mock) ────────────────────────────
console.log('\n=== 3. Portal Aggregation (mock) ===');

function mockResolvePortalCustomerIds(primaryId, allCustomers) {
  const primary = allCustomers.find((c) => c.id === primaryId);
  if (!primary?.mobile) return [primaryId];
  const digits = normalizeMobileDigits(primary.mobile);
  if (digits.length < 9) return [primaryId];
  const suffix = digits.slice(-9);
  const ids = allCustomers
    .filter((c) => c.is_active && normalizeMobileDigits(c.mobile).endsWith(suffix))
    .map((c) => c.id);
  if (!ids.includes(primaryId)) ids.unshift(primaryId);
  const idx = ids.indexOf(primaryId);
  if (idx > 0) { ids.splice(idx, 1); ids.unshift(primaryId); }
  return ids;
}

const customers = [
  { id: 'cust-A', full_name: 'Ahmad A', mobile: '0541148900', is_active: true },
  { id: 'cust-B', full_name: 'Ahmad B', mobile: '+966541148900', is_active: true },
  { id: 'cust-C', full_name: 'Khalid', mobile: '0542957996', is_active: true },
  { id: 'cust-D', full_name: 'Inactive', mobile: '0541148900', is_active: false },
];

const idsAB = mockResolvePortalCustomerIds('cust-A', customers);
assert('Two customers same mobile → both IDs', idsAB.length === 2);
assert('Primary first', idsAB[0] === 'cust-A');
assert('Sibling included', idsAB.includes('cust-B'));
assert('Inactive excluded', !idsAB.includes('cust-D'));

const idsC = mockResolvePortalCustomerIds('cust-C', customers);
assert('Unique mobile → single ID', idsC.length === 1);
assert('Correct ID', idsC[0] === 'cust-C');

const idsBLogin = mockResolvePortalCustomerIds('cust-B', customers);
assert('Login as B → sees A too', idsBLogin.includes('cust-A'));
assert('Login as B → primary is B', idsBLogin[0] === 'cust-B');

// ─── 4. SQL simulation: ANY vs = ──────────────────────────────────
console.log('\n=== 4. Report Visibility With Aggregation ===');

const reports = [
  { id: 'r1', customer_id: 'cust-A', pdf_url: '/r1.pdf', approved: true },
  { id: 'r2', customer_id: 'cust-A', pdf_url: '/r2.pdf', approved: true },
  { id: 'r3', customer_id: 'cust-B', pdf_url: '/r3.pdf', approved: true },
  { id: 'r4', customer_id: 'cust-C', pdf_url: '/r4.pdf', approved: true },
  { id: 'r5', customer_id: 'cust-A', pdf_url: null, approved: false },
];

function listReports(customerIds) {
  const ids = asArray(customerIds);
  return reports.filter((r) => ids.includes(r.customer_id) && r.pdf_url && r.approved);
}

const oldWay = listReports('cust-A');
assert('Old way: cust-A sees only own reports', oldWay.length === 2);

const newWay = listReports(idsAB);
assert('New way: cust-A sees own + B reports', newWay.length === 3);
assert('Includes r1', newWay.some((r) => r.id === 'r1'));
assert('Includes r2', newWay.some((r) => r.id === 'r2'));
assert('Includes r3 (from B)', newWay.some((r) => r.id === 'r3'));
assert('Excludes r4 (different mobile)', !newWay.some((r) => r.id === 'r4'));
assert('Excludes r5 (no pdf)', !newWay.some((r) => r.id === 'r5'));

// ─── 5. Duplicate Customer Guard ──────────────────────────────────
console.log('\n=== 5. Duplicate Customer Guard ===');

function mockCheckDuplicate(mobile, existingCustomers) {
  if (!mobile || !mobile.trim()) return null;
  const digits = normalizeMobileDigits(mobile);
  if (digits.length < 9) return null;
  const suffix = digits.slice(-9);
  return existingCustomers.find(
    (c) => c.is_active && normalizeMobileDigits(c.mobile).endsWith(suffix)
  ) || null;
}

function mockCreate(data, role, existingCustomers) {
  const dup = mockCheckDuplicate(data.mobile, existingCustomers);
  if (dup) {
    const isOverride = role === 'admin' || role === 'manager';
    if (!isOverride) {
      return { error: 'DUPLICATE_MOBILE', existingName: dup.full_name };
    }
    return { created: true, warning: 'duplicate_override' };
  }
  return { created: true };
}

const existing = [
  { id: 'c1', full_name: 'Existing', mobile: '0541148900', is_active: true },
];

const recepResult = mockCreate({ mobile: '0541148900' }, 'reception', existing);
assert('Reception blocked from duplicate', recepResult.error === 'DUPLICATE_MOBILE');

const adminResult = mockCreate({ mobile: '0541148900' }, 'admin', existing);
assert('Admin can override duplicate', adminResult.created === true);

const managerResult = mockCreate({ mobile: '0541148900' }, 'manager', existing);
assert('Manager can override duplicate', managerResult.created === true);

const techResult = mockCreate({ mobile: '0541148900' }, 'lab_technician', existing);
assert('Lab tech blocked from duplicate', techResult.error === 'DUPLICATE_MOBILE');

const newMobile = mockCreate({ mobile: '0549999999' }, 'reception', existing);
assert('New mobile → no block', newMobile.created === true);

const emptyMobile = mockCreate({ mobile: '' }, 'reception', existing);
assert('Empty mobile → no block', emptyMobile.created === true);

const shortMobile = mockCreate({ mobile: '10' }, 'reception', existing);
assert('Short mobile → no block', shortMobile.created === true);

const formatVariant = mockCreate({ mobile: '+966541148900' }, 'reception', existing);
assert('+966 format detects duplicate', formatVariant.error === 'DUPLICATE_MOBILE');

// ─── 6. Phase 13: ready-reports utils (verify still works) ────────
console.log('\n=== 6. Phase 13: Ready Reports Utils ===');

const {
  isReportReadyForCustomer,
  buildConsolidatedReportMessage,
  findDuplicateReportIds,
  extractSentReportIds,
} = require('../services/customer-report-notifications.utils');

assert('Report with PDF + approval → ready',
  isReportReadyForCustomer({ pdf_url: '/x.pdf', lab_specialist_approved_by: 'u1', is_final: true })
);
assert('Report without PDF → not ready',
  !isReportReadyForCustomer({ pdf_url: null, lab_specialist_approved_by: 'u1' })
);
assert('Report with PDF + is_final null → ready (NULL is not false)',
  isReportReadyForCustomer({ pdf_url: '/x.pdf', is_final: null })
);
assert('Report is_final=false, no approval → not ready',
  !isReportReadyForCustomer({ pdf_url: '/x.pdf', is_final: false })
);

const msg = buildConsolidatedReportMessage({
  customerName: 'أحمد',
  reports: [
    { report_number: 'RPT-001', animal_name: 'Leo' },
    { report_number: 'RPT-002', animal_name: 'Rex' },
  ],
  portalUrl: 'https://portal.example.com',
  labNameAr: 'مركز رعاية النوادر البيطري',
});
assert('Consolidated message has customer name', msg.includes('أحمد'));
assert('Consolidated message has both reports', msg.includes('RPT-001') && msg.includes('RPT-002'));
assert('Consolidated message has portal URL', msg.includes('https://portal.example.com'));

const sentRows = [
  { metadata: { type: 'customer_report_batch', report_ids: ['r1', 'r2'] } },
];
const sentIds = extractSentReportIds(sentRows);
assert('extractSentReportIds finds sent IDs', sentIds.has('r1') && sentIds.has('r2'));

const dups = findDuplicateReportIds(['r1', 'r3'], sentIds);
assert('findDuplicateReportIds detects r1', dups.includes('r1'));
assert('findDuplicateReportIds does not flag r3', !dups.includes('r3'));

// ─── 7. Portal visibility SQL check ───────────────────────────────
console.log('\n=== 7. Portal Visibility SQL ===');

const portalSync = require('../services/portal-sync.service');
const visSql = portalSync.portalVisibilitySql('r');
assert('portalVisibilitySql requires pdf_url', visSql.includes('pdf_url IS NOT NULL'));
assert('portalVisibilitySql checks approval or is_final',
  visSql.includes('lab_specialist_approved_by') || visSql.includes('is_final')
);

// ─── Summary ──────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
console.log(`  Results: ${pass} passed, ${fail} failed (${pass + fail} total)`);
console.log('═'.repeat(60));

if (fail > 0) {
  console.log('\nFailed tests:');
  results.filter((r) => !r.ok).forEach((r) => console.log(`  ✗ ${r.name}`));
  process.exit(1);
}

console.log('\n✓ All tests passed.\n');
