/**
 * @file src/middlewares/auth.middleware.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const crypto = require('crypto');
const { verifyAccessToken } = require('../services/jwt.service');
const {
  getAuthenticatedRole,
  getAuthenticatedRoles,
  getAuthenticatedUserId,
} = require('../utils/auth-context');
const {
  APP_ROLES,
  APP_PERMISSIONS,
  ROLE_PERMISSIONS,
  getRolePermissions,
  getRoleFromActor,
  getPermissionsForActor,
  hasPermissionForActor,
  requireRole,
  requireRoles,
  requirePermission,
  requirePermissions,
  requireAllPermissions,
} = require('./rbac.middleware');

function extractBearerToken(req) {
  const authorization = req.get('authorization') || req.headers?.authorization || '';
  const match = String(authorization || '').match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return null;
  }

  return match[1].trim() || null;
}

function buildRequestAuthContext(req) {
  const preResolvedUserId = getAuthenticatedUserId(req);
  const preResolvedRole = getAuthenticatedRole(req);
  const preResolvedRoles = getAuthenticatedRoles(req);

  if (preResolvedUserId && preResolvedRole) {
    return {
      userId: preResolvedUserId,
      role: preResolvedRole,
      roles: preResolvedRoles,
      tokenType: 'context',
      source: 'context',
    };
  }

  const bearerToken = extractBearerToken(req);

  if (!bearerToken) {
    return null;
  }

  const payload = verifyAccessToken(bearerToken);
  const userId = Number(payload.userId || payload.sub);

  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error('Unauthorized');
  }

  return {
    userId,
    role: getAuthenticatedRole({ auth: payload }),
    roles: getAuthenticatedRoles({ auth: payload }),
    tokenType: 'access',
    source: 'jwt',
    token: bearerToken,
    payload,
  };
}

const requireAuth = (req, res, next) => {
  try {
    const authContext = buildRequestAuthContext(req);

    if (!authContext) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    req.auth = authContext;

    if (!req.user) {
      req.user = {
        userId: authContext.userId,
        role: authContext.role,
        roles: authContext.roles,
      };
    }

    return next();
  } catch (_error) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
};

const requireAdminRole = requirePermission(APP_PERMISSIONS.ADMIN_PORTAL_ACCESS);

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
  APP_PERMISSIONS,
  ROLE_PERMISSIONS,
  getRolePermissions,
  getRoleFromActor,
  getPermissionsForActor,
  hasPermissionForActor,
  requireAuth,
  requireRole,
  requireRoles,
  requirePermission,
  requirePermissions,
  requireAllPermissions,
  requireAdminRole,
  requireInternalToken,
};

