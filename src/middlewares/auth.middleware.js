const crypto = require('crypto');

const requireAuth = (req, res, next) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

const requireSessionAuth = requireAuth;

const requireAdminRole = (req, res, next) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const role = String(req.session?.role || '').trim().toLowerCase();

  if (role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  next();
};

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
  requireAuth,
  requireSessionAuth,
  requireAdminRole,
  requireInternalToken,
};