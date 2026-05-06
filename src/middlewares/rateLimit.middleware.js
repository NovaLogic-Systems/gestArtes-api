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
const max = parsePositiveInt(process.env.RATE_LIMIT_MAX_REQUESTS, 100);
const loginWindowMs = parsePositiveInt(
  process.env.LOGIN_RATE_LIMIT_WINDOW_MS,
  15 * 60 * 1000
);
const loginMax = parsePositiveInt(process.env.LOGIN_RATE_LIMIT_MAX_REQUESTS, 5);

function getRequestIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];

  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || 'unknown';
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

const apiRateLimiter = rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests, please try again later.',
  },
  handler: buildRateLimitHandler(
    'API rate limit exceeded',
    'api_rate_limit_exceeded'
  ),
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

