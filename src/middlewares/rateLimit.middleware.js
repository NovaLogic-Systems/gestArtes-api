const rateLimit = require('express-rate-limit');

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);

  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  return fallback;
}

const windowMs = parsePositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
const max = parsePositiveInt(process.env.RATE_LIMIT_MAX_REQUESTS, 100);
const loginWindowMs = parsePositiveInt(
  process.env.LOGIN_RATE_LIMIT_WINDOW_MS,
  15 * 60 * 1000
);
const loginMax = parsePositiveInt(process.env.LOGIN_RATE_LIMIT_MAX_REQUESTS, 5);

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
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many login attempts, please try again later.',
  },
});

module.exports = apiRateLimiter;
module.exports.apiRateLimiter = apiRateLimiter;
module.exports.loginLimiter = loginLimiter;
