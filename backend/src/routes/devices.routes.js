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

router.post('/ingest/:deviceId/replay', authenticateDevice, async (req, res, next) => {
  try {
    const sampleCode = req.body.sampleCode || req.body.sample_code || req.body.sampleId;
    if (!sampleCode) {
      return res.status(400).json({ success: false, error: { message: 'sampleCode required' } });
    }
    const data = await service.replaySampleImport(req.device, sampleCode);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.use(authenticate);

router.get('/reference-ranges/list', authorize(PERMISSIONS.DEVICES_VIEW), async (req, res, next) => {
  try {
    const deviceRefRanges = require('../services/device-reference-ranges.service');
    const data = await deviceRefRanges.list({
      device_name: req.query.device_name,
      species: req.query.species,
      parameter_code: req.query.parameter_code,
      search: req.query.search,
      page: parseInt(req.query.page, 10) || 1,
      limit: Math.min(parseInt(req.query.limit, 10) || 100, 500),
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/reference-ranges/logs', authorize(PERMISSIONS.DEVICES_VIEW), async (req, res, next) => {
  try {
    const deviceRefRanges = require('../services/device-reference-ranges.service');
    const data = await deviceRefRanges.listLogs({
      limit: Math.min(parseInt(req.query.limit, 10) || 50, 200),
      device_name: req.query.device_name,
      parameter_code: req.query.parameter_code,
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/reference-ranges/sync', authorize(PERMISSIONS.DEVICES_MANAGE), async (req, res, next) => {
  try {
    const deviceRefRanges = require('../services/device-reference-ranges.service');
    const hours = parseInt(req.body?.hours, 10) || 24;
    const data = await deviceRefRanges.syncFromRecentMessages({ hours });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/ref-debug/message/:messageId', authorize(PERMISSIONS.DEVICES_VIEW), async (req, res, next) => {
  try {
    const normaRefDebug = require('../services/norma-ref-debug.service');
    const data = await normaRefDebug.analyzeMessage(req.params.messageId);
    if (!data) return res.status(404).json({ success: false, error: { message: 'Message not found' } });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/ref-debug/sample/:sampleId', authorize(PERMISSIONS.DEVICES_VIEW), async (req, res, next) => {
  try {
    const normaRefDebug = require('../services/norma-ref-debug.service');
    const data = await normaRefDebug.analyzeSample(req.params.sampleId);
    if (!data) return res.status(404).json({ success: false, error: { message: 'No Norma message for sample' } });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/ref-debug/species-audit', authorize(PERMISSIONS.DEVICES_VIEW), async (req, res, next) => {
  try {
    const normaRefDebug = require('../services/norma-ref-debug.service');
    const data = await normaRefDebug.auditAllSpecies();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

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
