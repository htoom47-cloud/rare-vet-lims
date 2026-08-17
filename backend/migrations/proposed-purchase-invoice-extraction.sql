-- Proposed purchase invoice extraction (human review before draft).
-- Do not add this file to migrate.js until explicitly approved.
-- Idempotent: CREATE TABLE IF NOT EXISTS plus ADD COLUMN IF NOT EXISTS for every column.
-- Does not post ledger entries, change inventory, or approve invoices.
-- Requires purchase_invoices / purchase_invoice_attachments from proposed-purchase-invoices.sql.
--
-- Retention (not auto-enforced: see proposedCleanupExpiredExtractions, not wired to cron):
--   failed and queued rows: 30 days (INVOICE_EXTRACTION_RETENTION_DAYS).
--   needs_review: keep until a human confirms or operations run cleanup later.
--   completed rows: keep with the draft. never delete a file attached to a confirmed draft.
--   raw_payload / corrected_payload: structured review JSON only, same lifetime as the row.
--   processing lease: INVOICE_EXTRACTION_LEASE_MS (default 120000). Stale processing may be recovered with explicit retry.

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

UPDATE purchase_invoice_extractions SET status = 'queued' WHERE status IS NULL;
UPDATE purchase_invoice_extractions SET created_at = NOW() WHERE created_at IS NULL;
UPDATE purchase_invoice_extractions SET updated_at = NOW() WHERE updated_at IS NULL;

ALTER TABLE purchase_invoice_extractions ALTER COLUMN status SET DEFAULT 'queued';
ALTER TABLE purchase_invoice_extractions ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE purchase_invoice_extractions ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE purchase_invoice_extractions
  DROP CONSTRAINT IF EXISTS purchase_invoice_extractions_status_check;
ALTER TABLE purchase_invoice_extractions
  ADD CONSTRAINT purchase_invoice_extractions_status_check
  CHECK (status IN ('queued', 'processing', 'needs_review', 'completed', 'failed'));

ALTER TABLE purchase_invoice_extractions
  DROP CONSTRAINT IF EXISTS purchase_invoice_extractions_size_bytes_check;
ALTER TABLE purchase_invoice_extractions
  ADD CONSTRAINT purchase_invoice_extractions_size_bytes_check
  CHECK (size_bytes IS NULL OR size_bytes > 0);

CREATE INDEX IF NOT EXISTS idx_purchase_extractions_actor_created
  ON purchase_invoice_extractions (created_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_purchase_extractions_status
  ON purchase_invoice_extractions (status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_extractions_one_active_file
  ON purchase_invoice_extractions (file_url)
  WHERE status IN ('queued', 'processing');

COMMENT ON TABLE purchase_invoice_extractions IS
  'Untrusted OCR/LLM extraction. Human review is required before a purchase draft is created. raw_payload stores structured review JSON only, never the full provider HTTP response.';

COMMENT ON COLUMN purchase_invoice_extractions.raw_payload IS
  'Structured invoice JSON after schema validation. Do not store provider HTTP bodies, usage, or internal model notes.';

COMMENT ON COLUMN purchase_invoice_extractions.processing_lease_until IS
  'Exclusive processing lease. A live lease must not be retried. An expired lease may be recovered with explicit retry.';
