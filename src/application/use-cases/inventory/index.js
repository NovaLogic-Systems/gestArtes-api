/**
 * @file src/application/use-cases/inventory/index.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const { createCreateRentalUseCase } = require('./create-rental.usecase');
const { createVerifyReturnUseCase } = require('./verify-return.usecase');

/**
 * index.js — Fábrica dos use-cases do domínio Inventory
 * Responsabilidades:
 * - Liga as dependências (ex.: inventoryService) aos use-cases
 * - Exporta métodos `execute()` para cada use-case através de injeção de dependências
 * Padrão: chamado uma única vez no arranque do servidor
 */
function createInventoryUseCases(dependencies) {
  const deps = dependencies;

  const createRentalUseCase = createCreateRentalUseCase(deps);
  const completeRentalUseCase = createVerifyReturnUseCase(deps);

  return {
    createRental: createRentalUseCase,
    startRental: createRentalUseCase,
    verifyReturn: completeRentalUseCase,
    completeRental: completeRentalUseCase,
  };
}

module.exports = { createInventoryUseCases };

