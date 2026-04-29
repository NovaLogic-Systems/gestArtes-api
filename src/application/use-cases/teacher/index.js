const { createSubmitScheduleUseCase } = require('./submit-schedule.usecase');

/**
 * index.js — Fábrica dos use-cases do domínio Teacher
 * Responsabilidades:
 * - Injeção de dependências (ex.: availabilityService)
 * - Exporta os métodos de use-case através do padrão fábrica
 * Padrão: chamado uma única vez no arranque do controlador
 */
function createTeacherUseCases(deps) {
  const depsObj = deps;

  return {
    submitSchedule: createSubmitScheduleUseCase(depsObj),
  };
}

module.exports = { createTeacherUseCases };
