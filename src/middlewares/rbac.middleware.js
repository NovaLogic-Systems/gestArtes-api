const {
  APP_ROLES,
  ROLE_HIERARCHY,
  normalizeRole,
  toAppRole,
} = require('../utils/roles');

const APP_PERMISSIONS = Object.freeze({
  SESSION_ACCESS: 'session:access',
  STUDENT_PORTAL_ACCESS: 'portal:student:access',
  TEACHER_PORTAL_ACCESS: 'portal:teacher:access',
  ADMIN_PORTAL_ACCESS: 'portal:admin:access',
  MARKETPLACE_ACCESS: 'marketplace:access',
  NOTIFICATIONS_ACCESS: 'notifications:access',
  INVENTORY_ACCESS: 'inventory:access',
  JOIN_REQUEST_CREATE: 'join-request:create',
  JOIN_REQUEST_REVIEW_TEACHER: 'join-request:review:teacher',
  JOIN_REQUEST_REVIEW_ADMIN: 'join-request:review:admin',
});

const ROLE_PERMISSIONS = Object.freeze({
  student: Object.freeze([
    APP_PERMISSIONS.SESSION_ACCESS,
    APP_PERMISSIONS.STUDENT_PORTAL_ACCESS,
    APP_PERMISSIONS.MARKETPLACE_ACCESS,
    APP_PERMISSIONS.NOTIFICATIONS_ACCESS,
    APP_PERMISSIONS.INVENTORY_ACCESS,
    APP_PERMISSIONS.JOIN_REQUEST_CREATE,
  ]),
  teacher: Object.freeze([
    APP_PERMISSIONS.SESSION_ACCESS,
    APP_PERMISSIONS.TEACHER_PORTAL_ACCESS,
    APP_PERMISSIONS.MARKETPLACE_ACCESS,
    APP_PERMISSIONS.NOTIFICATIONS_ACCESS,
    APP_PERMISSIONS.INVENTORY_ACCESS,
    APP_PERMISSIONS.JOIN_REQUEST_REVIEW_TEACHER,
  ]),
  admin: Object.freeze([
    APP_PERMISSIONS.SESSION_ACCESS,
    APP_PERMISSIONS.ADMIN_PORTAL_ACCESS,
    APP_PERMISSIONS.MARKETPLACE_ACCESS,
    APP_PERMISSIONS.NOTIFICATIONS_ACCESS,
    APP_PERMISSIONS.JOIN_REQUEST_REVIEW_ADMIN,
  ]),
});

function getSessionRole(session) {
  return toAppRole(session?.user?.role || session?.role) || normalizeRole(session?.user?.role || session?.role);
}

function flattenEntries(entries) {
  return entries.flatMap((entry) => (Array.isArray(entry) ? entry : [entry]));
}

function flattenRoles(roles) {
  return flattenEntries(roles);
}

function normalizePermission(permission) {
  return String(permission || '').trim().toLowerCase();
}

function flattenPermissions(permissions) {
  return flattenEntries(permissions)
    .map(normalizePermission)
    .filter(Boolean);
}

function getRolePermissions(role) {
  const currentRole = toAppRole(role);

  if (!currentRole) {
    return [];
  }

  return ROLE_PERMISSIONS[currentRole] || [];
}

function getSessionPermissions(session) {
  const currentRole = getSessionRole(session);

  if (!currentRole) {
    return [];
  }

  return getRolePermissions(currentRole);
}

function hasSessionPermission(session, permission) {
  const normalizedPermission = normalizePermission(permission);

  if (!normalizedPermission) {
    return false;
  }

  return new Set(getSessionPermissions(session)).has(normalizedPermission);
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

function requirePermission(...permissions) {
  const requiredPermissions = new Set(flattenPermissions(permissions));

  return (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!requiredPermissions.size) {
      return next();
    }

    const sessionPermissions = new Set(getSessionPermissions(req.session));
    const hasPermission = [...requiredPermissions].some((permission) => sessionPermissions.has(permission));

    if (!hasPermission) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    return next();
  };
}

function requireAllPermissions(...permissions) {
  const requiredPermissions = new Set(flattenPermissions(permissions));

  return (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!requiredPermissions.size) {
      return next();
    }

    const sessionPermissions = new Set(getSessionPermissions(req.session));
    const hasAllPermissions = [...requiredPermissions].every((permission) => sessionPermissions.has(permission));

    if (!hasAllPermissions) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    return next();
  };
}

const requireRoles = requireRole;
const requirePermissions = requirePermission;

module.exports = {
  APP_ROLES,
  APP_PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLE_HIERARCHY,
  getRolePermissions,
  getSessionRole,
  getSessionPermissions,
  hasSessionPermission,
  requireRole,
  requireRoles,
  requirePermission,
  requirePermissions,
  requireAllPermissions,
};
