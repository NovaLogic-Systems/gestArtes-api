const crypto = require('crypto');

const requireAuth = (req, res, next) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

const requireSessionAuth = requireAuth;

function normalizeRole(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

const requireRoles = (allowedRoles) => {
  const normalizedAllowedRoles = new Set(
    (Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles])
      .map(normalizeRole)
      .filter(Boolean)
  );

  return (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const currentRole = normalizeRole(req.session.role);
    if (!normalizedAllowedRoles.has(currentRole)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    next();
  };
};

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
  requireRoles,
  requireAdminRole,
  requireInternalToken,
};