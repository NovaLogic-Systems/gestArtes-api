const { createGetUpcomingScheduleUseCase } = require('./get-upcoming-schedule.usecase');

/**
 * index.js — Fábrica dos use-cases do domínio Student
 * Responsabilidades:
 * - Injeção de dependências (ex.: prisma)
 * - Exporta os métodos de use-case através do padrão fábrica
 * Padrão: chamado uma única vez no arranque do controlador
 */
function createStudentUseCases(deps) {
  const depsObj = deps;

  return {
    getUpcomingSchedule: createGetUpcomingScheduleUseCase(depsObj),
  };
}

module.exports = { createStudentUseCases };
