const { toAppRole } = require('./roles');

function normalizeRoles(value) {
  return (Array.isArray(value) ? value : [value])
    .map(toAppRole)
    .filter(Boolean);
}

function getAuthenticatedUserId(req) {
  const candidate = (
    req?.auth?.userId ??
    req?.user?.userId ??
    req?.auth?.sub ??
    req?.user?.sub ??
    null
  );

  const parsed = Number(candidate);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function getAuthenticatedRole(req) {
  return (
    normalizeRoles(req?.auth?.roles)[0] ||
    toAppRole(req?.auth?.role) ||
    normalizeRoles(req?.user?.roles)[0] ||
    toAppRole(req?.user?.role) ||
    null
  );
}

function getAuthenticatedRoles(req) {
  const authRoles = normalizeRoles(req?.auth?.roles);
  if (authRoles.length > 0) {
    return authRoles;
  }

  const userRoles = normalizeRoles(req?.user?.roles);
  if (userRoles.length > 0) {
    return userRoles;
  }

  const role = getAuthenticatedRole(req);
  return role ? [role] : [];
}

function getAuthenticatedUser(req) {
  return req?.auth?.user || req?.user || null;
}

module.exports = {
  getAuthenticatedUserId,
  getAuthenticatedRole,
  getAuthenticatedRoles,
  getAuthenticatedUser,
};
