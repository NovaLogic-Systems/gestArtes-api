const crypto = require('crypto');

const APP_ROLES = Object.freeze(['student', 'teacher', 'admin']);

const requireAuth = (req, res, next) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
};

const requireSessionAuth = requireAuth;

function normalizeRole(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function getSessionRole(session) {
  return normalizeRole(session?.user?.role);
}

const requireRole = (rolesArray) => {
  const normalizedAllowedRoles = new Set(
    (Array.isArray(rolesArray) ? rolesArray : [rolesArray])
      .map(normalizeRole)
      .filter(Boolean)
  );

  return (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const currentRole = getSessionRole(req.session);
    if (!currentRole || !normalizedAllowedRoles.has(currentRole)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    next();
  };
};

const requireRoles = requireRole;

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
