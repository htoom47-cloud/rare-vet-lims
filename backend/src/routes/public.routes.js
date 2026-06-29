const express = require('express');
const env = require('../config/env');
const { listPublicCatalog } = require('../services/public-catalog.service');

const router = express.Router();

router.get('/catalog', async (_req, res, next) => {
  try {
    const data = await listPublicCatalog();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get('/lab', (_req, res) => {
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

module.exports = router;
