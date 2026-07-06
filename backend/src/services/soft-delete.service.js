const env = require('../config/env');
const { query, getClient, pool } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { paginate, buildPagination } = require('../utils/helpers');
const dataPurge = require('./data-purge.service');
const logger = require('../config/logger');

const TRASH_TYPES = new Set(['customers', 'samples', 'reports', 'invoices']);
const SOFT_TABLES = new Set(['customers', 'animals', 'samples', 'reports', 'invoices']);

const assertEnabled = () => {
  if (!env.softDelete?.enabled) {
    throw new AppError('Data trash is not enabled', 404, 'FEATURE_DISABLED');
  }
};

const computePurgeAfter = () => {
  const hours = env.softDelete?.retentionHours ?? 48;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
};

const markDeleted = async (client, table, id, userId, purgeAfter) => {
  if (!SOFT_TABLES.has(table)) throw new Error(`Invalid table: ${table}`);
  const reactivate = table === 'customers' ? ', is_active = false' : '';
  const result = await client.query(
    `UPDATE ${table}
     SET deleted_at = NOW(), deleted_by = $2, purge_after = $3${reactivate}
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id, userId, purgeAfter]
  );
  if (!result.rows[0]) {
    throw new AppError('Record not found or already in trash', 404, 'NOT_FOUND');
  }
  return result.rows[0];
};

const clearDeleted = async (client, table, id) => {
  if (!SOFT_TABLES.has(table)) throw new Error(`Invalid table: ${table}`);
  const reactivate = table === 'customers' ? ', is_active = true' : '';
  const result = await client.query(
    `UPDATE ${table}
     SET deleted_at = NULL, deleted_by = NULL, purge_after = NULL${reactivate}
     WHERE id = $1 AND deleted_at IS NOT NULL
     RETURNING *`,
    [id]
  );
  if (!result.rows[0]) throw new AppError('Record not in trash', 404, 'NOT_IN_TRASH');
  return result.rows[0];
};

const softDeleteReport = async (client, reportId, userId, purgeAfter) => {
  await markDeleted(client, 'reports', reportId, userId, purgeAfter);
};

const softDeleteSample = async (client, sampleId, userId, purgeAfter) => {
  const reports = await client.query(
    'SELECT id FROM reports WHERE sample_id = $1 AND deleted_at IS NULL',
    [sampleId]
  );
  for (const row of reports.rows) {
    await markDeleted(client, 'reports', row.id, userId, purgeAfter);
  }
  return markDeleted(client, 'samples', sampleId, userId, purgeAfter);
};

const softDeleteInvoice = async (client, invoiceId, userId, purgeAfter) => {
  return markDeleted(client, 'invoices', invoiceId, userId, purgeAfter);
};

const softDeleteCustomer = async (client, customerId, userId, purgeAfter) => {
  const [samples, invoices, animals] = await Promise.all([
    client.query('SELECT id FROM samples WHERE customer_id = $1 AND deleted_at IS NULL', [customerId]),
    client.query('SELECT id FROM invoices WHERE customer_id = $1 AND deleted_at IS NULL', [customerId]),
    client.query('SELECT id FROM animals WHERE owner_id = $1 AND deleted_at IS NULL', [customerId]),
  ]);

  for (const row of samples.rows) {
    await softDeleteSample(client, row.id, userId, purgeAfter);
  }
  for (const row of invoices.rows) {
    await softDeleteInvoice(client, row.id, userId, purgeAfter);
  }
  for (const row of animals.rows) {
    await markDeleted(client, 'animals', row.id, userId, purgeAfter);
  }
  return markDeleted(client, 'customers', customerId, userId, purgeAfter);
};

const deleteEntity = async (type, id, userId) => {
  assertEnabled();
  if (!TRASH_TYPES.has(type)) {
    throw new AppError('Invalid trash type', 400, 'INVALID_TYPE');
  }

  const client = await getClient();
  const purgeAfter = computePurgeAfter();
  try {
    await client.query('BEGIN');
    let row;
    if (type === 'customers') {
      row = await softDeleteCustomer(client, id, userId, purgeAfter);
    } else if (type === 'samples') {
      row = await softDeleteSample(client, id, userId, purgeAfter);
    } else if (type === 'reports') {
      row = await markDeleted(client, 'reports', id, userId, purgeAfter);
    } else {
      row = await softDeleteInvoice(client, id, userId, purgeAfter);
    }
    await client.query('COMMIT');
    return row;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const restoreEntity = async (type, id) => {
  assertEnabled();
  if (!TRASH_TYPES.has(type)) {
    throw new AppError('Invalid trash type', 400, 'INVALID_TYPE');
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    if (type === 'customers') {
      const { rows } = await client.query(
        'SELECT purge_after FROM customers WHERE id = $1 AND deleted_at IS NOT NULL',
        [id]
      );
      if (!rows[0]) throw new AppError('Record not in trash', 404, 'NOT_IN_TRASH');
      const { purge_after: purgeAfter } = rows[0];
      await clearDeleted(client, 'customers', id);
      await client.query(
        `UPDATE animals SET deleted_at = NULL, deleted_by = NULL, purge_after = NULL
         WHERE owner_id = $1 AND purge_after = $2`,
        [id, purgeAfter]
      );
      await client.query(
        `UPDATE samples SET deleted_at = NULL, deleted_by = NULL, purge_after = NULL
         WHERE customer_id = $1 AND purge_after = $2`,
        [id, purgeAfter]
      );
      await client.query(
        `UPDATE invoices SET deleted_at = NULL, deleted_by = NULL, purge_after = NULL
         WHERE customer_id = $1 AND purge_after = $2`,
        [id, purgeAfter]
      );
      await client.query(
        `UPDATE reports SET deleted_at = NULL, deleted_by = NULL, purge_after = NULL
         WHERE purge_after = $1
           AND sample_id IN (SELECT id FROM samples WHERE customer_id = $2)`,
        [purgeAfter, id]
      );
    } else if (type === 'samples') {
      const { rows } = await client.query(
        'SELECT purge_after FROM samples WHERE id = $1 AND deleted_at IS NOT NULL',
        [id]
      );
      if (!rows[0]) throw new AppError('Record not in trash', 404, 'NOT_IN_TRASH');
      const { purge_after: purgeAfter } = rows[0];
      await clearDeleted(client, 'samples', id);
      await client.query(
        `UPDATE reports SET deleted_at = NULL, deleted_by = NULL, purge_after = NULL
         WHERE sample_id = $1 AND purge_after = $2`,
        [id, purgeAfter]
      );
    } else if (type === 'reports') {
      await clearDeleted(client, 'reports', id);
    } else {
      await clearDeleted(client, 'invoices', id);
    }

    await client.query('COMMIT');
    return { restored: true, type, id };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const LIST_QUERIES = {
  customers: `
    SELECT c.id, c.full_name, c.full_name_ar, c.mobile, c.deleted_at, c.purge_after,
           u.full_name AS deleted_by_name,
           (SELECT COUNT(*)::int FROM samples s WHERE s.customer_id = c.id AND s.deleted_at IS NOT NULL) AS samples_count,
           (SELECT COUNT(*)::int FROM invoices i WHERE i.customer_id = c.id AND i.deleted_at IS NOT NULL) AS invoices_count
    FROM customers c
    LEFT JOIN users u ON u.id = c.deleted_by
    WHERE c.deleted_at IS NOT NULL
  `,
  samples: `
    SELECT s.id, s.sample_code, s.barcode, s.status, s.deleted_at, s.purge_after,
           c.full_name AS customer_name, u.full_name AS deleted_by_name
    FROM samples s
    LEFT JOIN customers c ON c.id = s.customer_id
    LEFT JOIN users u ON u.id = s.deleted_by
    WHERE s.deleted_at IS NOT NULL
  `,
  reports: `
    SELECT r.id, r.report_number, r.status, r.deleted_at, r.purge_after,
           s.sample_code, c.full_name AS customer_name, u.full_name AS deleted_by_name
    FROM reports r
    LEFT JOIN samples s ON s.id = r.sample_id
    LEFT JOIN customers c ON c.id = s.customer_id
    LEFT JOIN users u ON u.id = r.deleted_by
    WHERE r.deleted_at IS NOT NULL
  `,
  invoices: `
    SELECT i.id, i.invoice_number, i.status, i.total, i.deleted_at, i.purge_after,
           c.full_name AS customer_name, u.full_name AS deleted_by_name
    FROM invoices i
    LEFT JOIN customers c ON c.id = i.customer_id
    LEFT JOIN users u ON u.id = i.deleted_by
    WHERE i.deleted_at IS NOT NULL
  `,
};

const listTrash = async (type, { page, limit } = {}) => {
  assertEnabled();
  if (!TRASH_TYPES.has(type)) {
    throw new AppError('Invalid trash type', 400, 'INVALID_TYPE');
  }

  const { offset, page: p, limit: l } = paginate(page, limit);
  const baseSql = LIST_QUERIES[type];
  const countResult = await query(
    `SELECT COUNT(*) FROM (${baseSql}) trash_rows`,
    []
  );
  const total = parseInt(countResult.rows[0].count, 10);
  const result = await query(
    `${baseSql} ORDER BY deleted_at DESC LIMIT $1 OFFSET $2`,
    [l, offset]
  );

  return {
    data: result.rows,
    pagination: buildPagination(total, p, l),
    retentionHours: env.softDelete?.retentionHours ?? 48,
  };
};

const getStatus = () => ({
  enabled: !!env.softDelete?.enabled,
  retentionHours: env.softDelete?.retentionHours ?? 48,
});

const purgeExpired = async () => {
  if (!env.softDelete?.enabled) {
    logger.info('Soft delete disabled — skipping purge');
    return { purged: { customers: 0, samples: 0, reports: 0, invoices: 0 } };
  }

  const client = await pool.connect();
  const counts = { customers: 0, samples: 0, reports: 0, invoices: 0 };

  try {
    const expiredCustomers = await client.query(
      `SELECT id FROM customers WHERE deleted_at IS NOT NULL AND purge_after < NOW()`
    );
    for (const row of expiredCustomers.rows) {
      await client.query('BEGIN');
      try {
        await dataPurge.hardPurgeCustomer(client, row.id);
        await client.query('COMMIT');
        counts.customers += 1;
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error('Failed to purge expired customer', { id: row.id, error: err.message });
      }
    }

    const expiredSamples = await client.query(
      `SELECT s.id FROM samples s
       JOIN customers c ON c.id = s.customer_id
       WHERE s.deleted_at IS NOT NULL AND s.purge_after < NOW()
         AND c.deleted_at IS NULL`
    );
    for (const row of expiredSamples.rows) {
      await client.query('BEGIN');
      try {
        await dataPurge.hardPurgeSample(client, row.id);
        await client.query('COMMIT');
        counts.samples += 1;
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error('Failed to purge expired sample', { id: row.id, error: err.message });
      }
    }

    const expiredReports = await client.query(
      `SELECT r.id FROM reports r
       JOIN samples s ON s.id = r.sample_id
       WHERE r.deleted_at IS NOT NULL AND r.purge_after < NOW()
         AND s.deleted_at IS NULL`
    );
    for (const row of expiredReports.rows) {
      await client.query('BEGIN');
      try {
        await dataPurge.hardPurgeReport(client, row.id);
        await client.query('COMMIT');
        counts.reports += 1;
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error('Failed to purge expired report', { id: row.id, error: err.message });
      }
    }

    const expiredInvoices = await client.query(
      `SELECT i.id FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       WHERE i.deleted_at IS NOT NULL AND i.purge_after < NOW()
         AND c.deleted_at IS NULL`
    );
    for (const row of expiredInvoices.rows) {
      await client.query('BEGIN');
      try {
        await dataPurge.hardPurgeInvoice(client, row.id);
        await client.query('COMMIT');
        counts.invoices += 1;
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error('Failed to purge expired invoice', { id: row.id, error: err.message });
      }
    }

    return { purged: counts };
  } finally {
    client.release();
  }
};

module.exports = {
  deleteEntity,
  restoreEntity,
  listTrash,
  getStatus,
  purgeExpired,
  assertEnabled,
};
