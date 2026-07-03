const express = require('express');
const service = require('../services/notifications.service');
const env = require('../config/env');
const { authenticate, authorize } = require('../middleware/auth');
const { PERMISSIONS } = require('../utils/permissions');

const router = express.Router();
router.use(authenticate);

router.get('/channels', authorize(PERMISSIONS.REPORTS_VIEW), async (req, res, next) => {
  try {
    const data = service.getEnabledChannels();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/', authorize(PERMISSIONS.SETTINGS_VIEW), async (req, res, next) => {
  try {
    const data = await service.list(req.query);
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
});

router.post('/queue', authorize(PERMISSIONS.SETTINGS_MANAGE), async (req, res, next) => {
  try {
    const data = await service.queue(req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/send-report/:sampleId', authorize(PERMISSIONS.NOTIFICATIONS_SEND_REPORT, PERMISSIONS.REPORTS_GENERATE), async (req, res, next) => {
  try {
    const channel = req.body.channel || env.notifications.defaultChannel;
    const data = await service.sendReportNotification(req.params.sampleId, channel, req.body.recipient);
    const isDryRun = data.dryRun === true;
    res.json({
      success: true,
      data,
      dryRun: isDryRun,
      userMessage: isDryRun ? data.userMessage : undefined,
    });
  } catch (err) { next(err); }
});

router.get('/config-status', authorize(PERMISSIONS.SETTINGS_VIEW), async (req, res, next) => {
  try {
    const config = service.getConfigStatus();
    const stats = await service.getDailyStats();
    res.json({ success: true, data: { ...config, stats } });
  } catch (err) { next(err); }
});

router.get('/stats', authorize(PERMISSIONS.DASHBOARD_VIEW), async (req, res, next) => {
  try {
    const stats = await service.getDailyStats();
    res.json({ success: true, data: stats });
  } catch (err) { next(err); }
});

router.post('/test-send', authorize(PERMISSIONS.SETTINGS_MANAGE), async (req, res, next) => {
  try {
    const { channel = 'sms', recipient } = req.body;
    if (!recipient) {
      return res.status(400).json({ success: false, error: { message: 'Recipient is required' } });
    }
    const queued = await service.queue({
      channel,
      recipient: require('../utils/phone').formatToE164(recipient),
      subject: 'Test notification',
      body: `${env.lab.nameAr}\nرسالة اختبار من النظام — Test message from LIMS`,
      metadata: { type: 'test', sent_by: req.user.id },
    });
    const result = await service.dispatchOne(queued);
    res.json({
      success: true,
      data: result,
      dryRun: result.dryRun === true,
      userMessage: result.userMessage,
    });
  } catch (err) { next(err); }
});

module.exports = router;
