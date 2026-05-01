/**
 * @file src/application/use-cases/coaching/create-session-initiative.usecase.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

function createCreateSessionInitiativeUseCase({ coachingService, sendNotification, logger }) {
  async function notifyAdminsOfPendingSession(req, session, adminUserIds) {
    const startLabel = new Date(session.StartTime).toLocaleString('pt-PT', {
      timeZone: 'UTC',
      dateStyle: 'short',
      timeStyle: 'short',
    });

    const notificationResults = await Promise.allSettled(
      adminUserIds.map((userId) =>
        sendNotification(req, {
          userId,
          type: 'coaching',
          message: `Nova iniciativa de coaching pendente de aprovação para ${startLabel}. Sessão #${session.SessionID}.`,
        })
      )
    );

    const failedNotifications = notificationResults.filter((result) => result.status === 'rejected');
    if (failedNotifications.length > 0) {
      logger.warn('Failed to notify one or more admins about a teacher coaching initiative', {
        sessionId: session.SessionID,
        attemptedRecipients: adminUserIds.length,
        failedRecipients: failedNotifications.length,
        reasons: failedNotifications.map((result) => String(result.reason?.message || result.reason || 'Unknown')),
      });
    }
  }

  async function execute({ req, teacherUserId, payload }) {
    const session = await coachingService.createSessionInitiative(payload, teacherUserId);
    const adminUserIds = await coachingService.listAdminUserIds();

    await notifyAdminsOfPendingSession(req, session, adminUserIds);

    return { session };
  }

  return { execute };
}

module.exports = { createCreateSessionInitiativeUseCase };

