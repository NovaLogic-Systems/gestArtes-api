/**
 * @file src/application/use-cases/admin-sessions/resolve-or-create-session-status.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

function normalizeSessionStatusName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const PENDING_APPROVAL_STATUS_KEYS = new Set([
  'pendingapproval',
  'pending',
]);

function isPendingApprovalStatus(statusName) {
  return PENDING_APPROVAL_STATUS_KEYS.has(normalizeSessionStatusName(statusName));
}

async function findSessionStatusByName(tx, statusName) {
  const expected = normalizeSessionStatusName(statusName);
  const statuses = await tx.sessionStatus.findMany({
    select: { StatusID: true, StatusName: true },
  });

  return statuses.find((status) => normalizeSessionStatusName(status.StatusName) === expected) || null;
}

async function resolveOrCreateSessionStatus(tx, statusName) {
  const existing = await findSessionStatusByName(tx, statusName);

  if (existing) {
    return existing.StatusID;
  }

  const created = await tx.sessionStatus.create({
    data: { StatusName: statusName },
  });

  return created.StatusID;
}

module.exports = {
  isPendingApprovalStatus,
  normalizeSessionStatusName,
  resolveOrCreateSessionStatus,
};
