/**
 * verify-return.usecase.js — Use-case de verificação de devolução de aluguer
 * Responsabilidades:
 * - Orquestração fina: chama `inventoryService.verifyRentalReturn`
 * - Devolve resultado ao controller para tratamento de notificações/HTTP
 * - Encapsula a lógica transacional de domínio
 */

function createVerifyReturnUseCase(deps) {
  const { inventoryService } = deps;

  async function execute({ rentalId, payload }) {
    // Orquestração: chama serviço e devolve resultado para o controller
    // O controller é responsável por notificações e resposta HTTP
    const rental = await inventoryService.verifyRentalReturn(rentalId, payload);

    return { rental };
  }

  return { execute };
}

module.exports = { createVerifyReturnUseCase };
