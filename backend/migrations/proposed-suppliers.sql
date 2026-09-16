-- Proposed suppliers master data.
-- Do not add this file to migrate.js until explicitly approved.
-- Idempotent: safe to run more than once. Does not rewrite inventory_items.supplier.

CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_number VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  name_ar VARCHAR(255),
  tax_number VARCHAR(30),
  phone VARCHAR(30),
  email VARCHAR(255),
  address TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_number
  ON suppliers (supplier_number);

CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_tax_number_active
  ON suppliers (lower(btrim(tax_number)))
  WHERE deleted_at IS NULL
    AND tax_number IS NOT NULL
    AND btrim(tax_number) <> '';

CREATE INDEX IF NOT EXISTS idx_suppliers_active_list
  ON suppliers (is_active, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_suppliers_search_number
  ON suppliers (supplier_number)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE suppliers IS 'Supplier master data. Balance and bank details are added later with supplier payments after encryption is approved.';

INSERT INTO permissions (code, module, description) VALUES
  ('suppliers.view', 'suppliers', 'SUPPLIERS_VIEW'),
  ('suppliers.manage', 'suppliers', 'SUPPLIERS_MANAGE')
ON CONFLICT (code) DO UPDATE
SET module = EXCLUDED.module,
    description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('admin', 'manager', 'accountant')
  AND p.code IN ('suppliers.view', 'suppliers.manage')
ON CONFLICT DO NOTHING;
