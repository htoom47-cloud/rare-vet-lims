const express = require('express');
const service = require('../services/billing.service');
const invoiceSettingsService = require('../services/invoice-settings.service');
const accounting = require('../services/accounting.service');
const ledger = require('../services/ledger.service');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { invoiceSchema, paymentSchema } = require('../validators/schemas');
const { PERMISSIONS } = require('../utils/permissions');

const router = express.Router();
router.use(authenticate);

router.get('/invoice-settings', authorize(PERMISSIONS.BILLING_VIEW), async (req, res, next) => {
  try {
    const data = await invoiceSettingsService.getInvoiceSettings();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.put('/invoice-settings', authorize(PERMISSIONS.BILLING_CREATE), async (req, res, next) => {
  try {
    const data = await invoiceSettingsService.updateInvoiceSettings(req.body, req.user.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/invoice-settings/preview', authorize(PERMISSIONS.BILLING_VIEW), async (req, res, next) => {
  try {
    await invoiceSettingsService.previewInvoicePdf(res, req.body || null);
  } catch (err) { next(err); }
});

router.get('/reports/collections', authorize(PERMISSIONS.BILLING_VIEW), async (req, res, next) => {
  try {
    const data = await accounting.getDailyCollections(req.query.date);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/reports/ar-aging', authorize(PERMISSIONS.BILLING_VIEW), async (req, res, next) => {
  try {
    const data = await accounting.getArAging();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/reports/revenue', authorize(PERMISSIONS.BILLING_VIEW), async (req, res, next) => {
  try {
    const data = await accounting.getRevenueSummary(req.query.from, req.query.to);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/reports/journal', authorize(PERMISSIONS.BILLING_VIEW), async (req, res, next) => {
  try {
    const data = await ledger.listJournalEntries(parseInt(req.query.limit, 10) || 50);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/customers/:customerId/statement', authorize(PERMISSIONS.BILLING_VIEW), async (req, res, next) => {
  try {
    const data = await accounting.getCustomerStatement(req.params.customerId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/invoices', authorize(PERMISSIONS.BILLING_VIEW), async (req, res, next) => {
  try {
    const data = await service.listInvoices(req.query);
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
});

router.get('/invoices/:id/pdf', authorize(PERMISSIONS.BILLING_VIEW), async (req, res, next) => {
  try {
    await service.serveInvoicePdf(req.params.id, res, { regenerate: req.query.regenerate === '1' });
  } catch (err) { next(err); }
});

router.get('/invoices/:id', authorize(PERMISSIONS.BILLING_VIEW), async (req, res, next) => {
  try {
    const data = await service.getInvoiceById(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/packages', authorize(PERMISSIONS.BILLING_VIEW), async (req, res, next) => {
  try {
    const data = await service.listPackages();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/invoices', authorize(PERMISSIONS.BILLING_CREATE), validate(invoiceSchema), async (req, res, next) => {
  try {
    const data = await service.createInvoice(req.body, req.user.id);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/payments', authorize(PERMISSIONS.BILLING_PAYMENT), validate(paymentSchema), async (req, res, next) => {
  try {
    const data = await service.recordPayment(req.body, req.user.id);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/refunds', authorize(PERMISSIONS.BILLING_REFUND), async (req, res, next) => {
  try {
    const data = await service.processRefund(req.body, req.user.id);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports = router;
