const express = require('express');
const service = require('../services/dashboard.service');
const { authenticate, authorize } = require('../middleware/auth');
const { PERMISSIONS } = require('../utils/permissions');

const router = express.Router();
router.use(authenticate);

router.get('/stats', authorize(PERMISSIONS.DASHBOARD_VIEW), async (req, res, next) => {
  try {
    const adminMode = req.user.permissions.includes(PERMISSIONS.DASHBOARD_ADMIN)
      || req.user.role_name === 'admin';
    const data = adminMode
      ? await service.getStats()
      : await service.getTechnicianDashboard(req.user.id);
    res.json({ success: true, data: { ...data, mode: adminMode ? 'admin' : 'operations' } });
  } catch (err) { next(err); }
});

/** Detail list for dashboard «data errors» (animal owner ≠ sample customer). */
router.get('/data-errors', authorize(PERMISSIONS.DASHBOARD_VIEW), async (req, res, next) => {
  try {
    const adminMode = req.user.permissions.includes(PERMISSIONS.DASHBOARD_ADMIN)
      || req.user.role_name === 'admin';
    if (!adminMode) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin dashboard required' } });
    }
    const data = await service.listDataErrors(req.query.limit);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports = router;
