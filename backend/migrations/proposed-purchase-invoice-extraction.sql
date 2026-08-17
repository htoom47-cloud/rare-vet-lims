-- Proposed purchase invoice extraction (human review before draft).
-- Do not add this file to migrate.js until explicitly approved.
-- Idempotent: CREATE TABLE IF NOT EXISTS plus ADD COLUMN IF NOT EXISTS for every column.
-- Does not post ledger entries, change inventory, or approve invoices.
-- Requires purchase_invoices / purchase_invoice_attachments from proposed-purchase-invoices.sql.
-- Requires extension uuid-ossp (uuid_generate_v4), the same generator used by users,
-- purchase_invoices, and other purchase tables. Do not CREATE EXTENSION here.
--
-- Retention (not auto-enforced: see proposedCleanupExpiredExtractions, not wired to cron):
--   failed and queued rows: 30 days (INVOICE_EXTRACTION_RETENTION_DAYS).
--   needs_review: keep until a human confirms or operations run cleanup later.
--   completed rows: keep with the draft. never delete a file attached to a confirmed draft.
--   raw_payload / corrected_payload: structured review JSON only, same lifetime as the row.
--   processing lease: INVOICE_EXTRACTION_LEASE_MS (default 120000). Stale processing may be recovered with explicit retry.
--
-- Foreign keys (named, re-runnable). ON DELETE RESTRICT so neither the extraction row
-- nor its actor/invoice links are removed by cascading deletes:
--   created_by / processed_by / reviewed_by / confirmed_by -> users(id)
--   purchase_invoice_id -> purchase_invoices(id)

CREATE TABLE IF NOT EXISTS purchase_invoice_extractions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4()
);

ALTER TABLE purchase_invoice_extractions ADD COLUMN IF NOT EXISTS status VARCHAR(20);
ALTER TABLE purchase_invoice_extractions ADD COLUMN IF NOT EXISTS file_url VARCHAR(500);
ALTER TABLE purchase_invoice_extractions ADD COLUMN IF NOT EXISTS original_name VARCHAR(255);
ALTER TABLE purchase_invoice_extractions ADD COLUMN IF NOT EXISTS mime_type VARCHAR(80);
ALTER TABLE purchase_invoice_extractions ADD COLUMN IF NOT EXISTS size_bytes INTEGER;
ALTER TABLE purchase_invoice_extractions ADD COLUMN IF NOT EXISTS page_count INTEGER;
ALTER TABLE purchase_invoice_extractions ADD COLUMN IF NOT EXISTS provider_name VARCHAR(40);
ALTER TABLE purchase_invoice_extractions ADD COLUMN IF NOT EXISTS model_version VARCHAR(80);
ALTER TABLE purchase_invoice_extractions ADD COLUMN IF NOT EXISTS provider_sent_at TIMESTAMPTZ;
ALTER TABLE purchase_invoice_extractions ADD COLUMN IF NOT EXISTS processing_lease_until TIMESTAMPTZ;
ALTER TABLE purchase_invoice_extractions ADD COLUMN IF NOT EXISTS raw_payload JSONB;
ALTER TABLE purchase_invoice_extractions ADD COLUMN IF NOT EXISTS corrected_payload JSONB;
ALTER TABLE purchase_invoice_extractions ADD COLUMN IF NOT EXISTS overall_confidence NUMERIC(5,4);
ALTER TABLE purchase_invoice_extractions ADD COLUMN IF NOT EXISTS error_code VARCHAR(80);
ALTER TABLE purchase_invoice_extractions ADD COLUMN IF NOT EXISTS error_message VARCHAR(500);
ALTER TABLE purchase_invoice_extractions ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE purchase_invoice_extractions ADD COLUMN IF NOT EXISTS processed_by UUID;
ALTER TABLE purchase_invoice_extractions ADD COLUMN IF NOT EXISTS reviewed_by UUID;
ALTER TABLE purchase_invoice_extractions ADD COLUMN IF NOT EXISTS confirmed_by UUID;
ALTER TABLE purchase_invoice_extractions ADD COLUMN IF NOT EXISTS purchase_invoice_id UUID;
ALTER TABLE purchase_invoice_extractions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE purchase_invoice_extractions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE purchase_invoice_extractions ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE purchase_invoice_extractions ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;

-- Refuse SET NOT NULL when required fields are missing. Do not invent file URLs or users.
-- CAST wraps the CASE so PostgreSQL does not constant-fold an invalid integer literal on empty tables.
SELECT CAST(
  CASE WHEN EXISTS (
    SELECT 1
    FROM purchase_invoice_extractions
    WHERE status IS NULL
       OR file_url IS NULL
       OR btrim(file_url) = ''
       OR original_name IS NULL
       OR mime_type IS NULL
       OR size_bytes IS NULL
       OR created_by IS NULL
       OR created_at IS NULL
       OR updated_at IS NULL
  ) THEN 'purchase_invoice_extractions has incomplete required fields, refusing SET NOT NULL'
    ELSE '0'
  END AS integer
);

ALTER TABLE purchase_invoice_extractions ALTER COLUMN status SET DEFAULT 'queued';
ALTER TABLE purchase_invoice_extractions ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE purchase_invoice_extractions ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE purchase_invoice_extractions ALTER COLUMN status SET NOT NULL;
ALTER TABLE purchase_invoice_extractions ALTER COLUMN file_url SET NOT NULL;
ALTER TABLE purchase_invoice_extractions ALTER COLUMN original_name SET NOT NULL;
ALTER TABLE purchase_invoice_extractions ALTER COLUMN mime_type SET NOT NULL;
ALTER TABLE purchase_invoice_extractions ALTER COLUMN size_bytes SET NOT NULL;
ALTER TABLE purchase_invoice_extractions ALTER COLUMN created_by SET NOT NULL;
ALTER TABLE purchase_invoice_extractions ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE purchase_invoice_extractions ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE purchase_invoice_extractions
  DROP CONSTRAINT IF EXISTS purchase_invoice_extractions_file_url_check;
ALTER TABLE purchase_invoice_extractions
  ADD CONSTRAINT purchase_invoice_extractions_file_url_check
  CHECK (btrim(file_url) <> '');

ALTER TABLE purchase_invoice_extractions
  DROP CONSTRAINT IF EXISTS purchase_invoice_extractions_status_check;
ALTER TABLE purchase_invoice_extractions
  ADD CONSTRAINT purchase_invoice_extractions_status_check
  CHECK (status IN ('queued', 'processing', 'needs_review', 'completed', 'failed'));

ALTER TABLE purchase_invoice_extractions
  DROP CONSTRAINT IF EXISTS purchase_invoice_extractions_size_bytes_check;
ALTER TABLE purchase_invoice_extractions
  ADD CONSTRAINT purchase_invoice_extractions_size_bytes_check
  CHECK (size_bytes > 0);

ALTER TABLE purchase_invoice_extractions
  DROP CONSTRAINT IF EXISTS purchase_invoice_extractions_page_count_check;
ALTER TABLE purchase_invoice_extractions
  ADD CONSTRAINT purchase_invoice_extractions_page_count_check
  CHECK (page_count IS NULL OR page_count > 0);

ALTER TABLE purchase_invoice_extractions
  DROP CONSTRAINT IF EXISTS purchase_invoice_extractions_overall_confidence_check;
ALTER TABLE purchase_invoice_extractions
  ADD CONSTRAINT purchase_invoice_extractions_overall_confidence_check
  CHECK (overall_confidence IS NULL OR (overall_confidence >= 0 AND overall_confidence <= 1));

ALTER TABLE purchase_invoice_extractions
  DROP CONSTRAINT IF EXISTS purchase_invoice_extractions_created_by_fkey;
ALTER TABLE purchase_invoice_extractions
  ADD CONSTRAINT purchase_invoice_extractions_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE purchase_invoice_extractions
  DROP CONSTRAINT IF EXISTS purchase_invoice_extractions_processed_by_fkey;
ALTER TABLE purchase_invoice_extractions
  ADD CONSTRAINT purchase_invoice_extractions_processed_by_fkey
  FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE purchase_invoice_extractions
  DROP CONSTRAINT IF EXISTS purchase_invoice_extractions_reviewed_by_fkey;
ALTER TABLE purchase_invoice_extractions
  ADD CONSTRAINT purchase_invoice_extractions_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE purchase_invoice_extractions
  DROP CONSTRAINT IF EXISTS purchase_invoice_extractions_confirmed_by_fkey;
ALTER TABLE purchase_invoice_extractions
  ADD CONSTRAINT purchase_invoice_extractions_confirmed_by_fkey
  FOREIGN KEY (confirmed_by) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE purchase_invoice_extractions
  DROP CONSTRAINT IF EXISTS purchase_invoice_extractions_purchase_invoice_id_fkey;
ALTER TABLE purchase_invoice_extractions
  ADD CONSTRAINT purchase_invoice_extractions_purchase_invoice_id_fkey
  FOREIGN KEY (purchase_invoice_id) REFERENCES purchase_invoices(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_purchase_extractions_actor_created
  ON purchase_invoice_extractions (created_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_purchase_extractions_status
  ON purchase_invoice_extractions (status, created_at DESC);

DROP INDEX IF EXISTS idx_purchase_extractions_one_active_file;
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_extractions_one_active_file
  ON purchase_invoice_extractions (file_url)
  WHERE status IN ('queued', 'processing')
    AND btrim(file_url) <> '';

COMMENT ON TABLE purchase_invoice_extractions IS
  'Untrusted OCR/LLM extraction. Human review is required before a purchase draft is created. raw_payload stores structured review JSON only, never the full provider HTTP response.';

COMMENT ON COLUMN purchase_invoice_extractions.raw_payload IS
  'Structured invoice JSON after schema validation. Do not store provider HTTP bodies, usage, or internal model notes.';

COMMENT ON COLUMN purchase_invoice_extractions.processing_lease_until IS
  'Exclusive processing lease. A live lease must not be retried. An expired lease may be recovered with explicit retry.';
