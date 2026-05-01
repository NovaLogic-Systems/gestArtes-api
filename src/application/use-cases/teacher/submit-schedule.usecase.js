/**
 * submit-schedule.usecase.js — Use-case para submissão de horários
 * Responsabilidades:
 * - Orquestração: chama `availabilityService.submitAvailability`
 * - Devolve resultado para o controller
 * - Mantém a separation of concerns: serviço faz transações, use-case orquestra,
 *   controller trata IO (notifications, sockets, responses HTTP)
 */

function createSubmitScheduleUseCase(deps) {
  const { availabilityService } = deps;

  async function execute({ teacherUserId, payload }) {
    // Orquestração simples: delega ao serviço de disponibilidade
    const result = await availabilityService.submitAvailability(teacherUserId, payload);
    return result;
  }

  return { execute };
}

module.exports = { createSubmitScheduleUseCase };
