const { createCreateSessionInitiativeUseCase } = require('./create-session-initiative.usecase');
const { createCreateBookingRequestUseCase } = require('./create-booking-request.usecase');

function createCoachingUseCases(dependencies) {
  return {
    createSessionInitiative: createCreateSessionInitiativeUseCase(dependencies),
    createBookingRequest: createCreateBookingRequestUseCase(dependencies),
  };
}

module.exports = { createCoachingUseCases };
