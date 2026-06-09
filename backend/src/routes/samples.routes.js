const express = require('express');
const service = require('../services/samples.service');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { sampleSchema } = require('../validators/schemas');
const { PERMISSIONS } = require('../utils/permissions');
const { auditLog } = require('../middleware/audit');

const router = express.Router();
router.use(authenticate);

router.get('/', authorize(PERMISSIONS.SAMPLES_VIEW), async (req, res, next) => {
  try {
    const data = await service.list(req.query);
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
});

router.get('/queue', authorize(PERMISSIONS.SAMPLES_VIEW), async (req, res, next) => {
  try {
    const data = await service.getQueue(req.user.role_name === 'lab_technician' ? req.user.id : null);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/scan/:barcode', authorize(PERMISSIONS.SAMPLES_VIEW), async (req, res, next) => {
  try {
    const data = await service.getByBarcode(req.params.barcode);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/:id', authorize(PERMISSIONS.SAMPLES_VIEW), async (req, res, next) => {
  try {
    const data = await service.getById(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/:id/barcode', authorize(PERMISSIONS.SAMPLES_VIEW), async (req, res, next) => {
  try {
    const data = await service.getBarcode(req.params.id, req.query.format);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/', authorize(PERMISSIONS.SAMPLES_CREATE), validate(sampleSchema), auditLog('create', 'samples'), async (req, res, next) => {
  try {
    const data = await service.create(req.body, req.user.id);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.patch('/:id/status', authorize(PERMISSIONS.SAMPLES_UPDATE), auditLog('update_status', 'samples'), async (req, res, next) => {
  try {
    const data = await service.updateStatus(req.params.id, req.body.status, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports = router;
