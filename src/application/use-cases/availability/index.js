const { createSubmitTeacherAvailabilityUseCase } = require('./submit-teacher-availability.usecase');
const { createAdminReviewAvailabilityUseCase } = require('./admin-review-availability.usecase');

/**
 * index.js — Fábrica dos use-cases de Availability
 *
 * Liga as dependências e exporta um objeto único com todos os use-cases.
 * É chamada uma única vez no arranque do servidor, durante a inicialização
 * do controlador.
 *
 * @param {Object} dependencies - Objeto de injeção de dependências com availabilityService
 * @returns {Object} Objeto com as chaves: submitAvailability, reviewAvailability
 */
function createAvailabilityUseCases(dependencies) {
  const deps = dependencies;

  return {
    submitAvailability: createSubmitTeacherAvailabilityUseCase(deps),
    reviewAvailability: createAdminReviewAvailabilityUseCase(deps),
  };
}

module.exports = { createAvailabilityUseCases };
