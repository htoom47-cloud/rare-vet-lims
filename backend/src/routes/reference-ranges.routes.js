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
      device_id: req.query.device_id,
      include_inactive: req.query.include_inactive,
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

router.get('/quality-audit', authorize(PERMISSIONS.REFERENCE_RANGES_MANAGE), async (req, res, next) => {
  try {
    const env = require('../config/env');
    if (!env.features?.reportMastering) {
      return res.status(503).json({
        success: false,
        error: { code: 'FEATURE_DISABLED', message: 'Enable REPORT_MASTERING_ENABLED for quality audit' },
      });
    }
    const quality = require('../services/reference-quality.service');
    const data = await quality.runQualityAudit(req.query);
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
