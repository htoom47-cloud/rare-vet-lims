const express = require('express');
const rateLimit = require('express-rate-limit');
const portalService = require('../services/portal.service');
const { validate } = require('../middleware/validate');
const { portalOtpRequestSchema, portalOtpVerifySchema } = require('../validators/schemas');
const { authenticateCustomer } = require('../middleware/customerAuth');

const router = express.Router();

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: { message: 'Too many OTP requests', code: 'RATE_LIMIT' } },
});

router.post('/auth/request-otp', otpLimiter, validate(portalOtpRequestSchema), async (req, res, next) => {
  try {
    const data = await portalService.requestOtp(req.body.mobile);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/auth/verify-otp', otpLimiter, validate(portalOtpVerifySchema), async (req, res, next) => {
  try {
    const data = await portalService.verifyOtp(req.body.mobile, req.body.otp);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.use(authenticateCustomer);

router.get('/me', (req, res) => {
  res.json({ success: true, data: req.customer });
});

router.get('/reports', async (req, res, next) => {
  try {
    const data = await portalService.listReports(req.customer.id, req.query);
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
});

router.get('/reports/:id/preview', async (req, res, next) => {
  try {
    const data = await portalService.getReportPreview(req.params.id, req.customer.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/reports/download/:filename', async (req, res, next) => {
  try {
    await portalService.serveReportPdf(req.params.filename, req.customer.id, res);
  } catch (err) { next(err); }
});

module.exports = router;
