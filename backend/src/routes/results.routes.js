const express = require('express');
const multer = require('multer');
const service = require('../services/results.service');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { resultEntrySchema } = require('../validators/schemas');
const { PERMISSIONS } = require('../utils/permissions');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype?.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
});

const handleUpload = (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, error: { message: 'Image must be under 10 MB' } });
    }
    return res.status(400).json({
      success: false,
      error: { message: err.message || 'Invalid image upload' },
    });
  });
};
const router = express.Router();
router.use(authenticate);

router.get('/critical', authorize(PERMISSIONS.RESULTS_VIEW), async (req, res, next) => {
  try {
    const data = await service.getCriticalAlerts();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/sample-test/:id', authorize(PERMISSIONS.RESULTS_VIEW), async (req, res, next) => {
  try {
    const data = await service.getBySampleTest(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/previous/:animalId/:parameterId', authorize(PERMISSIONS.RESULTS_VIEW), async (req, res, next) => {
  try {
    const data = await service.getPreviousResults(req.params.animalId, req.params.parameterId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/enter', authorize(PERMISSIONS.RESULTS_ENTER), validate(resultEntrySchema), async (req, res, next) => {
  try {
    const data = await service.enterResults(req.body, req.user.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/validate/:sampleTestId', authorize(PERMISSIONS.RESULTS_VALIDATE), async (req, res, next) => {
  try {
    const data = await service.validateResults(req.params.sampleTestId, req.user.id, req.body.doctor_notes);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post(
  '/sample-test/:id/attachments',
  authorize(PERMISSIONS.RESULTS_ENTER),
  handleUpload,
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: { message: 'No image provided' } });
      }
      const data = await service.addAttachment(req.params.id, req.file, req.user.id, {
        caption: req.body.caption,
        parameter_id: req.body.parameter_id || null,
      });
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
);

router.delete('/attachments/:id', authorize(PERMISSIONS.RESULTS_ENTER), async (req, res, next) => {
  try {
    const data = await service.removeAttachment(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports = router;
