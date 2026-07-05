require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');
const logger = require('../config/logger');
const { ensureAdmin } = require('./ensure-admin');
const { ensureParasitologyCatalog } = require('./ensure-parasitology');
const { syncPermissionsCatalog, syncRolePermissions } = require('../utils/sync-permissions');

async function syncLabContactInfo(client) {
  const NEW_PHONE = process.env.LAB_PHONE || '0115007257';
  const NEW_VAT = process.env.VAT_NUMBER || '311042487300003';
  const NEW_EMAIL = process.env.LAB_EMAIL || 'alnwader.10hz@gmail.com';

  const applyContact = (obj) => {
    if (!obj || typeof obj !== 'object') return false;
    let changed = false;
    if (obj.phone !== NEW_PHONE) { obj.phone = NEW_PHONE; changed = true; }
    if (obj.vat_number !== NEW_VAT) { obj.vat_number = NEW_VAT; changed = true; }
    if (obj.vat !== NEW_VAT) { obj.vat = NEW_VAT; changed = true; }
    if (obj.email !== NEW_EMAIL) { obj.email = NEW_EMAIL; changed = true; }
    return changed;
  };

  for (const key of ['invoice_template', 'lab_info']) {
    const row = await client.query('SELECT value FROM settings WHERE key = $1', [key]);
    if (!row.rows[0]?.value) continue;
    const value = row.rows[0].value;
    const parsed = typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : JSON.parse(value);
    let changed = false;
    if (key === 'invoice_template') {
      parsed.lab = { ...(parsed.lab || {}) };
      changed = applyContact(parsed.lab);
    } else {
      changed = applyContact(parsed);
    }
    if (changed) {
      await client.query(
        'UPDATE settings SET value = $1, updated_at = NOW() WHERE key = $2',
        [JSON.stringify(parsed), key]
      );
      logger.info(`Lab contact info updated in settings:${key}`);
    }
  }

  await client.query('UPDATE invoices SET pdf_url = NULL WHERE pdf_url IS NOT NULL');
  await client.query('UPDATE price_quotes SET pdf_url = NULL WHERE pdf_url IS NOT NULL');
  logger.info('Invoice and quote PDF cache cleared for lab contact refresh');
}

async function backfillUsernames(client) {
  const hasCol = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'username'`
  );
  if (!hasCol.rows[0]) {
    await client.query('ALTER TABLE users ADD COLUMN username VARCHAR(50)');
  }

  const users = await client.query('SELECT id, email, username FROM users');
  for (const u of users.rows) {
    if (u.username) continue;
    let base = (u.email || 'user').split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (base.length < 3) base = `user${base}`;
    let candidate = base;
    let n = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const exists = await client.query(
        'SELECT id FROM users WHERE LOWER(username) = $1 AND id != $2',
        [candidate, u.id]
      );
      if (!exists.rows[0]) break;
      candidate = `${base}${n++}`;
    }
    await client.query('UPDATE users SET username = $1 WHERE id = $2', [candidate, u.id]);
  }

  await client.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username))'
  );
}

async function disableUpdatedAtTriggers(client) {
  const tables = ['users', 'customers', 'animals', 'samples', 'tests', 'invoices', 'inventory_items'];
  for (const table of tables) {
    try {
      await client.query(`ALTER TABLE ${table} DISABLE TRIGGER USER`);
    } catch (err) {
      logger.warn(`Could not disable triggers on ${table}`, { error: err.message });
    }
  }
}

async function ensureLabSpecialistRole(client) {
  await client.query(
    `INSERT INTO roles (name, name_ar, description)
     VALUES ('lab_specialist', 'أخصائي مختبر', 'Laboratory specialist')
     ON CONFLICT (name) DO UPDATE SET name_ar = EXCLUDED.name_ar, description = EXCLUDED.description`
  );
  await syncRolePermissions(client);
}

async function ensureUniqueLimsReferenceRanges(client) {
  await client.query(`
    WITH ranked AS (
      SELECT id,
        ROW_NUMBER() OVER (
          PARTITION BY parameter_id, animal_type
          ORDER BY
            CASE
              WHEN notes IS NOT NULL
                AND notes NOT LIKE 'Norma:%'
                AND notes NOT LIKE 'Synced from%' THEN 0
              WHEN notes IS NULL OR TRIM(notes) = '' THEN 1
              ELSE 2
            END,
            id DESC
        ) AS rn
      FROM test_reference_ranges
    )
    DELETE FROM test_reference_ranges tr
    USING ranked r
    WHERE tr.id = r.id AND r.rn > 1
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_test_reference_ranges_param_species
    ON test_reference_ranges (parameter_id, animal_type)
  `);
}

/**
 * P0 Hotfix: Remove duplicate sample_tests with the same (sample_id, test_id).
 * Keeps the one with validated results, or the one with result values, or the newest.
 * Removes duplicates only when safe (no validated results on the duplicate).
 */
async function fixDuplicateSampleTests(client) {
  const dupes = await client.query(`
    SELECT sample_id, test_id, COUNT(*) AS cnt
    FROM sample_tests
    GROUP BY sample_id, test_id
    HAVING COUNT(*) > 1
  `);

  if (!dupes.rows.length) return;
  logger.info(`Found ${dupes.rows.length} sample_test duplicate groups — fixing`);

  for (const { sample_id, test_id } of dupes.rows) {
    const entries = await client.query(
      `SELECT st.id,
              EXISTS (SELECT 1 FROM results r WHERE r.sample_test_id = st.id AND r.is_validated = true) AS has_validated,
              EXISTS (SELECT 1 FROM results r JOIN result_values rv ON rv.result_id = r.id WHERE r.sample_test_id = st.id) AS has_values,
              EXISTS (SELECT 1 FROM results r WHERE r.sample_test_id = st.id) AS has_results,
              st.created_at
       FROM sample_tests st
       WHERE st.sample_id = $1 AND st.test_id = $2
       ORDER BY
         (EXISTS (SELECT 1 FROM results r WHERE r.sample_test_id = st.id AND r.is_validated = true)) DESC,
         (EXISTS (SELECT 1 FROM results r JOIN result_values rv ON rv.result_id = r.id WHERE r.sample_test_id = st.id)) DESC,
         st.created_at DESC`,
      [sample_id, test_id]
    );

    const keep = entries.rows[0];
    const toRemove = entries.rows.slice(1);

    for (const dup of toRemove) {
      if (dup.has_validated) {
        logger.warn(`Skipping duplicate ${dup.id} — has validated results (sample=${sample_id}, test=${test_id})`);
        continue;
      }
      // Delete result_values → results → sample_test
      if (dup.has_results) {
        await client.query(
          `DELETE FROM result_values WHERE result_id IN (SELECT id FROM results WHERE sample_test_id = $1)`,
          [dup.id]
        );
        await client.query(`DELETE FROM results WHERE sample_test_id = $1`, [dup.id]);
      }
      await client.query(`DELETE FROM sample_tests WHERE id = $1`, [dup.id]);
      logger.info(`Removed duplicate sample_test ${dup.id} (kept ${keep.id}) for sample=${sample_id}`);
    }
  }

  // Reconcile sample statuses for affected samples
  await client.query(`
    UPDATE samples s SET
      status = 'completed',
      completed_date = COALESCE(s.completed_date, NOW()),
      updated_at = NOW()
    WHERE s.id IN (SELECT DISTINCT sample_id FROM sample_tests)
      AND s.status IN ('received', 'running')
      AND NOT EXISTS (
        SELECT 1 FROM sample_tests st
        WHERE st.sample_id = s.id
          AND NOT EXISTS (
            SELECT 1 FROM results r WHERE r.sample_test_id = st.id AND r.is_validated = true
          )
      )
  `);

  // Add unique constraint to prevent recurrence
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_sample_tests_sample_test
    ON sample_tests (sample_id, test_id)
  `);
  logger.info('Unique constraint on sample_tests(sample_id, test_id) ensured');
}

async function applyPatches() {
  const client = await pool.connect();
  try {
    await disableUpdatedAtTriggers(client);
    await client.query(
      'ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS animal_id UUID REFERENCES animals(id)'
    );
    await backfillUsernames(client);
    await client.query('ALTER TABLE reports ADD COLUMN IF NOT EXISTS ai_interpretation TEXT');
    await client.query('ALTER TABLE reports ADD COLUMN IF NOT EXISTS treatment_recommendations TEXT');
    await client.query('ALTER TABLE reports ADD COLUMN IF NOT EXISTS lab_specialist_approved_by UUID REFERENCES users(id)');
    await client.query('ALTER TABLE reports ADD COLUMN IF NOT EXISTS lab_specialist_approved_at TIMESTAMPTZ');
    await client.query('ALTER TABLE reports ADD COLUMN IF NOT EXISTS vet_approved_by UUID REFERENCES users(id)');
    await client.query('ALTER TABLE reports ADD COLUMN IF NOT EXISTS vet_approved_at TIMESTAMPTZ');
    await client.query('ALTER TABLE reports ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1');
    await client.query('ALTER TABLE reports ADD COLUMN IF NOT EXISTS last_generated_at TIMESTAMPTZ');
    await client.query('ALTER TABLE reports ADD COLUMN IF NOT EXISTS last_source_updated_at TIMESTAMPTZ');
    await client.query('ALTER TABLE reports ADD COLUMN IF NOT EXISTS needs_update BOOLEAN DEFAULT false');
    await client.query('ALTER TABLE reports ADD COLUMN IF NOT EXISTS update_reason TEXT');
    await client.query(`
      UPDATE reports
      SET version = COALESCE(version, 1),
          last_generated_at = COALESCE(last_generated_at, created_at),
          needs_update = COALESCE(needs_update, false)
      WHERE last_generated_at IS NULL OR version IS NULL
    `);
    await ensureLabSpecialistRole(client);
    await client.query(
      'ALTER TABLE tests ADD COLUMN IF NOT EXISTS label_copies INTEGER NOT NULL DEFAULT 1'
    );
    await client.query(
      'ALTER TABLE tests ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0'
    );
    await client.query(`
      CREATE TABLE IF NOT EXISTS result_attachments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        result_id UUID NOT NULL REFERENCES results(id) ON DELETE CASCADE,
        parameter_id UUID REFERENCES test_parameters(id) ON DELETE SET NULL,
        file_url TEXT NOT NULL,
        caption TEXT,
        sort_order INTEGER DEFAULT 0,
        uploaded_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_result_attachments_result ON result_attachments(result_id)'
    );
    await client.query(
      `UPDATE tests SET category_id = (SELECT id FROM test_categories WHERE code = 'MICRO')
       WHERE code IN ('PARAS-BLOOD', 'PARAS-STOOL', 'BRU-ROSE-BENGAL')
         AND EXISTS (SELECT 1 FROM test_categories WHERE code = 'MICRO')`
    );
    await client.query(`UPDATE test_categories SET is_active = false WHERE code = 'PARAS'`);
    await ensureParasitologyCatalog();
    await syncPermissionsCatalog(client);
    await syncRolePermissions(client);
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_otp_codes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        otp_hash VARCHAR(64) NOT NULL,
        attempts INTEGER DEFAULT 0,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_customer_otp_customer ON customer_otp_codes(customer_id, created_at DESC)'
    );
    await client.query('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pdf_url TEXT');
    await client.query(`
      CREATE TABLE IF NOT EXISTS ledger_accounts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        code VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        name_ar VARCHAR(100),
        type VARCHAR(20) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS journal_entries (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        entry_date TIMESTAMPTZ DEFAULT NOW(),
        description VARCHAR(255),
        source_type VARCHAR(50),
        source_id UUID,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS journal_lines (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
        account_id UUID NOT NULL REFERENCES ledger_accounts(id),
        debit DECIMAL(12,2) DEFAULT 0,
        credit DECIMAL(12,2) DEFAULT 0
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(entry_date DESC)');
    try {
      await client.query(`ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'partial_refunded'`);
    } catch (_) {
      try { await client.query(`ALTER TYPE invoice_status ADD VALUE 'partial_refunded'`); } catch (e) { /* exists */ }
    }
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_closings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        closing_number VARCHAR(50) UNIQUE NOT NULL,
        closing_date DATE NOT NULL,
        totals JSONB NOT NULL DEFAULT '{}',
        status VARCHAR(20) DEFAULT 'closed',
        closed_by UUID REFERENCES users(id),
        closed_at TIMESTAMPTZ,
        reopened_by UUID REFERENCES users(id),
        reopened_at TIMESTAMPTZ,
        pdf_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_daily_closings_date ON daily_closings(closing_date DESC)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS accounting_reports (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        report_type VARCHAR(50) NOT NULL,
        params JSONB DEFAULT '{}',
        generated_by UUID REFERENCES users(id),
        file_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS price_quotes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        quote_number VARCHAR(50) UNIQUE NOT NULL,
        customer_id UUID REFERENCES customers(id),
        customer_name VARCHAR(255) NOT NULL,
        customer_name_ar VARCHAR(255),
        customer_mobile VARCHAR(50),
        subtotal DECIMAL(12,2) NOT NULL,
        discount_amount DECIMAL(12,2) DEFAULT 0,
        discount_percent DECIMAL(5,2) DEFAULT 0,
        tax_rate DECIMAL(5,2) DEFAULT 15,
        tax_amount DECIMAL(12,2) NOT NULL,
        total DECIMAL(12,2) NOT NULL,
        notes TEXT,
        valid_until DATE,
        status VARCHAR(20) DEFAULT 'sent',
        pdf_url TEXT,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS price_quote_items (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        quote_id UUID NOT NULL REFERENCES price_quotes(id) ON DELETE CASCADE,
        test_id UUID REFERENCES tests(id),
        package_id UUID REFERENCES packages(id),
        description VARCHAR(255) NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        unit_price DECIMAL(12,2) NOT NULL,
        total_price DECIMAL(12,2) NOT NULL
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_price_quotes_created ON price_quotes(created_at DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_price_quote_items_quote ON price_quote_items(quote_id)');
    await client.query(`
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_percent DECIMAL(5,2) DEFAULT 0
    `);
    await client.query(`
      ALTER TABLE price_quotes ADD COLUMN IF NOT EXISTS discount_percent DECIMAL(5,2) DEFAULT 0
    `);
    await client.query('ALTER TABLE animals ADD COLUMN IF NOT EXISTS breed VARCHAR(100)');
    try {
      await client.query(`ALTER TYPE animal_type ADD VALUE IF NOT EXISTS 'other'`);
    } catch (_) {
      try { await client.query(`ALTER TYPE animal_type ADD VALUE 'other'`); } catch (e) { /* exists */ }
    }
    await client.query(`
      UPDATE animals SET animal_type = 'other'
      WHERE animal_type::text IN ('bird', 'cat', 'dog')
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS device_reference_ranges (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        device_name VARCHAR(255) NOT NULL,
        device_id UUID REFERENCES device_integrations(id) ON DELETE SET NULL,
        parameter_code VARCHAR(50) NOT NULL,
        parameter_name VARCHAR(255),
        species VARCHAR(50) NOT NULL,
        unit VARCHAR(50),
        low_value DECIMAL(14,4) NOT NULL,
        high_value DECIMAL(14,4) NOT NULL,
        source VARCHAR(50) DEFAULT 'device',
        last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_device_ref_ranges_unique
      ON device_reference_ranges (device_name, parameter_code, species, COALESCE(unit, ''))
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_device_ref_ranges_species
      ON device_reference_ranges (species, parameter_code)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS device_reference_range_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        device_reference_range_id UUID REFERENCES device_reference_ranges(id) ON DELETE SET NULL,
        device_name VARCHAR(255) NOT NULL,
        parameter_code VARCHAR(50) NOT NULL,
        species VARCHAR(50) NOT NULL,
        unit VARCHAR(50),
        old_low_value DECIMAL(14,4),
        old_high_value DECIMAL(14,4),
        new_low_value DECIMAL(14,4) NOT NULL,
        new_high_value DECIMAL(14,4) NOT NULL,
        change_reason VARCHAR(50) DEFAULT 'device_sync',
        message_id UUID REFERENCES device_messages(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_device_ref_logs_created
      ON device_reference_range_logs (created_at DESC)
    `);
    await client.query(`
      ALTER TABLE device_reference_ranges
        ADD COLUMN IF NOT EXISTS reference_text TEXT
    `);
    await client.query(`
      ALTER TABLE device_reference_ranges
        ALTER COLUMN low_value DROP NOT NULL,
        ALTER COLUMN high_value DROP NOT NULL
    `);
    await client.query(`
      ALTER TABLE test_reference_ranges
        ADD COLUMN IF NOT EXISTS sex VARCHAR(20),
        ADD COLUMN IF NOT EXISTS age_min INTEGER,
        ADD COLUMN IF NOT EXISTS age_max INTEGER,
        ADD COLUMN IF NOT EXISTS age_unit VARCHAR(20),
        ADD COLUMN IF NOT EXISTS device_id UUID REFERENCES device_integrations(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS text_reference TEXT,
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()
    `);
    await client.query(`
      ALTER TABLE result_attachments
        ADD COLUMN IF NOT EXISTS include_in_report BOOLEAN DEFAULT true
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS device_parameter_mappings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        device_id UUID REFERENCES device_integrations(id) ON DELETE SET NULL,
        device_name VARCHAR(255) NOT NULL DEFAULT 'Norma CBC',
        device_parameter_code VARCHAR(80) NOT NULL,
        system_parameter_id UUID NOT NULL REFERENCES test_parameters(id) ON DELETE CASCADE,
        display_name_ar VARCHAR(255),
        display_name_en VARCHAR(255),
        unit VARCHAR(50),
        value_type VARCHAR(20) DEFAULT 'numeric',
        is_active BOOLEAN DEFAULT true,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_dpm_device_code
      ON device_parameter_mappings (device_name, UPPER(device_parameter_code))
      WHERE is_active = true
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS reference_range_audit_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        reference_range_id UUID,
        user_id UUID REFERENCES users(id),
        action VARCHAR(50) NOT NULL,
        old_value JSONB,
        new_value JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ref_range_audit_created
      ON reference_range_audit_logs (created_at DESC)
    `);
    await client.query(`
      ALTER TABLE device_parameter_mappings
        ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0
    `);
    await client.query(`
      ALTER TABLE test_parameters
        ADD COLUMN IF NOT EXISTS device_code VARCHAR(80),
        ADD COLUMN IF NOT EXISTS short_code VARCHAR(50),
        ADD COLUMN IF NOT EXISTS show_in_report BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS value_type VARCHAR(20) DEFAULT 'numeric',
        ADD COLUMN IF NOT EXISTS category VARCHAR(50)
    `);
    await client.query(`
      UPDATE test_parameters tp
      SET device_code = dpm.device_parameter_code
      FROM device_parameter_mappings dpm
      WHERE dpm.system_parameter_id = tp.id
        AND dpm.is_active = true
        AND (tp.device_code IS NULL OR TRIM(tp.device_code) = '')
    `);
    const { seedNormaCbcMappings } = require('../services/device-parameter-mappings.service');
    await seedNormaCbcMappings(client);
    await syncLabContactInfo(client);
    await ensureUniqueLimsReferenceRanges(client);
    await client.query(`
      ALTER TABLE sample_tests
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()
    `);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum
          WHERE enumlabel = 'cancelled'
            AND enumtypid = 'sample_status'::regtype
        ) THEN
          ALTER TYPE sample_status ADD VALUE 'cancelled';
        END IF;
      END $$
    `);
    await fixDuplicateSampleTests(client);
    await client.query(`
      DELETE FROM reports older
      USING reports newer
      WHERE older.sample_id IS NOT NULL
        AND older.sample_id = newer.sample_id
        AND older.created_at < newer.created_at
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_sample_id_unique
      ON reports (sample_id)
      WHERE sample_id IS NOT NULL
    `);
    await client.query(`
      ALTER TABLE samples
        ADD COLUMN IF NOT EXISTS lab_handover_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS lab_handover_by UUID REFERENCES users(id)
    `);
  } finally {
    client.release();
  }
  await ensureAdmin();
}

async function migrate() {
  const check = await pool.query("SELECT to_regclass('public.roles') AS exists");
  if (!check.rows[0].exists) {
    const sqlPath = path.join(__dirname, '../../migrations/init.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await pool.query(sql);
    logger.info('Database schema created successfully');
  } else {
    logger.info('Database schema exists — applying patches');
  }
  await applyPatches();
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('Migration failed', { error: err.message });
    process.exit(1);
  });
