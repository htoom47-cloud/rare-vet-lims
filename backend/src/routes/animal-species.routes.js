const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { PERMISSIONS } = require('../utils/permissions');
const service = require('../services/animal-species.service');

const router = express.Router();
router.use(authenticate);

router.get('/', async (_req, res, next) => {
  try {
    const data = await service.listActive();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/all', authorize(PERMISSIONS.REFERENCE_RANGES_MANAGE), async (_req, res, next) => {
  try {
    const data = await service.listAll();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/', authorize(PERMISSIONS.REFERENCE_RANGES_MANAGE), async (req, res, next) => {
  try {
    const data = await service.create(req.body, req.user.id);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.put('/:code', authorize(PERMISSIONS.REFERENCE_RANGES_MANAGE), async (req, res, next) => {
  try {
    const data = await service.update(req.params.code, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.delete('/:code', authorize(PERMISSIONS.REFERENCE_RANGES_MANAGE), async (req, res, next) => {
  try {
    const data = await service.deactivate(req.params.code);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports = router;
