const express = require('express');
const authRoutes = require('./auth.routes');
const customersRoutes = require('./customers.routes');
const animalsRoutes = require('./animals.routes');
const samplesRoutes = require('./samples.routes');
const testsRoutes = require('./tests.routes');
const resultsRoutes = require('./results.routes');
const reportsRoutes = require('./reports.routes');
const billingRoutes = require('./billing.routes');
const inventoryRoutes = require('./inventory.routes');
const qualityRoutes = require('./quality.routes');
const dashboardRoutes = require('./dashboard.routes');
const usersRoutes = require('./users.routes');
const auditRoutes = require('./audit.routes');
const notificationsRoutes = require('./notifications.routes');
const devicesRoutes = require('./devices.routes');
const settingsRoutes = require('./settings.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/customers', customersRoutes);
router.use('/animals', animalsRoutes);
router.use('/samples', samplesRoutes);
router.use('/tests', testsRoutes);
router.use('/results', resultsRoutes);
router.use('/reports', reportsRoutes);
router.use('/billing', billingRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/quality', qualityRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/users', usersRoutes);
router.use('/audit', auditRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/devices', devicesRoutes);
router.use('/settings', settingsRoutes);

router.get('/health', (_req, res) => {
  res.json({ success: true, status: 'healthy', timestamp: new Date().toISOString() });
});

module.exports = router;
