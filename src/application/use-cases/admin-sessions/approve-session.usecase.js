/**
 * @file src/application/use-cases/admin-sessions/approve-session.usecase.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const { createHttpError } = require('../../../utils/http-error');
const {
  isPendingApprovalStatus,
  resolveOrCreateSessionStatus,
} = require('./resolve-or-create-session-status');

function collectNotificationUserIds(session) {
  return [
    ...session.SessionTeacher.map((sessionTeacher) => sessionTeacher.User.UserID),
    ...session.SessionStudent.map((sessionStudent) => sessionStudent.StudentAccount.User.UserID),
  ];
}

function createApproveSessionUseCase({ prisma }) {
  return {
    async execute({ adminUserId, payload }) {
      const sessionId = Number(payload?.sessionId);

      if (!Number.isInteger(sessionId) || sessionId <= 0) {
        throw createHttpError(400, 'Invalid session id');
      }

      if (!Number.isInteger(adminUserId) || adminUserId <= 0) {
        throw createHttpError(401, 'Not authenticated');
      }

      const session = await prisma.coachingSession.findUnique({
        where: { SessionID: sessionId },
        include: {
          SessionStatus: { select: { StatusName: true } },
          SessionTeacher: { include: { User: { select: { UserID: true } } } },
          SessionStudent: {
            include: {
              StudentAccount: { include: { User: { select: { UserID: true } } } },
            },
          },
        },
      });

      if (!session) {
        throw createHttpError(404, 'Session not found');
      }

      if (!isPendingApprovalStatus(session.SessionStatus.StatusName)) {
        throw createHttpError(409, 'Session is not pending management approval');
      }

      const statusId = await prisma.$transaction(async (tx) => {
        const scheduledStatusId = await resolveOrCreateSessionStatus(tx, 'Scheduled');

        await tx.coachingSession.update({
          where: { SessionID: sessionId },
          data: {
            StatusID: scheduledStatusId,
            ReviewedByUserID: adminUserId,
            ReviewedAt: new Date(),
          },
        });

        return scheduledStatusId;
      });

      return {
        sessionId,
        statusId,
        userIdsToNotify: collectNotificationUserIds(session),
      };
    },
  };
}

module.exports = {
  createApproveSessionUseCase,
};
