const { createHttpError } = require('../../../utils/http-error');
const { resolveOrCreateSessionStatus } = require('./resolve-or-create-session-status');

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

      if (!session.SessionStatus.StatusName.toLowerCase().includes('pending')) {
        throw createHttpError(409, 'Session is not in a pending state');
      }

      const statusId = await prisma.$transaction(async (tx) => {
        const approvedStatusId = await resolveOrCreateSessionStatus(tx, 'Approved');

        await tx.coachingSession.update({
          where: { SessionID: sessionId },
          data: {
            StatusID: approvedStatusId,
            ReviewedByUserID: adminUserId,
            ReviewedAt: new Date(),
          },
        });

        return approvedStatusId;
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