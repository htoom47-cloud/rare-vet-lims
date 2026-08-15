const express = require('express');
const multer = require('multer');
const service = require('../services/purchases.service');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { purchaseInvoiceSchema, purchaseCancelSchema } = require('../validators/schemas');
const { PERMISSIONS } = require('../utils/permissions');
const { diskStorage, readAndCleanupUpload, cleanupUploadFile } = require('../utils/upload-disk');
const { MAX_BYTES } = require('../utils/purchases-files');

const router = express.Router();
router.use(authenticate);

const upload = multer({
  storage: diskStorage,
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const name = String(file.originalname || '');
    const mime = String(file.mimetype || '').toLowerCase();
    if (/\.(exe|bat|cmd|com|msi|dll|js|html|htm|svg|sh|ps1)$/i.test(name)) {
      return cb(new Error('Executable or script files are not allowed'));
    }
    if (/\.(jpe?g|png|webp|pdf)$/i.test(name) || mime.startsWith('image/') || mime === 'application/pdf') {
      return cb(null, true);
    }
    cb(new Error('Only JPEG, PNG, WEBP, or PDF files are allowed'));
  },
});

router.get('/', authorize(PERMISSIONS.PURCHASES_VIEW), async (req, res, next) => {
  try {
    const data = await service.list(req.query, req.user);
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
});

router.get('/:id', authorize(PERMISSIONS.PURCHASES_VIEW), async (req, res, next) => {
  try {
    const data = await service.getById(req.params.id, req.user);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/', authorize(PERMISSIONS.PURCHASES_CREATE), validate(purchaseInvoiceSchema), async (req, res, next) => {
  try {
    const data = await service.create(req.body, req.user, req);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.put('/:id', authorize(PERMISSIONS.PURCHASES_CREATE), validate(purchaseInvoiceSchema), async (req, res, next) => {
  try {
    const data = await service.update(req.params.id, req.body, req.user, req);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.delete('/:id', authorize(PERMISSIONS.PURCHASES_CREATE), async (req, res, next) => {
  try {
    const data = await service.softDelete(req.params.id, req.user, req);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/approve', authorize(PERMISSIONS.PURCHASES_APPROVE), async (req, res, next) => {
  try {
    const data = await service.approve(req.params.id, req.user, req);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/cancel', authorize(PERMISSIONS.PURCHASES_CANCEL), validate(purchaseCancelSchema), async (req, res, next) => {
  try {
    const data = await service.cancel(req.params.id, req.body.reason, req.user, req);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/:id/attachments/:attachmentId', authorize(PERMISSIONS.PURCHASES_VIEW), async (req, res, next) => {
  try {
    const file = await service.openAttachment(req.params.id, req.params.attachmentId, req.user);
    res.setHeader('Content-Type', file.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${String(file.original_name).replace(/"/g, '')}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    file.stream.on('error', next);
    file.stream.pipe(res);
  } catch (err) { next(err); }
});

router.post('/:id/attachments', authorize(PERMISSIONS.PURCHASES_CREATE), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      const err = new Error('File is required');
      err.statusCode = 400;
      err.code = 'FILE_REQUIRED';
      throw err;
    }
    const buffer = await readAndCleanupUpload(req.file);
    const data = await service.addAttachment(req.params.id, {
      buffer,
      originalname: req.file.originalname,
    }, req.user, req);
    res.status(201).json({ success: true, data });
  } catch (err) {
    cleanupUploadFile(req.file);
    next(err);
  }
});

module.exports = router;
