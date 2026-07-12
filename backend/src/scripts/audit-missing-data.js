/**
 * Operational data integrity audit — missing catalog fields, trash FK risks, chem gaps.
 * Run on Render Shell:
 *   cd backend && node src/scripts/audit-missing-data.js
 */
require('dotenv').config();
const { query, pool } = require('../config/database');
const env = require('../config/env');
const { MINDRAY_CHEM_PARAM_DEFS, MINDRAY_CHEM_MAPPINGS } = require('../utils/mindray-chem-map');

const report = {
  ok: [],
  warn: [],
  fail: [],
};

const ok = (msg, detail) => report.ok.push({ msg, detail });
const warn = (msg, detail) => report.warn.push({ msg, detail });
const fail = (msg, detail) => report.fail.push({ msg, detail });

async function auditParasitology() {
  const tests = await query(
    `SELECT t.id, t.code, t.name, t.name_ar, t.is_active, tc.code AS category
     FROM tests t
     LEFT JOIN test_categories tc ON tc.id = t.category_id
     WHERE t.code IN ('PARAS-BLOOD', 'PARAS-STOOL', 'BRUCELLA', 'BRU-ROSE-BENGAL')
        OR t.code ILIKE 'PARAS%'
        OR t.code ILIKE 'BRU%'
     ORDER BY t.code`
  );

  if (!tests.rows.length) {
    fail('Parasitology tests missing entirely', 'PARAS-BLOOD / PARAS-STOOL / BRUCELLA not found');
    return;
  }

  for (const t of tests.rows) {
    const params = await query(
      `SELECT code, name, name_ar, unit, is_active
       FROM test_parameters WHERE test_id = $1 ORDER BY sort_order, code`,
      [t.id]
    );
    const codes = params.rows.map((p) => p.code);
    const result = params.rows.find((p) => p.code === 'RESULT');
    const qualOrganisms = params.rows.filter(
      (p) => p.unit === 'qual' && p.code !== 'RESULT' && p.code !== 'NOTES'
    );

    if (!t.is_active && t.code === 'BRU-ROSE-BENGAL') {
      ok(`${t.code} inactive (expected if consolidated to BRUCELLA)`, null);
    } else if (!t.is_active) {
      warn(`${t.code} is inactive`, t.name_ar || t.name);
    }

    if (!result) {
      fail(`${t.code}: missing RESULT parameter`, 'Negative / “none found” button will fail');
    } else if (result.unit !== 'qual') {
      fail(`${t.code}: RESULT exists but unit is "${result.unit}"`, 'Must be unit=qual');
    } else if (result.is_active === false) {
      fail(`${t.code}: RESULT is inactive`, null);
    } else {
      ok(`${t.code}: RESULT present (qual)`, result.name_ar || result.name);
    }

    if (['PARAS-BLOOD', 'PARAS-STOOL'].includes(t.code) && qualOrganisms.length === 0) {
      warn(`${t.code}: no organism parameters`, 'Only RESULT — cannot pick parasite types');
    } else if (qualOrganisms.length) {
      ok(`${t.code}: ${qualOrganisms.length} organism params`, qualOrganisms.map((p) => p.code).join(', '));
    }
  }

  const required = ['PARAS-BLOOD', 'PARAS-STOOL'];
  for (const code of required) {
    if (!tests.rows.find((t) => t.code === code)) {
      fail(`Required test missing: ${code}`, null);
    }
  }
  const bru = tests.rows.find((t) => t.code === 'BRUCELLA' || t.code === 'BRU-ROSE-BENGAL');
  if (!bru) warn('No BRUCELLA / BRU-ROSE-BENGAL test', 'Malta Rose Bengal panel may be missing');
}

async function auditChemBasic() {
  const test = await query(`SELECT id FROM tests WHERE code = 'CHEM-BASIC' LIMIT 1`);
  if (!test.rows[0]) {
    fail('CHEM-BASIC test missing', null);
    return;
  }
  const params = await query(
    `SELECT code FROM test_parameters WHERE test_id = $1`,
    [test.rows[0].id]
  );
  const byUpper = new Map(params.rows.map((p) => [String(p.code).toUpperCase(), p.code]));
  const missing = [];
  for (const def of MINDRAY_CHEM_PARAM_DEFS) {
    if (!byUpper.has(String(def.code).toUpperCase())) missing.push(def.code);
  }
  if (missing.length) {
    warn('CHEM-BASIC missing Mindray params', missing.join(', '));
  } else {
    ok('CHEM-BASIC has Mindray required params', MINDRAY_CHEM_PARAM_DEFS.map((d) => d.code).join(', '));
  }

  const mindray = await query(
    `SELECT id, is_active FROM device_integrations WHERE name ILIKE '%mindray%' ORDER BY created_at DESC LIMIT 1`
  );
  if (!mindray.rows[0]) {
    warn('Mindray device not registered', null);
  } else {
    ok(`Mindray device active=${mindray.rows[0].is_active}`, mindray.rows[0].id);
    const maps = await query(
      `SELECT COUNT(*)::int AS c FROM device_parameter_mappings
       WHERE device_id = $1 AND is_active = true`,
      [mindray.rows[0].id]
    );
    ok(`Mindray parameter mappings: ${maps.rows[0].c}`, `${MINDRAY_CHEM_MAPPINGS.length} static defs`);
  }
}

async function columnExists(table, column) {
  const r = await query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2 LIMIT 1`,
    [table, column]
  );
  return r.rows.length > 0;
}

async function auditTrash() {
  console.log(`SOFT_DELETE_ENABLED=${!!env.softDelete?.enabled}`);
  if (!(await columnExists('invoices', 'deleted_at'))) {
    warn('Soft-delete columns not migrated on this DB', 'Run migrate.js on this environment');
    return;
  }
  const counts = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM customers WHERE deleted_at IS NOT NULL) AS customers,
      (SELECT COUNT(*)::int FROM samples WHERE deleted_at IS NOT NULL) AS samples,
      (SELECT COUNT(*)::int FROM reports WHERE deleted_at IS NOT NULL) AS reports,
      (SELECT COUNT(*)::int FROM invoices WHERE deleted_at IS NOT NULL) AS invoices,
      (SELECT COUNT(*)::int FROM customers WHERE deleted_at IS NOT NULL AND purge_after <= NOW()) AS customers_expired,
      (SELECT COUNT(*)::int FROM invoices WHERE deleted_at IS NOT NULL AND purge_after <= NOW()) AS invoices_expired,
      (SELECT COUNT(*)::int FROM samples WHERE deleted_at IS NOT NULL AND purge_after <= NOW()) AS samples_expired
  `);
  const c = counts.rows[0];
  ok('Trash counts', `customers=${c.customers} samples=${c.samples} reports=${c.reports} invoices=${c.invoices}`);
  if (c.customers_expired || c.invoices_expired || c.samples_expired) {
    warn('Expired trash awaiting purge',
      `customers=${c.customers_expired} samples=${c.samples_expired} invoices=${c.invoices_expired}`);
  }

  const fkRisk = await query(`
    SELECT COUNT(*)::int AS c
    FROM samples s
    JOIN invoices i ON i.sample_id = s.id
    WHERE s.deleted_at IS NOT NULL AND i.deleted_at IS NULL
  `);
  if (fkRisk.rows[0].c > 0) {
    warn('Soft-deleted samples still linked by active invoices.sample_id', String(fkRisk.rows[0].c));
  } else {
    ok('No active invoice→soft-deleted sample FK conflicts', null);
  }
}

async function auditSamplesAndOps() {
  const hasDeleted = await columnExists('samples', 'deleted_at');
  const delFilter = hasDeleted ? 'WHERE deleted_at IS NULL' : '';
  const unpaidDel = hasDeleted ? 'AND i.deleted_at IS NULL' : '';

  const orphanOwner = await query(`
    SELECT COUNT(*)::int AS c FROM samples s
    JOIN animals a ON a.id = s.animal_id
    WHERE a.owner_id IS DISTINCT FROM s.customer_id
  `);
  if (orphanOwner.rows[0].c) {
    fail('Samples with animal owner ≠ sample customer', String(orphanOwner.rows[0].c));
  } else {
    ok('No owner/customer mismatches on samples', null);
  }

  const unpaid = await query(`
    SELECT COUNT(*)::int AS c FROM invoices i
    LEFT JOIN (SELECT invoice_id, SUM(amount) paid FROM payments GROUP BY invoice_id) p ON p.invoice_id = i.id
    WHERE i.status IN ('issued', 'partial')
      ${unpaidDel}
      AND GREATEST(i.total - COALESCE(p.paid, 0), 0) > 0.01
  `);
  ok('Unpaid invoices (active)', String(unpaid.rows[0].c));

  const pending = await query(`
    SELECT status, COUNT(*)::int AS c FROM samples
    ${delFilter}
    GROUP BY status ORDER BY c DESC
  `);
  ok('Sample status breakdown', pending.rows.map((r) => `${r.status}=${r.c}`).join(', '));
}

async function main() {
  console.log('\n=== Rare Vet LIMS — Missing Data Audit ===\n');
  await auditParasitology();
  await auditChemBasic();
  await auditTrash();
  await auditSamplesAndOps();

  console.log('\n--- FAIL ---');
  if (!report.fail.length) console.log('  (none)');
  for (const r of report.fail) console.log(`  ✗ ${r.msg}${r.detail ? ` | ${r.detail}` : ''}`);

  console.log('\n--- WARN ---');
  if (!report.warn.length) console.log('  (none)');
  for (const r of report.warn) console.log(`  ! ${r.msg}${r.detail ? ` | ${r.detail}` : ''}`);

  console.log('\n--- OK ---');
  for (const r of report.ok) console.log(`  ✓ ${r.msg}${r.detail ? ` | ${r.detail}` : ''}`);

  console.log(`\nSummary: ${report.fail.length} fail, ${report.warn.length} warn, ${report.ok.length} ok`);
  console.log('\nRemediation:');
  console.log('  Parasitology RESULT:  node src/scripts/ensure-parasitology.js');
  console.log('  Mindray chem params:  node src/scripts/setup-mindray-device.js');
  console.log('  Trash purge:          node src/scripts/purge-soft-deleted.js');
  console.log('');

  process.exitCode = report.fail.length ? 1 : 0;
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => pool.end());
