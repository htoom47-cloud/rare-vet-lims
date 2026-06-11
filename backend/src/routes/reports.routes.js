const express = require('express');
const service = require('../services/reports.service');
const { authenticate, authorize } = require('../middleware/auth');
const { PERMISSIONS } = require('../utils/permissions');

const router = express.Router();

router.get('/verify/:code', async (req, res, next) => {
  try {
    const data = await service.verify(req.params.code);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.use(authenticate);

router.get('/', authorize(PERMISSIONS.REPORTS_VIEW), async (req, res, next) => {
  try {
    const data = await service.list(req.query);
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
});

router.post('/interpret/:sampleId', authorize(PERMISSIONS.REPORTS_GENERATE), async (req, res, next) => {
  try {
    const text = await service.previewInterpretation(req.params.sampleId, req.body.language || 'ar');
    res.json({ success: true, data: { interpretation: text } });
  } catch (err) { next(err); }
});

router.post('/generate/:sampleId', authorize(PERMISSIONS.REPORTS_GENERATE), async (req, res, next) => {
  try {
    const data = await service.generate(req.params.sampleId, req.user.id, req.body.language || 'ar', {
      treatment_recommendations: req.body.treatment_recommendations,
    });
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/download/:filename', authorize(PERMISSIONS.REPORTS_VIEW), async (req, res, next) => {
  try {
    await service.servePdf(req.params.filename, res);
  } catch (err) { next(err); }
});

module.exports = router;
