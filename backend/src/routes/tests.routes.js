const express = require('express');
const service = require('../services/tests.service');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { testSchema, testCategorySchema, packageSchema } = require('../validators/schemas');
const { PERMISSIONS } = require('../utils/permissions');

const router = express.Router();
router.use(authenticate);

router.get('/categories', authorize(PERMISSIONS.TESTS_VIEW), async (req, res, next) => {
  try {
    const data = await service.listCategories({ includeInactive: req.query.all === '1' });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/categories', authorize(PERMISSIONS.TESTS_MANAGE), validate(testCategorySchema), async (req, res, next) => {
  try {
    const data = await service.createCategory(req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.put('/categories/:id', authorize(PERMISSIONS.TESTS_MANAGE), validate(testCategorySchema), async (req, res, next) => {
  try {
    const data = await service.updateCategory(Number(req.params.id), req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.delete('/categories/:id', authorize(PERMISSIONS.TESTS_MANAGE), async (req, res, next) => {
  try {
    const data = await service.deleteCategory(Number(req.params.id));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/packages', authorize(PERMISSIONS.TESTS_VIEW), async (req, res, next) => {
  try {
    const data = await service.listPackages({ includeInactive: req.query.all === '1' });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/packages/:id', authorize(PERMISSIONS.TESTS_VIEW), async (req, res, next) => {
  try {
    const data = await service.getPackageById(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/packages', authorize(PERMISSIONS.TESTS_MANAGE), validate(packageSchema), async (req, res, next) => {
  try {
    const data = await service.createPackage(req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.put('/packages/:id', authorize(PERMISSIONS.TESTS_MANAGE), validate(packageSchema), async (req, res, next) => {
  try {
    const data = await service.updatePackage(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.delete('/packages/:id', authorize(PERMISSIONS.TESTS_MANAGE), async (req, res, next) => {
  try {
    const data = await service.deletePackage(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/', authorize(PERMISSIONS.TESTS_VIEW), async (req, res, next) => {
  try {
    const data = await service.list(req.query);
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
});

router.get('/:id', authorize(PERMISSIONS.TESTS_VIEW), async (req, res, next) => {
  try {
    const data = await service.getById(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/', authorize(PERMISSIONS.TESTS_MANAGE), validate(testSchema), async (req, res, next) => {
  try {
    const data = await service.create(req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.put('/:id', authorize(PERMISSIONS.TESTS_MANAGE), validate(testSchema), async (req, res, next) => {
  try {
    const data = await service.update(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.delete('/:id', authorize(PERMISSIONS.TESTS_MANAGE), async (req, res, next) => {
  try {
    const data = await service.deleteTest(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/parameters', authorize(PERMISSIONS.TESTS_MANAGE), async (req, res, next) => {
  try {
    const data = await service.addParameter(req.params.id, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.put('/parameters/:parameterId', authorize(PERMISSIONS.TESTS_MANAGE), async (req, res, next) => {
  try {
    const data = await service.updateParameter(req.params.parameterId, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.delete('/parameters/:parameterId', authorize(PERMISSIONS.TESTS_MANAGE), async (req, res, next) => {
  try {
    const data = await service.deleteParameter(req.params.parameterId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/parameters/:parameterId/ranges', authorize(PERMISSIONS.TESTS_MANAGE), async (req, res, next) => {
  try {
    const data = await service.addReferenceRange(req.params.parameterId, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports = router;
