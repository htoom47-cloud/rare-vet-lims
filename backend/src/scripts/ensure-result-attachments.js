/**
 * Ensures result_attachments table exists (microscope images on parasitology results).
 */
require('dotenv').config();
const { pool } = require('../config/database');
const logger = require('../config/logger');

async function ensureResultAttachments() {
  await pool.query(`
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
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_result_attachments_result ON result_attachments(result_id)'
  );
  logger.info('result_attachments table ensured');
}

if (require.main === module) {
  ensureResultAttachments()
    .then(() => pool.end())
    .catch((err) => {
      logger.error('ensure-result-attachments failed', { error: err.message });
      process.exit(1);
    });
}

module.exports = { ensureResultAttachments };
