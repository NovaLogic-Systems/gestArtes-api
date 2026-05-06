/**
 * @file src/application/use-cases/inventory/create-rental.usecase.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const logger = require('../../../utils/logger');

/**
 * create-rental.usecase.js
 *
 * Inventory rental checkout orchestration: student/teacher creates rental request.
 * This orchestrates: validate item + payment → check stock → create transaction.
 *
 * Orchestration (side effects):
 * - inventoryService.createRental() validates and creates rental in Serializable transaction
 * - Row locks enforce stock concurrency (UPDLOCK, HOLDLOCK, ROWLOCK SQL hints)
 * - No notification delivery; purely transactional
 *
 * @param {Object} deps - Dependency injection object
 * @param {Object} deps.inventoryService - Service with createRental method
 * @returns {Object} Usecase object with execute method
 */
function createCreateRentalUseCase({ inventoryService }) {
  return {
    async execute({ req, renterId, payload }) {
      // Business logic: validate + checkout (all transactional in service)
      const result = await inventoryService.createRental(payload, renterId);

      logger.info('[Inventory] Rental created', {
        rentalId: result.rental?.rentalId,
        inventoryItemId: payload?.inventoryItemId,
        renterId,
        startDate: payload?.startDate,
        endDate: payload?.endDate,
      });

      return {
        rental: result.rental,
        checkoutSummary: result.checkoutSummary,
      };
    },
  };
}

module.exports = { createCreateRentalUseCase };

