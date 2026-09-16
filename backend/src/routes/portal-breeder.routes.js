const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const breeder = require('../services/breeder.service');
const entitlements = require('../services/entitlements.service');
const { validate } = require('../middleware/validate');
const {
  portalAnimalSchema,
  portalAnimalUpdateSchema,
  portalVaccinationSchema,
  portalVaccinationUpdateSchema,
  portalBreedingSchema,
  portalBreedingUpdateSchema,
  portalBirthSchema,
  portalBirthUpdateSchema,
  portalHerdNoteSchema,
} = require('../validators/schemas');
const { saveFile, createReadStream } = require('../config/storage');
const { diskStorage, readAndCleanupUpload, cleanupUploadFile } = require('../utils/upload-disk');

const router = express.Router();
const upload = multer({
  storage: diskStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|jpg|png|webp)$/i.test(file.mimetype || '');
    if (!ok) return cb(new Error('Image must be JPEG, PNG, or WebP'));
    cb(null, true);
  },
});

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 80,
  message: { success: false, error: { message: 'Too many requests', code: 'RATE_LIMIT' } },
});

const requireHerd = async (req, res, next) => {
  try {
    await entitlements.requireBreederDashboard(req.portalCustomerIds);
    next();
  } catch (err) { next(err); }
};

router.use(requireHerd);

router.get('/dashboard', async (req, res, next) => {
  try {
    const data = await breeder.getDashboard(req.portalCustomerIds);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/species', async (req, res, next) => {
  try {
    const data = await breeder.listSpecies();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/animals', async (req, res, next) => {
  try {
    const data = await breeder.listHerd(req.portalCustomerIds);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/animals', writeLimiter, validate(portalAnimalSchema), async (req, res, next) => {
  try {
    const data = await breeder.createAnimal(req.portalCustomerIds, req.customer.id, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/animals/:id/photo', async (req, res, next) => {
  try {
    const url = await breeder.getImageUrl(req.params.id, req.portalCustomerIds);
    const stream = await createReadStream(url);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    stream.on('error', next);
    stream.pipe(res);
  } catch (err) { next(err); }
});

router.post('/animals/:id/photo', writeLimiter, upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: { message: 'No image provided' } });
    const buffer = await readAndCleanupUpload(req.file);
    const saved = await saveFile(buffer, 'animals', req.file.originalname || 'photo.jpg');
    const data = await breeder.updatePhoto(req.params.id, req.portalCustomerIds, saved.url);
    res.json({ success: true, data });
  } catch (err) {
    await cleanupUploadFile(req.file).catch(() => {});
    next(err);
  }
});

router.get('/animals/:id', async (req, res, next) => {
  try {
    const data = await breeder.getAnimal(req.params.id, req.portalCustomerIds);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.put('/animals/:id', writeLimiter, validate(portalAnimalUpdateSchema), async (req, res, next) => {
  try {
    const data = await breeder.updateAnimal(req.params.id, req.portalCustomerIds, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.delete('/animals/:id', writeLimiter, async (req, res, next) => {
  try {
    const data = await breeder.deactivateAnimal(req.params.id, req.portalCustomerIds);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/animals/:id/vaccinations', async (req, res, next) => {
  try {
    const data = await breeder.listVaccinations(req.params.id, req.portalCustomerIds);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/animals/:id/vaccinations', writeLimiter, validate(portalVaccinationSchema), async (req, res, next) => {
  try {
    const data = await breeder.createVaccination(req.params.id, req.portalCustomerIds, req.customer.id, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.put('/vaccinations/:id', writeLimiter, validate(portalVaccinationUpdateSchema), async (req, res, next) => {
  try {
    const data = await breeder.updateVaccination(req.params.id, req.portalCustomerIds, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.delete('/vaccinations/:id', writeLimiter, async (req, res, next) => {
  try {
    const data = await breeder.removeVaccination(req.params.id, req.portalCustomerIds);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/animals/:id/breeding', async (req, res, next) => {
  try {
    const data = await breeder.listBreeding(req.params.id, req.portalCustomerIds);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/animals/:id/breeding', writeLimiter, validate(portalBreedingSchema), async (req, res, next) => {
  try {
    const data = await breeder.createBreeding(req.params.id, req.portalCustomerIds, req.customer.id, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.put('/breeding/:id', writeLimiter, validate(portalBreedingUpdateSchema), async (req, res, next) => {
  try {
    const data = await breeder.updateBreeding(req.params.id, req.portalCustomerIds, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.delete('/breeding/:id', writeLimiter, async (req, res, next) => {
  try {
    const data = await breeder.removeBreeding(req.params.id, req.portalCustomerIds);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/animals/:id/births', async (req, res, next) => {
  try {
    const data = await breeder.listBirths(req.params.id, req.portalCustomerIds);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/animals/:id/births', writeLimiter, validate(portalBirthSchema), async (req, res, next) => {
  try {
    const data = await breeder.createBirth(req.params.id, req.portalCustomerIds, req.customer.id, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.put('/births/:id', writeLimiter, validate(portalBirthUpdateSchema), async (req, res, next) => {
  try {
    const data = await breeder.updateBirth(req.params.id, req.portalCustomerIds, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.delete('/births/:id', writeLimiter, async (req, res, next) => {
  try {
    const data = await breeder.removeBirth(req.params.id, req.portalCustomerIds);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/animals/:id/notes', writeLimiter, validate(portalHerdNoteSchema), async (req, res, next) => {
  try {
    const data = await breeder.createHerdNote(req.params.id, req.portalCustomerIds, req.customer.id, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.delete('/notes/:id', writeLimiter, async (req, res, next) => {
  try {
    const data = await breeder.removeHerdNote(req.params.id, req.portalCustomerIds);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports = router;
