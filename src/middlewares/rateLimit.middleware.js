/**
 * @file src/middlewares/rateLimit.middleware.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);

  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  return fallback;
}

const windowMs = parsePositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
const max = parsePositiveInt(process.env.RATE_LIMIT_MAX_REQUESTS, 5000000);
const loginWindowMs = parsePositiveInt(
  process.env.LOGIN_RATE_LIMIT_WINDOW_MS,
  15 * 60 * 1000
);
const loginMax = parsePositiveInt(process.env.LOGIN_RATE_LIMIT_MAX_REQUESTS, 150);

function getRequestIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];

  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || 'unknown';
}

// Key by userId when authenticated, fallback to IP — avoids shared-IP lockouts in dev
function getKeyByUser(req) {
  const userId = req.auth?.userId || req.user?.userId;
  if (userId) return `uid:${userId}`;
  return getRequestIp(req);
}

function buildRateLimitHandler(message, event) {
  return (req, res, _next, options) => {
    logger.warn(message, {
      category: 'security',
      event,
      ip: getRequestIp(req),
      path: req.originalUrl,
      method: req.method,
      userAgent: req.get('user-agent') || 'unknown',
      email: String(req.body?.email || '').trim().toLowerCase() || null,
      retryAfter: Number(options?.windowMs) || null,
    });

    res.status(options.statusCode).json(options.message);
  };
}

// Global API limiter — applied after auth routes, keyed per user
const apiRateLimiter = rateLimit({
  windowMs,
  max,
  keyGenerator: getKeyByUser,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Never block auth routes — blocking /auth/refresh causes forced logout
    return req.path.startsWith('/auth/');
  },
  message: { error: 'Demasiados pedidos, por favor tente mais tarde.' },
  handler: buildRateLimitHandler('API rate limit exceeded', 'api_rate_limit_exceeded'),
});

// Lenient limiter for high-frequency polling routes (notifications, etc.)
const pollingRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  keyGenerator: getKeyByUser,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados pedidos de polling, por favor tente mais tarde.' },
  handler: buildRateLimitHandler('Polling rate limit exceeded', 'polling_rate_limit_exceeded'),
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
  handler: buildRateLimitHandler(
    'Login rate limit exceeded',
    'auth_login_rate_limit_exceeded'
  ),
});

module.exports = apiRateLimiter;
module.exports.apiRateLimiter = apiRateLimiter;
module.exports.loginLimiter = loginLimiter;
module.exports.pollingRateLimiter = pollingRateLimiter;

