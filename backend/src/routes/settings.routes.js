const express = require('express');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { PERMISSIONS } = require('../utils/permissions');
const env = require('../config/env');

const router = express.Router();

router.get('/public', (_req, res) => {
  res.json({
    success: true,
    data: {
      lab_name: env.lab.name,
      lab_name_ar: env.lab.nameAr,
      phone: env.lab.phone,
      email: env.lab.email,
    },
  });
});

router.use(authenticate);

router.get('/', authorize(PERMISSIONS.SETTINGS_VIEW), async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM settings');
    const settings = {};
    result.rows.forEach((row) => { settings[row.key] = row.value; });
    res.json({ success: true, data: settings });
  } catch (err) { next(err); }
});

router.put('/:key', authorize(PERMISSIONS.SETTINGS_MANAGE), async (req, res, next) => {
  try {
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
