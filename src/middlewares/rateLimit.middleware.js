/**
 * @file src/middlewares/rateLimit.middleware.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  return fallback;
}

const windowMs = parsePositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
const max = parsePositiveInt(process.env.RATE_LIMIT_MAX_REQUESTS, 2000);
const loginWindowMs = parsePositiveInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
const loginMax = parsePositiveInt(process.env.LOGIN_RATE_LIMIT_MAX_REQUESTS, 150);
const pollingMax = parsePositiveInt(process.env.POLLING_RATE_LIMIT_MAX_REQUESTS, 6000);

function getRequestIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

// Decode JWT without verifying signature — used ONLY for rate-limit key extraction.
// This runs before requireAuth, so we can't verify. We use the unverified userId
// as a bucket key to avoid shared-IP lockouts (school NAT). Auth enforcement is
// still handled by requireAuth separately.
function tryDecodeUserIdFromBearer(req) {
  try {
    const authHeader = req.headers['authorization'];
    if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7);
    const payload = jwt.decode(token);
    const userId = payload?.userId ?? payload?.sub ?? payload?.id;
    return userId ? String(userId) : null;
  } catch {
    return null;
  }
}

// Key by userId (from JWT decode or req.auth), fallback to IP.
// This runs before auth middleware, so we extract userId from the token directly.
function getKeyByUser(req) {
  const authedId = req.auth?.userId || req.user?.userId;
  if (authedId) return `uid:${authedId}`;
  const decodedId = tryDecodeUserIdFromBearer(req);
  if (decodedId) return `uid:${decodedId}`;
  return `ip:${getRequestIp(req)}`;
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

// Global API limiter — keyed per user (decoded from JWT) or IP fallback.
// Default: 2000 requests per 15 min per user (env: RATE_LIMIT_MAX_REQUESTS).
const apiRateLimiter = rateLimit({
  windowMs,
  max,
  keyGenerator: getKeyByUser,
  standardHeaders: true,
  legacyHeaders: false,
  // keyGenerator uses JWT user ID, not req.ip — X-Forwarded-For validation is irrelevant
  validate: { xForwardedForHeader: false },
  skip: (req) => req.path.startsWith('/auth/'),
  message: { error: 'Demasiados pedidos, por favor tente mais tarde.' },
  handler: buildRateLimitHandler('API rate limit exceeded', 'api_rate_limit_exceeded'),
});

// Lenient limiter for high-frequency polling routes (notifications, etc.)
// Higher limit (6000/15min ≈ 400/min) to account for shared NAT IPs in school.
const pollingRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: pollingMax,
  keyGenerator: getKeyByUser,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { error: 'Demasiados pedidos de polling, por favor tente mais tarde.' },
  handler: buildRateLimitHandler('Polling rate limit exceeded', 'polling_rate_limit_exceeded'),
});

const loginLimiter = rateLimit({
  windowMs: loginWindowMs,
  max: loginMax,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
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

