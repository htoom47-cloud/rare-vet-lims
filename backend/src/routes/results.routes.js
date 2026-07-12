const express = require('express');
const multer = require('multer');
const service = require('../services/results.service');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { resultEntrySchema, resultApproveBatchSchema, resultValidateSchema } = require('../validators/schemas');
const { PERMISSIONS } = require('../utils/permissions');
const { diskStorage, readAndCleanupUpload, cleanupUploadFile } = require('../utils/upload-disk');

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB — sharper peak RAM than previous 20 MB

const isImageUpload = (file) => {
  const mime = String(file.mimetype || '').toLowerCase();
  const name = file.originalname || '';
  if (IMAGE_EXT.test(name)) return true;
  if (mime.startsWith('image/')) return true;
  // Mobile cameras often send application/octet-stream with generic names (image, capture, blob).
  if (!mime || mime === 'application/octet-stream') {
    return /^(image|capture|photo|blob|tmp|upload)$/i.test(name.replace(/\.[^.]+$/, ''));
  }
  return false;
};

const upload = multer({
  storage: diskStorage,
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (isImageUpload(file)) return cb(null, true);
    cb(new Error('Only image files are allowed (JPEG, PNG, WEBP, HEIC)'));
  },
});

const pickUploadFile = (req) => {
  if (req.file) return req.file;
  const files = req.files;
  if (!files) return null;
  if (Array.isArray(files)) {
    return files.find((f) => f.fieldname === 'image' || f.fieldname === 'file') || files[0] || null;
  }
  return files.image?.[0] || files.file?.[0] || Object.values(files).flat()[0] || null;
};

const handleUpload = (req, res, next) => {
  upload.fields([{ name: 'image', maxCount: 1 }, { name: 'file', maxCount: 1 }])(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Image must be under 10 MB',
            code: 'IMAGE_TOO_LARGE',
            message_ar: 'الصورة يجب أن تكون أقل من 10 ميجابايت',
          },
        });
      }
      return res.status(400).json({
        success: false,
        error: { message: err.message || 'Invalid image upload' },
      });
    }
    try {
      req.file = pickUploadFile(req);
      if (req.file) {
        await readAndCleanupUpload(req.file);
      }
      return next();
    } catch (pickErr) {
      await cleanupUploadFile(req.file).catch(() => {});
      return res.status(400).json({
        success: false,
        error: { message: pickErr.message || 'Invalid image upload' },
      });
    }
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

router.get('/sample-test/:id', authorize(PERMISSIONS.RESULTS_VIEW, PERMISSIONS.RESULTS_UPLOAD_IMAGES), async (req, res, next) => {
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

router.post('/enter', authorize(PERMISSIONS.RESULTS_ENTER, PERMISSIONS.RESULTS_EDIT), validate(resultEntrySchema), async (req, res, next) => {
  try {
    const allowValidatedEdit = req.user.permissions.includes(PERMISSIONS.RESULTS_UNVALIDATE)
      || req.user.role_name === 'admin';
    const data = await service.enterResults(
      { ...req.body, allow_validated_edit: allowValidatedEdit },
      req.user.id
    );
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/approve-batch', authorize(PERMISSIONS.RESULTS_VALIDATE), validate(resultApproveBatchSchema), async (req, res, next) => {
  try {
    const data = await service.approveBatch(req.body.items, req.user.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/validate/:sampleTestId', authorize(PERMISSIONS.RESULTS_VALIDATE), validate(resultValidateSchema), async (req, res, next) => {
  try {
    const data = await service.validateResults(
      req.params.sampleTestId,
      req.user.id,
      req.body.doctor_notes,
      req.body.values
    );
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/unvalidate/:sampleTestId', authorize(PERMISSIONS.RESULTS_UNVALIDATE), async (req, res, next) => {
  try {
    const data = await service.unvalidateResults(req.params.sampleTestId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post(
  '/sample-test/:id/attachments',
  authorize(PERMISSIONS.RESULTS_UPLOAD_IMAGES, PERMISSIONS.RESULTS_ENTER, PERMISSIONS.RESULTS_VALIDATE),
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

router.delete('/sample-test/:id', authorize(PERMISSIONS.RESULTS_ENTER), async (req, res, next) => {
  try {
    const data = await service.clearSampleTestResults(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.patch('/attachments/:id', authorize(PERMISSIONS.RESULTS_ENTER, PERMISSIONS.RESULTS_UPLOAD_IMAGES), async (req, res, next) => {
  try {
    const data = await service.updateAttachment(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.delete('/attachments/:id', authorize(PERMISSIONS.RESULTS_ENTER, PERMISSIONS.RESULTS_VALIDATE), async (req, res, next) => {
  try {
    const data = await service.removeAttachment(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports = router;
