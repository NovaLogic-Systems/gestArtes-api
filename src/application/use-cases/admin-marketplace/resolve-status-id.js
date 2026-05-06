/**
 * @file src/application/use-cases/admin-marketplace/resolve-status-id.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const PENDING_STATUS_NAMES = ['pending', 'pendente', 'pending_review', 'pending approval'];
const APPROVED_STATUS_NAMES = ['approved', 'aprovado', 'published', 'publicado', 'active', 'ativo'];
const REJECTED_STATUS_NAMES = ['rejected', 'rejeitado', 'declined', 'recusado'];

async function resolveStatusId(prisma, preferredNames) {
  const statusRows = await prisma.marketplaceItemStatus.findMany({
    select: { StatusID: true, StatusName: true },
  });

  const normalizedPreferredNames = preferredNames.map((name) => String(name || '').trim().toLowerCase());
  const status = statusRows.find((row) => {
    const statusName = String(row.StatusName || '').trim().toLowerCase();
    return normalizedPreferredNames.some((preferred) => statusName.includes(preferred));
  });

  return status?.StatusID || null;
}

module.exports = {
  APPROVED_STATUS_NAMES,
  PENDING_STATUS_NAMES,
  REJECTED_STATUS_NAMES,
  resolveStatusId,
};
