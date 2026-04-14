const rateLimit = require('express-rate-limit');

const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const max = Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100;
const loginWindowMs = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS) || windowMs;
const loginMax = Number(process.env.LOGIN_RATE_LIMIT_MAX_REQUESTS) || 10;

const apiRateLimiter = rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests, please try again later.',
  },
});

const loginLimiter = rateLimit({
  windowMs: loginWindowMs,
  max: loginMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many login attempts, please try again later.',
  },
});

module.exports = apiRateLimiter;
module.exports.apiRateLimiter = apiRateLimiter;
module.exports.loginLimiter = loginLimiter;
