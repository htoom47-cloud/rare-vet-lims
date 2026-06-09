const express = require('express');
const service = require('../services/quality.service');
const { authenticate, authorize } = require('../middleware/auth');
const { PERMISSIONS } = require('../utils/permissions');

const router = express.Router();
router.use(authenticate);

router.get('/qc', authorize(PERMISSIONS.QUALITY_VIEW), async (req, res, next) => {
  try {
    const data = await service.listQC(req.query);
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
});

router.post('/qc', authorize(PERMISSIONS.QUALITY_MANAGE), async (req, res, next) => {
  try {
    const data = await service.createQC(req.body, req.user.id);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/maintenance', authorize(PERMISSIONS.QUALITY_VIEW), async (req, res, next) => {
  try {
    const data = await service.listMaintenance();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/maintenance', authorize(PERMISSIONS.QUALITY_MANAGE), async (req, res, next) => {
  try {
    const data = await service.createMaintenance(req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/calibrations', authorize(PERMISSIONS.QUALITY_VIEW), async (req, res, next) => {
  try {
    const data = await service.listCalibrations();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/calibrations', authorize(PERMISSIONS.QUALITY_MANAGE), async (req, res, next) => {
  try {
    const data = await service.createCalibration(req.body, req.user.id);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/temperature', authorize(PERMISSIONS.QUALITY_VIEW), async (req, res, next) => {
  try {
    const data = await service.listTemperatureLogs();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/temperature', authorize(PERMISSIONS.QUALITY_MANAGE), async (req, res, next) => {
  try {
    const data = await service.createTemperatureLog(req.body, req.user.id);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports = router;
