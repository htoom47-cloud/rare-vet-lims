const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { PERMISSIONS } = require('../utils/permissions');
const service = require('../services/reference-ranges-admin.service');

const router = express.Router();
router.use(authenticate);

router.get('/', authorize(PERMISSIONS.REFERENCE_RANGES_MANAGE), async (req, res, next) => {
  try {
    const data = await service.list({
      species: req.query.species,
      test_id: req.query.test_id,
      parameter_id: req.query.parameter_id,
      search: req.query.search,
      page: parseInt(req.query.page, 10) || 1,
      limit: Math.min(parseInt(req.query.limit, 10) || 100, 500),
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/', authorize(PERMISSIONS.REFERENCE_RANGES_MANAGE), async (req, res, next) => {
  try {
    const data = await service.create(req.body, req.user.id);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.put('/:id', authorize(PERMISSIONS.REFERENCE_RANGES_MANAGE), async (req, res, next) => {
  try {
    const data = await service.update(req.params.id, req.body, req.user.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.delete('/:id', authorize(PERMISSIONS.REFERENCE_RANGES_MANAGE), async (req, res, next) => {
  try {
    const data = await service.deactivate(req.params.id, req.user.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/:id/logs', authorize(PERMISSIONS.REFERENCE_RANGES_MANAGE), async (req, res, next) => {
  try {
    const data = await service.listLogs(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports = router;
