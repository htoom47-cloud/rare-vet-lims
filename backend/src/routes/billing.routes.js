const express = require('express');
const service = require('../services/billing.service');
const invoiceSettingsService = require('../services/invoice-settings.service');
const accounting = require('../services/accounting.service');
const dailyClosing = require('../services/daily-closing.service');
const ledger = require('../services/ledger.service');
const quoteService = require('../services/quote.service');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { invoiceSchema, quoteSchema, paymentSchema } = require('../validators/schemas');
const { PERMISSIONS } = require('../utils/permissions');
const { listExtraBillingServices } = require('../constants/fieldVisit');

const router = express.Router();
router.use(authenticate);

router.get('/dashboard-summary', authorize(PERMISSIONS.BILLING_VIEW), async (req, res, next) => {
  try {
    const data = await accounting.getDashboardSummary(req.query.date);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/daily-summary', authorize(PERMISSIONS.BILLING_VIEW), async (req, res, next) => {
  try {
    const data = await accounting.getDailyFullSummary(req.query.date);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/daily-closing', authorize(PERMISSIONS.BILLING_VIEW), async (req, res, next) => {
  try {
    const data = await dailyClosing.getClosing(req.query.date);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/daily-closing/history', authorize(PERMISSIONS.BILLING_VIEW), async (req, res, next) => {
  try {
    const data = await dailyClosing.listClosings(parseInt(req.query.limit, 10) || 30);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/daily-closing/close', authorize(PERMISSIONS.BILLING_DAY_CLOSE), async (req, res, next) => {
  try {
    const data = await dailyClosing.closeDay(req.body.date, req.user.id, req);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/daily-closing/reopen', authorize(PERMISSIONS.BILLING_DAY_REOPEN), async (req, res, next) => {
  try {
    const data = await dailyClosing.reopenDay(req.body.date, req.user.id, req);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/daily-closing/:id/pdf', authorize(PERMISSIONS.BILLING_VIEW), async (req, res, next) => {
  try {
    await dailyClosing.serveClosingPdf(req.params.id, res);
  } catch (err) { next(err); }
});

router.get('/invoices/export/csv', authorize(PERMISSIONS.BILLING_VIEW), async (req, res, next) => {
  try {
    const csv = await service.exportInvoicesCsv(req.query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="invoices.csv"');
    res.send(`\uFEFF${csv}`);
  } catch (err) { next(err); }
});

router.get('/reports/unpaid', authorize(PERMISSIONS.BILLING_VIEW), async (req, res, next) => {
  try {
    const data = await accounting.getUnpaidInvoicesReport();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/reports/vat', authorize(PERMISSIONS.BILLING_VIEW), async (req, res, next) => {
  try {
    const data = await accounting.getVatReport(req.query.from, req.query.to);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/reports/cancelled-refunded', authorize(PERMISSIONS.BILLING_VIEW), async (req, res, next) => {
  try {
    const data = await accounting.getCancelledRefundedReport(req.query.from, req.query.to);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/reports/by-service', authorize(PERMISSIONS.BILLING_VIEW), async (req, res, next) => {
  try {
    const data = await accounting.getRevenueByService(req.query.from, req.query.to);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/reports/by-customer', authorize(PERMISSIONS.BILLING_VIEW), async (req, res, next) => {
  try {
    const data = await accounting.getCustomerRevenueReport(req.query.from, req.query.to);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

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

router.get('/quotes', authorize(PERMISSIONS.BILLING_VIEW), async (req, res, next) => {
  try {
    const data = await quoteService.listQuotes(req.query);
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
});

router.post('/quotes', authorize(PERMISSIONS.BILLING_CREATE), validate(quoteSchema), async (req, res, next) => {
  try {
    const data = await quoteService.createQuote(req.body, req.user.id);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/quotes/:id', authorize(PERMISSIONS.BILLING_VIEW), async (req, res, next) => {
  try {
    const data = await quoteService.getQuoteById(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/quotes/:id/pdf', authorize(PERMISSIONS.BILLING_VIEW), async (req, res, next) => {
  try {
    await quoteService.serveQuotePdf(req.params.id, res, { regenerate: req.query.regenerate === '1' });
  } catch (err) { next(err); }
});

router.get('/invoices', authorize(PERMISSIONS.BILLING_VIEW), async (req, res, next) => {
  try {
    const data = await service.listInvoices(req.query);
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
});

router.post('/invoices/:id/cancel', authorize(PERMISSIONS.BILLING_CANCEL), async (req, res, next) => {
  try {
    const data = await service.cancelInvoice(req.params.id, req.body.reason, req.user.id, req);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/invoices/:id/pdf', authorize(PERMISSIONS.BILLING_VIEW), async (req, res, next) => {
  try {
    await service.serveInvoicePdf(req.params.id, res, {
      regenerate: req.query.regenerate === '1',
      format: req.query.format,
    });
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

router.get(
  '/extra-services',
  authorize(PERMISSIONS.BILLING_VIEW, PERMISSIONS.BILLING_CREATE, PERMISSIONS.PRICE_LIST_VIEW),
  async (req, res, next) => {
    try {
      res.json({ success: true, data: listExtraBillingServices() });
    } catch (err) { next(err); }
  }
);

router.post('/invoices', authorize(PERMISSIONS.BILLING_CREATE), validate(invoiceSchema), async (req, res, next) => {
  try {
    const data = await service.createInvoice(req.body, req.user.id);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/payments', authorize(PERMISSIONS.BILLING_PAYMENT), validate(paymentSchema), async (req, res, next) => {
  try {
    const data = await service.recordPayment(req.body, req.user.id, req);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/refunds', authorize(PERMISSIONS.BILLING_REFUND), async (req, res, next) => {
  try {
    const data = await service.processRefund(req.body, req.user.id, req);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports = router;
