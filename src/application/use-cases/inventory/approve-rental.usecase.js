/**
 * approve-rental.usecase.js — Use-case de aprovação de aluguer
 * Responsabilidades:
 * - Chama `inventoryService.approveRental`
 */

function createApproveRentalUseCase(deps) {
  const { inventoryService } = deps;

  async function execute({ rentalId, payload }) {
    const rental = await inventoryService.approveRental(rentalId, payload);
    return { rental };
  }

  return { execute };
}

module.exports = { createApproveRentalUseCase };
