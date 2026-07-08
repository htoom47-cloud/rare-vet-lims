const express = require('express');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { PERMISSIONS } = require('../utils/permissions');
const env = require('../config/env');
const {
  SETTINGS_KEY: CRITICAL_FLAGS_KEY,
  loadCriticalFlagsSetting,
  saveCriticalFlagsDisabled,
  isCriticalFlagsDisabled,
} = require('../utils/critical-flags');

const router = express.Router();

router.get('/public', (_req, res) => {
  res.json({
    success: true,
    data: {
      lab_name: env.lab.name,
      lab_name_ar: env.lab.nameAr,
      lab_subtitle: env.lab.subtitle,
      lab_subtitle_ar: env.lab.subtitleAr,
      address: env.lab.address,
      phone: env.lab.phone,
      email: env.lab.email,
      portal_url: env.portalAppUrl,
    },
  });
});

router.use(authenticate);

router.get('/', authorize(PERMISSIONS.SETTINGS_VIEW), async (req, res, next) => {
  try {
    await loadCriticalFlagsSetting();
    const result = await query('SELECT * FROM settings');
    const settings = {};
    result.rows.forEach((row) => { settings[row.key] = row.value; });
    settings[CRITICAL_FLAGS_KEY] = isCriticalFlagsDisabled();
    res.json({ success: true, data: settings });
  } catch (err) { next(err); }
});

router.put('/:key', authorize(PERMISSIONS.SETTINGS_MANAGE), async (req, res, next) => {
  try {
    if (req.params.key === CRITICAL_FLAGS_KEY) {
      const disabled = req.body.value === true || req.body.value === 'true' || req.body.value === 1;
      await saveCriticalFlagsDisabled(disabled, req.user.id);
      return res.json({
        success: true,
        data: { key: CRITICAL_FLAGS_KEY, value: disabled },
      });
    }

    const result = await query(
      `INSERT INTO settings (key, value, updated_by) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()
       RETURNING *`,
      [req.params.key, JSON.stringify(req.body.value), req.user.id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
});

module.exports = router;
