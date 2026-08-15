-- PROPOSED ONLY — do not apply automatically.
-- Credit notes after invoice issue + unique journal source.
-- NOT ZATCA-ready: line items, XML, and signing are a later independent phase.
-- Safe / idempotent. Does not alter existing invoice totals or delete billing data.
-- Fails clearly if duplicate journal sources exist before the UNIQUE index is created.
--
-- Financial-record protection:
--   Issued credit notes and their events cannot be deleted or have amounts changed.
--   The LIMS application role cannot bypass these triggers.
--
-- Administrative override (never as the LIMS app role, and not executed by this file):
--   1. As a PostgreSQL superuser / database owner:
--        CREATE ROLE lims_credit_note_admin NOLOGIN
--        GRANT lims_credit_note_admin TO <migration_or_owner_role>
--   2. Connect as that owner, or SET ROLE lims_credit_note_admin
--   3. Only then may a planned repair touch issued credit notes / events
--   Never GRANT lims_credit_note_admin to the application role
--   SET LOCAL lims.allow_credit_note_admin = 'on' is ignored and is never sufficient
--   If role lims_credit_note_admin does not exist, override is always false

CREATE TABLE IF NOT EXISTS credit_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  credit_note_number VARCHAR(50) UNIQUE NOT NULL,
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  reason TEXT NOT NULL,
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'issued',
  posted_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT credit_notes_total_positive CHECK (total > 0),
  CONSTRAINT credit_notes_amounts_check CHECK (
    subtotal >= 0 AND tax_amount >= 0 AND total = subtotal + tax_amount
  ),
  CONSTRAINT credit_notes_status_check CHECK (status IN ('draft', 'issued', 'void'))
);

CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice ON credit_notes(invoice_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice_status ON credit_notes(invoice_id, status);
CREATE INDEX IF NOT EXISTS idx_credit_notes_customer ON credit_notes(customer_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_customer_created ON credit_notes(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_notes_status ON credit_notes(status);
CREATE INDEX IF NOT EXISTS idx_credit_notes_created ON credit_notes(created_at);

-- Audit trail: RESTRICT so deleting a credit note cannot erase its history.
CREATE TABLE IF NOT EXISTS credit_note_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  credit_note_id UUID NOT NULL REFERENCES credit_notes(id) ON DELETE RESTRICT,
  action VARCHAR(50) NOT NULL,
  actor_id UUID REFERENCES users(id),
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_note_events_note ON credit_note_events(credit_note_id, created_at);

DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT source_type, source_id
    FROM journal_entries
    WHERE source_type IS NOT NULL AND source_id IS NOT NULL
    GROUP BY source_type, source_id
    HAVING COUNT(*) > 1
  ) duplicates;

  IF dup_count > 0 THEN
    RAISE EXCEPTION
      'Cannot create unique journal source index: % duplicate (source_type, source_id) group(s) exist. Resolve duplicates before applying this migration.',
      dup_count;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_source_unique
  ON journal_entries (source_type, source_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

CREATE OR REPLACE FUNCTION lims_credit_note_admin_override()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lims_credit_note_admin') THEN
    RETURN FALSE;
  END IF;
  RETURN pg_has_role(CURRENT_USER, 'lims_credit_note_admin', 'member');
END;
$$;

CREATE OR REPLACE FUNCTION lims_protect_credit_notes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF lims_credit_note_admin_override() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'issued' THEN
      RAISE EXCEPTION 'Issued credit notes cannot be deleted'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'issued' THEN
    IF NEW.subtotal IS DISTINCT FROM OLD.subtotal
       OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
       OR NEW.total IS DISTINCT FROM OLD.total
       OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
       OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.credit_note_number IS DISTINCT FROM OLD.credit_note_number THEN
      RAISE EXCEPTION 'Issued credit note financial values cannot be changed'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_credit_notes ON credit_notes;
CREATE TRIGGER trg_protect_credit_notes
  BEFORE UPDATE OR DELETE ON credit_notes
  FOR EACH ROW
  EXECUTE PROCEDURE lims_protect_credit_notes();

CREATE OR REPLACE FUNCTION lims_protect_credit_note_events()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF lims_credit_note_admin_override() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Credit note audit events cannot be deleted'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Credit note audit events cannot be modified'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_credit_note_events ON credit_note_events;
CREATE TRIGGER trg_protect_credit_note_events
  BEFORE UPDATE OR DELETE ON credit_note_events
  FOR EACH ROW
  EXECUTE PROCEDURE lims_protect_credit_note_events();
