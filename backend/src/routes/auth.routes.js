const express = require('express');
const authService = require('../services/auth.service');
const { validate } = require('../middleware/validate');
const { loginSchema } = require('../validators/schemas');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: User login
 *     tags: [Authentication]
 */
router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const data = await authService.login(req.body.email, req.body.password);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const data = await authService.refreshAccessToken(req.body.refreshToken);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/logout', async (req, res, next) => {
  try {
    await authService.logout(req.body.refreshToken);
    res.json({ success: true, message: 'Logged out' });
  } catch (err) { next(err); }
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const data = await authService.requestPasswordReset(req.body.email);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const data = await authService.resetPassword(req.body.token, req.body.password);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/me', authenticate, async (req, res) => {
  res.json({ success: true, data: req.user });
});

module.exports = router;
