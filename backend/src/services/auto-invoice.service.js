const { query } = require('../config/database');
const logger = require('../config/logger');
const invoiceSettingsService = require('./invoice-settings.service');
const billing = require('./billing.service');

const sampleHasInvoice = async (sampleId) => {
  const result = await query(
    `SELECT id FROM invoices WHERE sample_id = $1 AND status NOT IN ('cancelled') LIMIT 1`,
    [sampleId]
  );
  return !!result.rows[0];
};

const buildItemsFromSample = async (sampleId) => {
  const result = await query(
    `SELECT st.test_id, st.price, t.name AS test_name, s.animal_id
     FROM sample_tests st
     JOIN tests t ON st.test_id = t.id
     JOIN samples s ON st.sample_id = s.id
     WHERE st.sample_id = $1`,
    [sampleId]
  );
  return result.rows.map((row) => ({
    test_id: row.test_id,
    animal_id: row.animal_id,
    description: row.test_name,
    quantity: 1,
    unit_price: parseFloat(row.price) || 0,
  }));
};

const getAutoTrigger = async () => {
  const settings = await invoiceSettingsService.getInvoiceSettings();
  return settings.options?.auto_invoice_trigger || 'manual';
};

const shouldRun = (mode, trigger) => {
  if (mode === 'manual') return false;
  if (mode === 'both') return trigger === 'sample' || trigger === 'validation';
  return mode === trigger;
};

const tryAutoInvoice = async (sampleId, userId, trigger) => {
  if (!sampleId || !userId) return null;

  try {
    const mode = await getAutoTrigger();
    if (!shouldRun(mode, trigger)) return null;
    if (await sampleHasInvoice(sampleId)) return null;

    const sampleResult = await query('SELECT customer_id FROM samples WHERE id = $1', [sampleId]);
    if (!sampleResult.rows[0]) return null;

    const items = await buildItemsFromSample(sampleId);
    if (!items.length) return null;

    const invoice = await billing.createInvoice({
      customer_id: sampleResult.rows[0].customer_id,
      sample_id: sampleId,
      items,
      discount_amount: 0,
      notes: trigger === 'sample' ? 'فاتورة تلقائية — عند إنشاء الطلب' : 'فاتورة تلقائية — عند اعتماد النتائج',
    }, userId);

    logger.info('Auto invoice created', { sampleId, invoiceId: invoice.id, trigger });
    return invoice;
  } catch (err) {
    logger.warn('Auto invoice failed', { sampleId, trigger, error: err.message });
    return null;
  }
};

module.exports = { tryAutoInvoice, getAutoTrigger };
