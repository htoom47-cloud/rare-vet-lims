-- Proposed purchase posting (inventory + ledger in one transaction).
-- Do not add this file to migrate.js until explicitly approved.
-- Idempotent. Does not UPDATE existing inventory_transactions or journal rows.
-- Requires proposed-purchase-invoices.sql, inventory_items, ledger_accounts, journal_entries.
-- Does not CREATE EXTENSION. uuid-ossp must already exist (same as other purchase tables).
--
-- Status:
--   approved = locked financial document, no stock or ledger effect
--   posted   = stock and journal applied together
-- stock_applied_at and ledger_posted_at must be set together or both remain NULL.
--
-- Chart of accounts used by posting (INSERT IF missing only, never overwrite):
--   1200 Inventory (asset)
--   1170 Recoverable Input VAT (asset) -- not 2100 VAT Payable (sales output)
--   2000 Accounts Payable (liability)
--   5100 Direct purchase expense (expense)
--   1010 Cash / 1020 Bank already seeded by ledger.service
--
-- inventory quantity scale is widened 12,2 -> 12,3. Existing row values are unchanged.
-- ALTER TYPE takes ACCESS EXCLUSIVE on inventory_items / inventory_transactions.
--
-- Lots: inventory_lots holds operational balances for posted receipts and manual in/out.
-- Do not backfill legacy quantity. Unlabeled lots are never merged. Labeled lots merge on
-- (item, lower(btrim(lot_number)), expiry_date) including NULL expiry.
-- unlabeled=true requires a blank lot_number. Do not write lot/expiry onto inventory_items.
--
-- Unique journal index is refused if duplicate source_type/source_id rows exist.
-- ALTER COLUMN quantity TYPE NUMERIC(12,3) takes ACCESS EXCLUSIVE on
-- inventory_items and inventory_transactions. Schedule a maintenance window.

ALTER TABLE purchase_invoices
  DROP CONSTRAINT IF EXISTS purchase_invoices_status_check;
ALTER TABLE purchase_invoices
  ADD CONSTRAINT purchase_invoices_status_check
  CHECK (status IN ('draft', 'approved', 'cancelled', 'posted'));

ALTER TABLE purchase_invoices
  ADD COLUMN IF NOT EXISTS posting_date DATE;
ALTER TABLE purchase_invoices
  ADD COLUMN IF NOT EXISTS posted_by UUID REFERENCES users(id);

DROP INDEX IF EXISTS idx_purchase_invoices_supplier_number_approved;
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_invoices_supplier_number_approved
  ON purchase_invoices (supplier_id, lower(btrim(supplier_invoice_number)))
  WHERE status IN ('approved', 'posted') AND deleted_at IS NULL;

ALTER TABLE purchase_invoice_items
  ADD COLUMN IF NOT EXISTS destination VARCHAR(20);
ALTER TABLE purchase_invoice_items
  DROP CONSTRAINT IF EXISTS purchase_item_destination_check;
ALTER TABLE purchase_invoice_items
  ADD CONSTRAINT purchase_item_destination_check
  CHECK (destination IS NULL OR destination IN ('inventory', 'expense'));

ALTER TABLE purchase_invoice_items
  ADD COLUMN IF NOT EXISTS expense_account_id UUID REFERENCES ledger_accounts(id);
ALTER TABLE purchase_invoice_items
  ADD COLUMN IF NOT EXISTS lot_number VARCHAR(100);
ALTER TABLE purchase_invoice_items
  ADD COLUMN IF NOT EXISTS expiry_date DATE;

ALTER TABLE purchase_invoice_items
  DROP CONSTRAINT IF EXISTS purchase_invoice_items_inventory_item_id_fkey;
ALTER TABLE purchase_invoice_items
  ADD CONSTRAINT purchase_invoice_items_inventory_item_id_fkey
  FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE RESTRICT;

ALTER TABLE purchase_invoice_items
  DROP CONSTRAINT IF EXISTS purchase_item_destination_fields;
ALTER TABLE purchase_invoice_items
  ADD CONSTRAINT purchase_item_destination_fields CHECK (
    destination IS NULL
    OR (destination = 'inventory' AND inventory_item_id IS NOT NULL AND expense_account_id IS NULL)
    OR (destination = 'expense' AND expense_account_id IS NOT NULL AND inventory_item_id IS NULL)
  );

ALTER TABLE inventory_transactions
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(50);
ALTER TABLE inventory_transactions
  ADD COLUMN IF NOT EXISTS source_id UUID;
ALTER TABLE inventory_transactions
  ADD COLUMN IF NOT EXISTS source_line_id UUID;
ALTER TABLE inventory_transactions
  ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE inventory_transactions
  ADD COLUMN IF NOT EXISTS lot_id UUID;

CREATE TABLE IF NOT EXISTS inventory_lots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  lot_number VARCHAR(100),
  expiry_date DATE,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  cost_per_unit NUMERIC(10,2),
  unlabeled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE inventory_lots
  DROP CONSTRAINT IF EXISTS inventory_lots_inventory_item_id_fkey;
ALTER TABLE inventory_lots
  ADD CONSTRAINT inventory_lots_inventory_item_id_fkey
  FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE RESTRICT;

ALTER TABLE inventory_lots
  DROP CONSTRAINT IF EXISTS inventory_lots_identity_check;
ALTER TABLE inventory_lots
  ADD CONSTRAINT inventory_lots_identity_check CHECK (
    (unlabeled = false AND btrim(COALESCE(lot_number, '')) <> '')
    OR (unlabeled = true AND btrim(COALESCE(lot_number, '')) = '')
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_lots_labeled
  ON inventory_lots (
    inventory_item_id,
    lower(btrim(lot_number)),
    COALESCE(expiry_date, DATE '0001-01-01')
  )
  WHERE unlabeled = false AND btrim(COALESCE(lot_number, '')) <> '';

COMMENT ON TABLE inventory_lots IS
  'Operational lot balances for posted purchases and manual receipts. Do not backfill legacy inventory_items.quantity. Unlabeled lots are never merged. unlabeled=true requires a blank lot_number.';

CREATE TABLE IF NOT EXISTS inventory_lot_receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lot_id UUID NOT NULL REFERENCES inventory_lots(id) ON DELETE RESTRICT,
  source_type VARCHAR(50) NOT NULL,
  source_id UUID NOT NULL,
  source_line_id UUID NOT NULL,
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE inventory_lot_receipts
  DROP CONSTRAINT IF EXISTS inventory_lot_receipts_lot_id_fkey;
ALTER TABLE inventory_lot_receipts
  ADD CONSTRAINT inventory_lot_receipts_lot_id_fkey
  FOREIGN KEY (lot_id) REFERENCES inventory_lots(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_lot_receipt_purchase_line
  ON inventory_lot_receipts (source_type, source_line_id)
  WHERE source_type = 'purchase_invoice' AND source_line_id IS NOT NULL;

ALTER TABLE inventory_transactions
  DROP CONSTRAINT IF EXISTS inventory_transactions_lot_id_fkey;
ALTER TABLE inventory_transactions
  ADD CONSTRAINT inventory_transactions_lot_id_fkey
  FOREIGN KEY (lot_id) REFERENCES inventory_lots(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_txn_purchase_line
  ON inventory_transactions (source_type, source_line_id)
  WHERE source_type = 'purchase_invoice' AND source_line_id IS NOT NULL;

ALTER TABLE inventory_items
  ALTER COLUMN quantity TYPE NUMERIC(12,3);
ALTER TABLE inventory_transactions
  ALTER COLUMN quantity TYPE NUMERIC(12,3);

ALTER TABLE ledger_accounts
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

INSERT INTO ledger_accounts (code, name, name_ar, type, is_active)
VALUES
  ('1200', 'Inventory', 'المخزون', 'asset', true),
  ('1170', 'Recoverable Input VAT', 'ضريبة المدخلات القابلة للاسترداد', 'asset', true),
  ('2000', 'Accounts Payable', 'الذمم الدائنة', 'liability', true),
  ('5100', 'Direct purchase expense', 'مصروف مشتريات مباشر', 'expense', true)
ON CONFLICT (code) DO NOTHING;

DO $purchase_posting$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT 1
      FROM journal_entries
      WHERE source_type IS NOT NULL AND source_id IS NOT NULL
      GROUP BY source_type, source_id
      HAVING COUNT(*) > 1
    ) dup_groups
  ) THEN
    RAISE EXCEPTION 'journal_entries has % duplicate source groups, refusing unique index',
      (
        SELECT COUNT(*)
        FROM (
          SELECT 1
          FROM journal_entries
          WHERE source_type IS NOT NULL AND source_id IS NOT NULL
          GROUP BY source_type, source_id
          HAVING COUNT(*) > 1
        ) dup_groups
      );
  END IF;
END
$purchase_posting$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_source_unique
  ON journal_entries (source_type, source_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

INSERT INTO permissions (code, module, description) VALUES
  ('purchases.post', 'purchases', 'PURCHASES_POST')
ON CONFLICT (code) DO UPDATE
SET module = EXCLUDED.module,
    description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('admin', 'manager', 'accountant')
  AND p.code = 'purchases.post'
ON CONFLICT DO NOTHING;

COMMENT ON COLUMN purchase_invoices.stock_applied_at IS
  'Set together with ledger_posted_at inside the posting transaction. Never set one without the other.';
COMMENT ON COLUMN purchase_invoices.ledger_posted_at IS
  'Set together with stock_applied_at inside the posting transaction.';
COMMENT ON COLUMN ledger_accounts.code IS
  '1170 = Recoverable Input VAT. 2100 remains sales VAT Payable and must not be used for purchase input tax.';
