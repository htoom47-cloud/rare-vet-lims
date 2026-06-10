const express = require('express');
const service = require('../services/devices.service');
const { authenticate, authorize } = require('../middleware/auth');
const { authenticateDevice } = require('../middleware/deviceAuth');
const { PERMISSIONS } = require('../utils/permissions');

const router = express.Router();

// Bridge endpoint — no JWT, uses X-Device-Key header
router.post('/ingest/:deviceId', authenticateDevice, async (req, res, next) => {
  try {
    const raw = req.body.message || req.body.raw || req.body.hl7 || req.body.astm;
    if (!raw) {
      return res.status(400).json({ success: false, error: { message: 'message field required' } });
    }
    const data = await service.receiveMessage(req.params.deviceId, raw, 'inbound', req.device);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.use(authenticate);

router.get('/', authorize(PERMISSIONS.DEVICES_VIEW), async (req, res, next) => {
  try {
    const data = await service.list();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/', authorize(PERMISSIONS.DEVICES_MANAGE), async (req, res, next) => {
  try {
    const data = await service.create(req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.put('/:id', authorize(PERMISSIONS.DEVICES_MANAGE), async (req, res, next) => {
  try {
    const data = await service.update(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/regenerate-key', authorize(PERMISSIONS.DEVICES_MANAGE), async (req, res, next) => {
  try {
    const data = await service.regenerateApiKey(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/messages', authorize(PERMISSIONS.DEVICES_MANAGE), async (req, res, next) => {
  try {
    const data = await service.receiveMessage(req.params.id, req.body.message, req.body.direction);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/:id/messages', authorize(PERMISSIONS.DEVICES_VIEW), async (req, res, next) => {
  try {
    const data = await service.getMessages(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports = router;
