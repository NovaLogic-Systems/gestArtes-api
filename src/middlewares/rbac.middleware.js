const {
  APP_ROLES,
  ROLE_HIERARCHY,
  normalizeRole,
  toAppRole,
} = require('../utils/roles');

function getSessionRole(session) {
  return toAppRole(session?.user?.role || session?.role) || normalizeRole(session?.user?.role);
}

function flattenRoles(roles) {
  return roles.flatMap((entry) => (Array.isArray(entry) ? entry : [entry]));
}

function requireRole(...roles) {
  const allowedRoles = new Set(
    flattenRoles(roles)
      .map(toAppRole)
      .filter(Boolean)
  );

  return (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const currentRole = getSessionRole(req.session);
    if (!currentRole || !allowedRoles.has(currentRole)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    next();
  };
}

const requireRoles = requireRole;

module.exports = {
  APP_ROLES,
  ROLE_HIERARCHY,
  getSessionRole,
  requireRole,
  requireRoles,
};
