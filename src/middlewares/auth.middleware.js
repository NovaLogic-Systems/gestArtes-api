const crypto = require('crypto');
const {
  APP_ROLES,
  getSessionRole,
  requireRole,
  requireRoles,
} = require('./rbac.middleware');

const requireAuth = (req, res, next) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
};

const requireSessionAuth = requireAuth;

const requireAdminRole = requireRole(['admin']);

const secureTokenEquals = (providedToken, configuredToken) => {
  if (String(providedToken || '').length !== String(configuredToken || '').length) {
    return false;
  }

  const configuredHash = crypto.createHash('sha256').update(configuredToken, 'utf8').digest();
  const providedHash = crypto.createHash('sha256').update(providedToken, 'utf8').digest();
  return crypto.timingSafeEqual(configuredHash, providedHash);
};

const requireInternalToken = (req, res, next) => {
  const configuredToken = process.env.INTERNAL_API_TOKEN;
  const providedToken = req.get('x-internal-token');
  if (!configuredToken || !providedToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!secureTokenEquals(providedToken, configuredToken)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
};

module.exports = {
  APP_ROLES,
  getSessionRole,
  requireAuth,
  requireSessionAuth,
  requireRole,
  requireRoles,
  requireAdminRole,
  requireInternalToken,
};
