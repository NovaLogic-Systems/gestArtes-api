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

function normalizeRole(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function toAppRole(roleName) {
  const normalized = normalizeRole(roleName);

  if (APP_ROLES.includes(normalized)) {
    return normalized;
  }

  if (
    normalized.includes('admin')
    || normalized.includes('management')
    || normalized.includes('gest')
    || normalized.includes('direction')
    || normalized.includes('direc')
  ) {
    return 'admin';
  }

  if (normalized.includes('teacher') || normalized.includes('prof')) {
    return 'teacher';
  }

  if (normalized.includes('student') || normalized.includes('aluno')) {
    return 'student';
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
  ROLE_PRIORITY,
  getHighestPriorityRole,
  getPrimaryRoleFromUser,
  normalizeRole,
  toAppRole,
};
