/**
 * @file src/application/use-cases/coaching/create-booking-request.usecase.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

function toPositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function createCreateBookingRequestUseCase({ coachingService, sendNotification, logger }) {
  async function notifyTeacher(req, session, teacherId, startTime) {
    const parsedTeacherId = toPositiveInt(teacherId);
    if (!parsedTeacherId) {
      return;
    }

    try {
      const startLabel = startTime
        ? new Date(startTime).toLocaleString('pt-PT', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' })
        : '';

      await sendNotification(req, {
        userId: parsedTeacherId,
        type: 'coaching',
        message: `Nova solicitação de sessão de coaching para ${startLabel}. Sessão #${session.SessionID}.`,
      });
    } catch (notificationError) {
      logger.warn('Failed to notify teacher about new coaching booking request', {
        sessionId: session.SessionID,
        teacherUserId: parsedTeacherId,
        error: notificationError?.message,
      });
    }
  }

  async function execute({ req, studentUserId, payload }) {
    const { teacherId, studioId, modalityId, startTime, endTime, maxParticipants, notes } = payload;

    const session = await coachingService.createBooking(
      { teacherId, studioId, modalityId, startTime, endTime, maxParticipants, notes },
      studentUserId
    );

    await notifyTeacher(req, session, teacherId, startTime);

    return { session };
  }

  return { execute };
}

module.exports = { createCreateBookingRequestUseCase };

