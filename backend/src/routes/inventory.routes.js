const express = require('express');
const service = require('../services/inventory.service');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { inventorySchema } = require('../validators/schemas');
const { PERMISSIONS } = require('../utils/permissions');

const router = express.Router();
router.use(authenticate);

router.get('/', authorize(PERMISSIONS.INVENTORY_VIEW), async (req, res, next) => {
  try {
    const data = await service.list(req.query);
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
});

router.get('/alerts', authorize(PERMISSIONS.INVENTORY_VIEW), async (req, res, next) => {
  try {
    const data = await service.getAlerts();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/:id', authorize(PERMISSIONS.INVENTORY_VIEW), async (req, res, next) => {
  try {
    const data = await service.getById(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/', authorize(PERMISSIONS.INVENTORY_MANAGE), validate(inventorySchema), async (req, res, next) => {
  try {
    const data = await service.create(req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.put('/:id', authorize(PERMISSIONS.INVENTORY_MANAGE), async (req, res, next) => {
  try {
    const data = await service.update(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/adjust', authorize(PERMISSIONS.INVENTORY_MANAGE), async (req, res, next) => {
  try {
    const data = await service.adjustStock(req.params.id, req.body.type, req.body.quantity, req.user.id, req.body.notes);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports = router;
