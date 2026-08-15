const express = require('express');
const service = require('../services/suppliers.service');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { supplierSchema, supplierQuickSchema } = require('../validators/schemas');
const { PERMISSIONS } = require('../utils/permissions');

const router = express.Router();
router.use(authenticate);

router.get('/search', authorize(PERMISSIONS.SUPPLIERS_VIEW), async (req, res, next) => {
  try {
    const data = await service.searchQuick(req.query);
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
});

router.get('/cash-unregistered', authorize(PERMISSIONS.SUPPLIERS_VIEW), async (req, res, next) => {
  try {
    const data = await service.getCashUnregistered();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/quick', authorize(PERMISSIONS.PURCHASES_CREATE), validate(supplierQuickSchema), async (req, res, next) => {
  try {
    const data = await service.createQuick(req.body, req.user.id, req);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/', authorize(PERMISSIONS.SUPPLIERS_VIEW), async (req, res, next) => {
  try {
    const data = await service.list(req.query);
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
});

router.get('/:id', authorize(PERMISSIONS.SUPPLIERS_VIEW), async (req, res, next) => {
  try {
    const data = await service.getById(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/', authorize(PERMISSIONS.SUPPLIERS_MANAGE), validate(supplierSchema), async (req, res, next) => {
  try {
    const data = await service.create(req.body, req.user.id, req);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.put('/:id', authorize(PERMISSIONS.SUPPLIERS_MANAGE), validate(supplierSchema), async (req, res, next) => {
  try {
    const data = await service.update(req.params.id, req.body, req.user.id, req);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.delete('/:id', authorize(PERMISSIONS.SUPPLIERS_MANAGE), async (req, res, next) => {
  try {
    const data = await service.softDelete(req.params.id, req.user.id, req);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports = router;
