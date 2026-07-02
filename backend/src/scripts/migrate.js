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
    await ensureLabSpecialistRole(client);
    await client.query(
      'ALTER TABLE tests ADD COLUMN IF NOT EXISTS label_copies INTEGER NOT NULL DEFAULT 1'
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
    await syncLabContactInfo(client);
    await ensureUniqueLimsReferenceRanges(client);
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
