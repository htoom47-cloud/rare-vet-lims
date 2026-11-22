const express = require('express');
const service = require('../services/customers.service');
const reportNotify = require('../services/customer-report-notifications.service');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { customerSchema, entitlementSchema, storeCreditDepositSchema } = require('../validators/schemas');
const entitlements = require('../services/entitlements.service');
const storeCredit = require('../services/customer-store-credit.service');
const { PERMISSIONS } = require('../utils/permissions');
const { auditLog } = require('../middleware/audit');

const router = express.Router();
router.use(authenticate);

router.get('/', authorize(PERMISSIONS.CUSTOMERS_VIEW), async (req, res, next) => {
  try {
    const data = await service.list(req.query);
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
});

router.get('/:id/ready-reports', authorize(PERMISSIONS.NOTIFICATIONS_SEND_REPORT), async (req, res, next) => {
  try {
    const data = await reportNotify.listReadyReports(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/send-ready-reports', authorize(PERMISSIONS.NOTIFICATIONS_SEND_REPORT), async (req, res, next) => {
  try {
    const data = await reportNotify.sendReadyReports(
      req.params.id,
      {
        reportIds: req.body.reportIds,
        channel: req.body.channel,
        forceResend: req.body.forceResend === true,
      },
      req.user.id
    );
    res.json({
      success: true,
      data,
      dryRun: data.dryRun === true,
      userMessage: data.dryRun
        ? 'النظام يعمل في وضع الاختبار (Dry Run)، ولم يتم إرسال رسالة فعلية.'
        : undefined,
    });
  } catch (err) {
    if (err.code === 'ALREADY_SENT' && err.details) {
      return res.status(err.statusCode || 409).json({
        success: false,
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
        },
      });
    }
    next(err);
  }
});

router.post('/:id/skip-ready-reports', authorize(PERMISSIONS.NOTIFICATIONS_SEND_REPORT), async (req, res, next) => {
  try {
    const data = await reportNotify.skipReadyReports(
      req.params.id,
      {
        reportIds: req.body.reportIds,
        reason: req.body.reason,
      },
      req.user.id
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/entitlements', authorize(PERMISSIONS.CUSTOMERS_VIEW), async (req, res, next) => {
  try {
    const data = await entitlements.getBreederEntitlement(req.params.id);
    res.json({
      success: true,
      data: {
        feature_available: entitlements.isGlobalEnabled(),
        breeder_dashboard: data,
      },
    });
  } catch (err) { next(err); }
});

router.put('/:id/entitlements', authorize(PERMISSIONS.CUSTOMERS_UPDATE), validate(entitlementSchema), auditLog('update', 'customer_entitlements'), async (req, res, next) => {
  try {
    const data = await entitlements.upsertBreederDashboard(req.params.id, req.body, req.user.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/:id/store-credit', authorize(PERMISSIONS.CUSTOMERS_VIEW, PERMISSIONS.BILLING_VIEW), async (req, res, next) => {
  try {
    const data = await storeCredit.getBalance(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/:id/store-credit/entries', authorize(PERMISSIONS.CUSTOMERS_VIEW, PERMISSIONS.BILLING_VIEW), async (req, res, next) => {
  try {
    const data = await storeCredit.listEntries(req.params.id, req.query);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post(
  '/:id/store-credit',
  authorize(PERMISSIONS.BILLING_STORE_CREDIT),
  validate(storeCreditDepositSchema),
  auditLog('create', 'customer_store_credit'),
  async (req, res, next) => {
    try {
      const data = await storeCredit.deposit(req.params.id, req.body, req.user.id, req);
      res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
  }
);

router.get('/:id', authorize(PERMISSIONS.CUSTOMERS_VIEW), async (req, res, next) => {
  try {
    const data = await service.getProfile(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/', authorize(PERMISSIONS.CUSTOMERS_CREATE), validate(customerSchema), auditLog('create', 'customers'), async (req, res, next) => {
  try {
    const data = await service.create(req.body, req.user.id, { role: req.user.role });
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.put('/:id', authorize(PERMISSIONS.CUSTOMERS_UPDATE), validate(customerSchema), auditLog('update', 'customers'), async (req, res, next) => {
  try {
    const data = await service.update(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.delete('/:id', authorize(PERMISSIONS.CUSTOMERS_DELETE), auditLog('delete', 'customers'), async (req, res, next) => {
  try {
    const data = await service.remove(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports = router;
