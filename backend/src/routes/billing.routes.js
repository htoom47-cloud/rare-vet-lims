const express = require('express');
const service = require('../services/billing.service');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { invoiceSchema, paymentSchema } = require('../validators/schemas');
const { PERMISSIONS } = require('../utils/permissions');

const router = express.Router();
router.use(authenticate);

router.get('/invoices', authorize(PERMISSIONS.BILLING_VIEW), async (req, res, next) => {
  try {
    const data = await service.listInvoices(req.query);
    res.json({ success: true, ...data });
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
