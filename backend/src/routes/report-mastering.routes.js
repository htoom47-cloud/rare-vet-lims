const express = require('express');
const env = require('../config/env');
const { authenticate, authorize } = require('../middleware/auth');
const { PERMISSIONS } = require('../utils/permissions');
const mastering = require('../services/parameter-mastering.service');
const quality = require('../services/reference-quality.service');

const router = express.Router();
router.use(authenticate);

const requireMastering = (req, res, next) => {
  if (!env.features?.reportMastering) {
    return res.status(503).json({
      success: false,
      error: { code: 'FEATURE_DISABLED', message: 'Report mastering is disabled' },
    });
  }
  return next();
};

router.get('/parameters', authorize(PERMISSIONS.REFERENCE_RANGES_MANAGE), requireMastering, async (req, res, next) => {
  try {
    const data = await mastering.listParameters(req.query);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.put('/parameters/:id', authorize(PERMISSIONS.REFERENCE_RANGES_MANAGE), requireMastering, async (req, res, next) => {
  try {
    const data = await mastering.updateParameter(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/device-mappings', authorize(PERMISSIONS.REFERENCE_RANGES_MANAGE), requireMastering, async (req, res, next) => {
  try {
    const data = await mastering.listMappings(req.query);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/device-mappings', authorize(PERMISSIONS.REFERENCE_RANGES_MANAGE), requireMastering, async (req, res, next) => {
  try {
    const data = await mastering.upsertMapping(req.body, req.user.id);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.put('/device-mappings/:id', authorize(PERMISSIONS.REFERENCE_RANGES_MANAGE), requireMastering, async (req, res, next) => {
  try {
    const data = await mastering.upsertMapping({ ...req.body, id: req.params.id }, req.user.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.delete('/device-mappings/:id', authorize(PERMISSIONS.REFERENCE_RANGES_MANAGE), requireMastering, async (req, res, next) => {
  try {
    const data = await mastering.deactivateMapping(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/quality-audit', authorize(PERMISSIONS.REFERENCE_RANGES_MANAGE), requireMastering, async (req, res, next) => {
  try {
    const data = await quality.runQualityAudit(req.query);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports = router;
