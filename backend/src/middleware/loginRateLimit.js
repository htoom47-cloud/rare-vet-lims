const rateLimit = require('express-rate-limit');

const LOGIN_RATE_LIMIT = {
  windowMs: 15 * 60 * 1000,
  max: 5,
};

const loginRateLimitResponse = (_req, res) => {
  res.status(429).json({
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many login attempts. Please try again in 15 minutes.',
    },
  });
};

/** 5 failed login attempts per 15 minutes per IP + username. */
const loginRateLimit = rateLimit({
  windowMs: LOGIN_RATE_LIMIT.windowMs,
  max: LOGIN_RATE_LIMIT.max,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const username = String(req.body?.username || '').trim().toLowerCase();
    return `${req.ip || 'unknown'}:${username || 'anonymous'}`;
  },
  handler: loginRateLimitResponse,
});

module.exports = { loginRateLimit, LOGIN_RATE_LIMIT, loginRateLimitResponse };
