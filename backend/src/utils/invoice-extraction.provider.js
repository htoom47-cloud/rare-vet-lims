const env = require('../config/env');
const { unavailableProvider, disabledError } = require('./providers/unavailable-invoice-extraction.provider');
const { createOpenAIInvoiceExtractionProvider } = require('./providers/openai-invoice-extraction.provider');

const isInvoiceExtractionEnabled = (config = env.invoiceExtraction || {}) => {
  const name = String(config.provider || 'off').trim().toLowerCase();
  const key = String(config.apiKey || '').trim();
  return name === 'openai' && Boolean(key);
};

const createInvoiceExtractionProvider = (overrides = {}) => {
  if (overrides.provider && typeof overrides.provider === 'object') return overrides.provider;
  const config = { ...(env.invoiceExtraction || {}), ...(overrides.config || {}) };
  if (!isInvoiceExtractionEnabled(config)) return unavailableProvider;
  return createOpenAIInvoiceExtractionProvider(config);
};

module.exports = {
  createInvoiceExtractionProvider,
  unavailableProvider,
  isInvoiceExtractionEnabled,
  disabledError,
};
