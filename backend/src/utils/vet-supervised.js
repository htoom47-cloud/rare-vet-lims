/**
 * Supervising veterinarian + end-client sample billing.
 * Gated by VET_SUPERVISED_SAMPLES (default off).
 */
const env = require('../config/env');
const { AppError } = require('../middleware/errorHandler');

const CUSTOMER_KIND_CUSTOMER = 'customer';
const CUSTOMER_KIND_VETERINARIAN = 'veterinarian';
const CUSTOMER_KINDS = [CUSTOMER_KIND_CUSTOMER, CUSTOMER_KIND_VETERINARIAN];

const isVetSupervisedEnabled = () => !!env.features?.vetSupervisedSamples;

const normalizeCustomerKind = (kind) => {
  const value = String(kind || CUSTOMER_KIND_CUSTOMER).trim().toLowerCase();
  return CUSTOMER_KINDS.includes(value) ? value : CUSTOMER_KIND_CUSTOMER;
};

/** Portal sample access: end client or supervising veterinarian. */
const samplePortalAccessSql = (sampleAlias = 's', param = '$1') => (
  `(${sampleAlias}.customer_id = ANY(${param}::uuid[])`
  + ` OR ${sampleAlias}.supervising_veterinarian_id = ANY(${param}::uuid[]))`
);

/** Animal visible if owned by customer or has a supervised sample for them. */
const animalPortalAccessSql = (animalAlias = 'a', param = '$1') => (
  `(${animalAlias}.owner_id = ANY(${param}::uuid[])`
  + ` OR EXISTS (`
  + ` SELECT 1 FROM samples sv_s`
  + ` WHERE sv_s.animal_id = ${animalAlias}.id`
  + `   AND sv_s.supervising_veterinarian_id = ANY(${param}::uuid[])`
  + `   AND sv_s.deleted_at IS NULL`
  + ` ))`
);

const assertSupervisingVeterinarian = async (clientOrQuery, veterinarianId) => {
  if (!veterinarianId) return null;
  if (!isVetSupervisedEnabled()) {
    throw new AppError('Supervising veterinarian is not enabled', 400, 'FEATURE_DISABLED');
  }
  const run = typeof clientOrQuery.query === 'function'
    ? clientOrQuery.query.bind(clientOrQuery)
    : clientOrQuery;
  const result = await run(
    `SELECT id, full_name, full_name_ar, mobile, kind
     FROM customers
     WHERE id = $1 AND is_active = true AND deleted_at IS NULL`,
    [veterinarianId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new AppError('Supervising veterinarian not found', 404, 'NOT_FOUND');
  }
  if (row.kind !== CUSTOMER_KIND_VETERINARIAN) {
    throw new AppError(
      'Selected contact must be marked as a veterinarian',
      400,
      'NOT_VETERINARIAN'
    );
  }
  return row;
};

const buildSampleOwnerInvoiceNote = ({ ownerName, ownerMobile, lang = 'ar' } = {}) => {
  const name = String(ownerName || '').trim();
  const mobile = String(ownerMobile || '').trim();
  if (!name && !mobile) return '';
  const who = [name, mobile].filter(Boolean).join(' — ');
  return lang === 'en'
    ? `Sample for end client: ${who}`
    : `العينة باسم العميل: ${who}`;
};

module.exports = {
  CUSTOMER_KIND_CUSTOMER,
  CUSTOMER_KIND_VETERINARIAN,
  CUSTOMER_KINDS,
  isVetSupervisedEnabled,
  normalizeCustomerKind,
  samplePortalAccessSql,
  animalPortalAccessSql,
  assertSupervisingVeterinarian,
  buildSampleOwnerInvoiceNote,
};
