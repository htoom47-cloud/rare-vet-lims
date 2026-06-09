const express = require('express');
const path = require('path');
const service = require('../services/reports.service');
const { authenticate, authorize } = require('../middleware/auth');
const { PERMISSIONS } = require('../utils/permissions');
const { ensureUploadDir } = require('../config/storage');

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

router.post('/generate/:sampleId', authorize(PERMISSIONS.REPORTS_GENERATE), async (req, res, next) => {
  try {
    const data = await service.generate(req.params.sampleId, req.user.id, req.body.language || 'en');
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/download/:filename', authorize(PERMISSIONS.REPORTS_VIEW), (req, res) => {
  const filePath = path.join(ensureUploadDir(), 'reports', req.params.filename);
  res.download(filePath);
});

module.exports = router;
