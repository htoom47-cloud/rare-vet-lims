const { AppError } = require('../../middleware/errorHandler');

const disabledError = () => new AppError(
  'Purchase invoice extraction is disabled',
  503,
  'INVOICE_EXTRACTION_DISABLED'
);

const unavailableProvider = {
  name: 'disabled',
  modelVersion: null,
  configured: false,
  async extract() {
    throw disabledError();
  },
};

module.exports = { unavailableProvider, disabledError };
