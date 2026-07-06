const express = require('express');
const service = require('../services/soft-delete.service');
const { authenticate, authorize } = require('../middleware/auth');
const { PERMISSIONS } = require('../utils/permissions');
const { auditLog } = require('../middleware/audit');

const router = express.Router();

router.get('/status', authenticate, (req, res) => {
  res.json({ success: true, data: service.getStatus() });
});

router.use(authenticate);

router.get('/:type', authorize(PERMISSIONS.DATA_TRASH_VIEW), async (req, res, next) => {
  try {
    const data = await service.listTrash(req.params.type, req.query);
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
});

router.post('/:type/:id', authorize(PERMISSIONS.DATA_TRASH_MANAGE), auditLog('soft_delete', 'trash'), async (req, res, next) => {
  try {
    const data = await service.deleteEntity(req.params.type, req.params.id, req.user.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/:type/:id/restore', authorize(PERMISSIONS.DATA_TRASH_MANAGE), auditLog('restore', 'trash'), async (req, res, next) => {
  try {
    const data = await service.restoreEntity(req.params.type, req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports = router;
