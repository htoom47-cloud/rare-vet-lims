const fs = require('fs');
const path = require('path');
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
const portalRoutes = require('./portal.routes');
const publicRoutes = require('./public.routes');
const trashRoutes = require('./trash.routes');

const router = express.Router();

router.use('/public', publicRoutes);

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
router.use('/reference-ranges', require('./reference-ranges.routes'));
router.use('/animal-species', require('./animal-species.routes'));
router.use('/report-mastering', require('./report-mastering.routes'));
router.use('/settings', settingsRoutes);
router.use('/trash', trashRoutes);
router.use('/portal', portalRoutes);

router.get('/health', async (_req, res) => {
  const staffDist = path.join(__dirname, '../../../frontend/dist/index.html');
  const portalDist = path.join(__dirname, '../../../frontend-portal/dist/index.html');

  let database = 'ok';
  try {
    const { pool } = require('../config/database');
    await pool.query('SELECT 1');
  } catch {
    database = 'down';
  }

  const { isS3Storage, ensureUploadDir } = require('../config/storage');
  let storageWritable = false;
  try {
    const uploadPath = ensureUploadDir();
    fs.accessSync(uploadPath, fs.constants.W_OK);
    storageWritable = true;
  } catch {
    storageWritable = false;
  }

  const healthy = database === 'ok';
  res.status(healthy ? 200 : 503).json({
    success: healthy,
    status: healthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    database,
    storage: {
      type: isS3Storage() ? 's3' : 'local',
      writable: storageWritable || isS3Storage(),
    },
    frontend: {
      staff: fs.existsSync(staffDist),
      portal: fs.existsSync(portalDist),
    },
  });
});

module.exports = router;
