const express = require('express');
const service = require('../services/reports.service');
const env = require('../config/env');
const { authenticate, authorize } = require('../middleware/auth');
const { PERMISSIONS } = require('../utils/permissions');

const router = express.Router();

router.get('/verify/:code', async (req, res, next) => {
  try {
    const data = await service.verify(req.params.code);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

/** Local dev only — preview real reports without login */
if (env.nodeEnv !== 'production') {
  router.get('/:id/preview-dev', async (req, res, next) => {
    try {
      const data = await service.getPreview(req.params.id);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  });
}

router.use(authenticate);

router.get('/', authorize(PERMISSIONS.REPORTS_VIEW), async (req, res, next) => {
  try {
    const data = await service.list(req.query);
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
});

router.post('/generate/:sampleId', authorize(PERMISSIONS.REPORTS_GENERATE), async (req, res, next) => {
  try {
    const data = await service.generate(
      req.params.sampleId,
      req.user.id,
      req.user.role_name,
      req.body.language || 'ar',
      {
        treatment_recommendations: req.body.treatment_recommendations,
        approve_lab: req.body.approve_lab,
        approve_vet: req.body.approve_vet,
      }
    );
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/approve', authorize(PERMISSIONS.REPORTS_GENERATE), async (req, res, next) => {
  try {
    const data = await service.approve(req.params.id, req.user.id, req.user.role_name, req.body.type);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/regenerate-pdf', authorize(PERMISSIONS.REPORTS_GENERATE), async (req, res, next) => {
  try {
    const data = await service.regeneratePdfById(req.params.id);
    res.json({
      success: true,
      data: {
        id: data.id,
        report_number: data.report_number,
        pdf_url: data.pdf_url,
        version: data.version,
        last_generated_at: data.last_generated_at,
        needs_update: data.needs_update,
      },
    });
  } catch (err) { next(err); }
});

router.get('/:id/lifecycle', authorize(PERMISSIONS.REPORTS_VIEW), async (req, res, next) => {
  try {
    const data = await service.getLifecycleStatus(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/download/:filename', authorize(PERMISSIONS.REPORTS_VIEW), async (req, res, next) => {
  try {
    await service.servePdf(req.params.filename, res);
  } catch (err) { next(err); }
});

router.get('/:id/preview', authorize(PERMISSIONS.REPORTS_VIEW), async (req, res, next) => {
  try {
    const data = await service.getPreview(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports = router;
