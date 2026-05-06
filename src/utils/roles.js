/**
 * @file src/utils/roles.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const APP_ROLES = Object.freeze(['student', 'teacher', 'admin']);
const ROLE_PRIORITY = Object.freeze(['admin', 'teacher', 'student']);
const ROLE_HIERARCHY = Object.freeze({
  student: 1,
  teacher: 2,
  admin: 3,
});
const ROLE_LABELS = Object.freeze({
  student: 'Aluno',
  teacher: 'Professor',
  admin: 'Direção',
});
const ROLE_EQUIVALENCE_HINTS = Object.freeze({
  admin: Object.freeze([
    'admin',
    'management',
    'gest',
    'direction',
    'direc',
    'coordin',
  ]),
  teacher: Object.freeze([
    'teacher',
    'prof',
  ]),
  student: Object.freeze([
    'student',
    'aluno',
  ]),
});

function normalizeRole(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function matchesRoleHint(normalizedRole, hints) {
  return hints.some((hint) => normalizedRole === hint || normalizedRole.includes(hint));
}

function toAppRole(roleName) {
  const normalized = normalizeRole(roleName);

  if (!normalized) {
    return null;
  }

  if (APP_ROLES.includes(normalized)) {
    return normalized;
  }

  for (const appRole of ROLE_PRIORITY) {
    if (matchesRoleHint(normalized, ROLE_EQUIVALENCE_HINTS[appRole] || [])) {
      return appRole;
    }
  }

  return null;
}

function getHighestPriorityRole(roles) {
  const normalizedRoles = (Array.isArray(roles) ? roles : [roles])
    .map(toAppRole)
    .filter(Boolean);

  for (const candidate of ROLE_PRIORITY) {
    if (normalizedRoles.includes(candidate)) {
      return candidate;
    }
  }

  return 'student';
}

function getPrimaryRoleFromUser(user) {
  return getHighestPriorityRole(
    (user?.UserRole || []).map((entry) => entry?.Role?.RoleName)
  );
}

module.exports = {
  APP_ROLES,
  ROLE_HIERARCHY,
  ROLE_LABELS,
  ROLE_EQUIVALENCE_HINTS,
  ROLE_PRIORITY,
  getHighestPriorityRole,
  getPrimaryRoleFromUser,
  normalizeRole,
  toAppRole,
};

