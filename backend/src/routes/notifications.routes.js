const express = require('express');
const service = require('../services/notifications.service');
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

router.post('/send-report/:sampleId', authorize(PERMISSIONS.REPORTS_GENERATE), async (req, res, next) => {
  try {
    const data = await service.sendReportNotification(req.params.sampleId, req.body.channel, req.body.recipient);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports = router;
