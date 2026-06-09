const express = require('express');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { PERMISSIONS } = require('../utils/permissions');
const { paginate, buildPagination } = require('../utils/helpers');

const router = express.Router();
router.use(authenticate);

router.get('/', authorize(PERMISSIONS.AUDIT_VIEW), async (req, res, next) => {
  try {
    const { offset, page, limit } = paginate(req.query.page, req.query.limit);
    const params = [];
    let where = 'WHERE 1=1';

    if (req.query.module) { params.push(req.query.module); where += ` AND a.module = $${params.length}`; }
    if (req.query.user_id) { params.push(req.query.user_id); where += ` AND a.user_id = $${params.length}`; }

    const countResult = await query(`SELECT COUNT(*) FROM audit_logs a ${where}`, params);
    const total = parseInt(countResult.rows[0].count, 10);

    params.push(limit, offset);
    const result = await query(
      `SELECT a.*, u.full_name as user_name FROM audit_logs a
       LEFT JOIN users u ON a.user_id = u.id
       ${where} ORDER BY a.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ success: true, data: result.rows, pagination: buildPagination(total, page, limit) });
  } catch (err) { next(err); }
});

module.exports = router;
