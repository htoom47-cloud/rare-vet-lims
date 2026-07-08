const express = require('express');
const multer = require('multer');
const service = require('../services/animals.service');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { animalSchema } = require('../validators/schemas');
const { PERMISSIONS } = require('../utils/permissions');
const { saveFile } = require('../config/storage');
const { auditLog } = require('../middleware/audit');
const { diskStorage, readAndCleanupUpload, cleanupUploadFile } = require('../utils/upload-disk');

const upload = multer({ storage: diskStorage, limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const router = express.Router();
router.use(authenticate);

router.get('/', authorize(PERMISSIONS.ANIMALS_VIEW), async (req, res, next) => {
  try {
    const data = await service.list(req.query);
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
});

router.get('/:id/trends', authorize(PERMISSIONS.RESULTS_VIEW), async (req, res, next) => {
  try {
    const data = await service.getResultTrends(req.params.id, {
      test_code: req.query.test_code,
      parameter_code: req.query.parameter_code,
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/:id', authorize(PERMISSIONS.ANIMALS_VIEW), async (req, res, next) => {
  try {
    const data = req.query.history === 'true' ? await service.getHistory(req.params.id) : await service.getById(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/', authorize(PERMISSIONS.ANIMALS_CREATE), validate(animalSchema), auditLog('create', 'animals'), async (req, res, next) => {
  try {
    const data = await service.create(req.body, req.user.id);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.put('/:id', authorize(PERMISSIONS.ANIMALS_UPDATE), validate(animalSchema), auditLog('update', 'animals'), async (req, res, next) => {
  try {
    const data = await service.update(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/image', authorize(PERMISSIONS.ANIMALS_UPDATE), upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: { message: 'No image provided' } });
    const buffer = await readAndCleanupUpload(req.file);
    const saved = await saveFile(buffer, 'animals', req.file.originalname);
    const data = await service.updateImage(req.params.id, saved.url);
    res.json({ success: true, data });
  } catch (err) {
    await cleanupUploadFile(req.file).catch(() => {});
    next(err);
  }
});

router.delete('/:id', authorize(PERMISSIONS.ANIMALS_DELETE), auditLog('delete', 'animals'), async (req, res, next) => {
  try {
    const data = await service.remove(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports = router;
