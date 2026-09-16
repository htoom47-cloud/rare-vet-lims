-- Proposed purchase invoice drafts.
-- Do not add this file to migrate.js until explicitly approved.
-- Idempotent. Does not post ledger entries or change inventory quantities.
-- Requires the suppliers table. Safe to run on a live suppliers table:
--   ADD COLUMN IF NOT EXISTS defaults existing rows to false (not temporary/system).

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS is_temporary BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;

-- Do not UPDATE existing suppliers. Only seed the single cash placeholder if missing.
INSERT INTO suppliers (supplier_number, name, name_ar, is_system, is_temporary, is_active)
SELECT 'SUP-CASH-UNREG', 'Unregistered cash supplier', 'مورد نقدي غير مسجل', true, false, true
WHERE NOT EXISTS (
  SELECT 1 FROM suppliers WHERE supplier_number = 'SUP-CASH-UNREG'
);

CREATE TABLE IF NOT EXISTS purchase_invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_number VARCHAR(50) NOT NULL,
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  supplier_invoice_number VARCHAR(80) NOT NULL,
  invoice_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'cancelled')),
  payment_method VARCHAR(30) NOT NULL DEFAULT 'cash'
    CHECK (payment_method IN ('cash', 'bank_transfer', 'credit', 'other')),
  notes TEXT,
  vat_rate_bps INTEGER,
  subtotal_halalas INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_halalas >= 0),
  discount_halalas INTEGER NOT NULL DEFAULT 0 CHECK (discount_halalas >= 0),
  vat_halalas INTEGER NOT NULL DEFAULT 0 CHECK (vat_halalas >= 0),
  total_halalas INTEGER NOT NULL DEFAULT 0 CHECK (total_halalas >= 0),
  uses_cash_unregistered BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  cancelled_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  deleted_at TIMESTAMPTZ,
  stock_applied_at TIMESTAMPTZ,
  ledger_posted_at TIMESTAMPTZ
);

ALTER TABLE purchase_invoices
  DROP CONSTRAINT IF EXISTS purchase_invoices_vat_15;

CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_invoices_document
  ON purchase_invoices (document_number);

CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_invoices_supplier_number_approved
  ON purchase_invoices (supplier_id, lower(btrim(supplier_invoice_number)))
  WHERE status = 'approved' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_list
  ON purchase_invoices (status, invoice_date DESC, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_supplier
  ON purchase_invoices (supplier_id, invoice_date)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS purchase_invoice_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_invoice_id UUID NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL,
  description VARCHAR(500) NOT NULL,
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  unit_price_halalas INTEGER NOT NULL CHECK (unit_price_halalas >= 0),
  discount_halalas INTEGER NOT NULL DEFAULT 0 CHECK (discount_halalas >= 0),
  line_net_halalas INTEGER NOT NULL CHECK (line_net_halalas >= 0),
  tax_category VARCHAR(20) NOT NULL DEFAULT 'standard'
    CHECK (tax_category IN ('standard', 'zero_rated', 'exempt', 'out_of_scope')),
  tax_rate_bps INTEGER NOT NULL DEFAULT 1500,
  vat_halalas INTEGER NOT NULL DEFAULT 0 CHECK (vat_halalas >= 0),
  inventory_item_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE purchase_invoice_items
  ADD COLUMN IF NOT EXISTS tax_category VARCHAR(20) NOT NULL DEFAULT 'standard';
ALTER TABLE purchase_invoice_items
  ADD COLUMN IF NOT EXISTS tax_rate_bps INTEGER NOT NULL DEFAULT 1500;
ALTER TABLE purchase_invoice_items
  ADD COLUMN IF NOT EXISTS vat_halalas INTEGER NOT NULL DEFAULT 0;

ALTER TABLE purchase_invoice_items
  DROP CONSTRAINT IF EXISTS purchase_item_tax_pair;
ALTER TABLE purchase_invoice_items
  ADD CONSTRAINT purchase_item_tax_pair CHECK (
    (tax_category = 'standard' AND tax_rate_bps = 1500)
    OR (tax_category IN ('zero_rated', 'exempt', 'out_of_scope') AND tax_rate_bps = 0)
  );

CREATE INDEX IF NOT EXISTS idx_purchase_invoice_items_header
  ON purchase_invoice_items (purchase_invoice_id, line_no);

CREATE TABLE IF NOT EXISTS purchase_invoice_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_invoice_id UUID NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  file_url VARCHAR(500) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(80) NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO permissions (code, module, description) VALUES
  ('purchases.view', 'purchases', 'PURCHASES_VIEW'),
  ('purchases.create', 'purchases', 'PURCHASES_CREATE'),
  ('purchases.approve', 'purchases', 'PURCHASES_APPROVE'),
  ('purchases.cancel', 'purchases', 'PURCHASES_CANCEL'),
  ('suppliers.view', 'suppliers', 'SUPPLIERS_VIEW')
ON CONFLICT (code) DO UPDATE
SET module = EXCLUDED.module,
    description = EXCLUDED.description;

INSERT INTO roles (name, name_ar, description) VALUES
  ('purchaser', 'مندوب مشتريات', 'Purchasing agent — create and view own drafts')
ON CONFLICT (name) DO UPDATE
SET name_ar = EXCLUDED.name_ar,
    description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'purchaser'
  AND p.code IN ('purchases.view', 'purchases.create', 'suppliers.view')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('admin', 'manager', 'accountant')
  AND p.code IN ('purchases.view', 'purchases.create', 'purchases.approve', 'purchases.cancel')
ON CONFLICT DO NOTHING;

COMMENT ON TABLE purchase_invoices IS
  'Purchase invoice drafts. VAT is per line: standard=15%, other categories=0%. stock_applied_at and ledger_posted_at stay null in this phase.';
