/**
 * @file src/application/use-cases/coaching/index.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const { createCreateSessionInitiativeUseCase } = require('./create-session-initiative.usecase');
const { createCreateBookingRequestUseCase } = require('./create-booking-request.usecase');

function createCoachingUseCases(dependencies) {
  return {
    createSessionInitiative: createCreateSessionInitiativeUseCase(dependencies),
    createBookingRequest: createCreateBookingRequestUseCase(dependencies),
  };
}

module.exports = { createCoachingUseCases };

