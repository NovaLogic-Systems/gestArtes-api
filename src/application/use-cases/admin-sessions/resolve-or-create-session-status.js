/**
 * @file src/application/use-cases/admin-sessions/resolve-or-create-session-status.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

async function resolveOrCreateSessionStatus(tx, statusName) {
  const existing = await tx.sessionStatus.findFirst({
    where: { StatusName: { contains: statusName } },
  });

  if (existing) {
    return existing.StatusID;
  }

  const created = await tx.sessionStatus.create({
    data: { StatusName: statusName },
  });

  return created.StatusID;
}

module.exports = {
  resolveOrCreateSessionStatus,
};
