const logger = require('../utils/logger');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function normalizeOrigin(value) {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '');
}

function getRequestOrigin(req) {
  const originHeader = req.get('origin');

  if (originHeader) {
    return normalizeOrigin(originHeader);
  }

  const refererHeader = req.get('referer');

  if (!refererHeader) {
    return '';
  }

  try {
    return normalizeOrigin(new URL(refererHeader).origin);
  } catch {
    return '';
  }
}

function createCsrfProtection({ allowedOrigins, allowNoOrigin = false }) {
  const allowList = new Set((allowedOrigins || []).map(normalizeOrigin).filter(Boolean));

  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }

    const requestOrigin = getRequestOrigin(req);

    if (requestOrigin && allowList.has(requestOrigin)) {
      next();
      return;
    }

    if (!requestOrigin && allowNoOrigin) {
      next();
      return;
    }

    logger.warn('CSRF validation failed', {
      category: 'security',
      event: 'csrf_validation_failed',
      method: req.method,
      path: req.originalUrl,
      origin: requestOrigin || null,
      referer: req.get('referer') || null,
      ip: req.ip || req.socket?.remoteAddress || 'unknown',
      userAgent: req.get('user-agent') || 'unknown',
    });

    res.status(403).json({
      error: 'Invalid request origin',
    });
  };
}

module.exports = { createCsrfProtection };