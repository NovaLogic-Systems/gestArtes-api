/**
 * reject-return.usecase.js — Use-case de rejeição de devolução de aluguer
 * Responsabilidades:
 * - Orquestração fina: chama `inventoryService.rejectRentalReturn`
 * - Devolve resultado ao controller para tratamento de notificações/HTTP
 * - Encapsula a lógica transacional de domínio
 */

function createRejectReturnUseCase(deps) {
  const { inventoryService } = deps;

  async function execute({ rentalId, payload }) {
    const rental = await inventoryService.rejectRentalReturn(rentalId, payload);

    return { rental };
  }

  return { execute };
}

module.exports = { createRejectReturnUseCase };