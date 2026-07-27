const express = require('express');
const hatif = require('../services/hatif.service');
const { authenticate, authorize } = require('../middleware/auth');
const { PERMISSIONS } = require('../utils/permissions');

const router = express.Router();
router.use(authenticate);

/** Integration status for staff UI (no secrets). */
router.get('/status', authorize(PERMISSIONS.NOTIFICATIONS_SEND_REPORT), async (_req, res, next) => {
  try {
    res.json({ success: true, data: hatif.getStatus() });
  } catch (err) { next(err); }
});

/** Send WhatsApp text to a customer via Hatif (feature-flagged). */
router.post(
  '/customers/:id/whatsapp',
  authorize(PERMISSIONS.NOTIFICATIONS_SEND_REPORT),
  async (req, res, next) => {
    try {
      const data = await hatif.sendCustomerWhatsApp(
        req.params.id,
        { message: req.body?.message },
        req.user.id,
        req
      );
      res.json({
        success: true,
        data,
        dryRun: data.dryRun === true,
        userMessage: data.userMessage,
      });
    } catch (err) { next(err); }
  }
);

module.exports = router;
