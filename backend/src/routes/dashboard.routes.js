const express = require('express');
const service = require('../services/dashboard.service');
const { authenticate, authorize } = require('../middleware/auth');
const { PERMISSIONS } = require('../utils/permissions');

const router = express.Router();
router.use(authenticate);

router.get('/stats', authorize(PERMISSIONS.DASHBOARD_VIEW), async (req, res, next) => {
  try {
    const data = req.user.role_name === 'admin' || req.user.role_name === 'manager'
      ? await service.getStats()
      : await service.getTechnicianDashboard(req.user.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports = router;
