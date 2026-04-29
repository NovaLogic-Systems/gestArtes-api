const { createHttpError } = require('../../../utils/http-error');
const { resolveOrCreateSessionStatus } = require('./resolve-or-create-session-status');

function collectNotificationUserIds(session) {
  return [
    ...session.SessionTeacher.map((sessionTeacher) => sessionTeacher.User.UserID),
    ...session.SessionStudent.map((sessionStudent) => sessionStudent.StudentAccount.User.UserID),
  ];
}

function createRejectSessionUseCase({ prisma }) {
  return {
    async execute({ adminUserId, payload }) {
      const sessionId = Number(payload?.sessionId);
      const reviewNotes = String(payload?.reviewNotes || '').trim();

      if (!Number.isInteger(sessionId) || sessionId <= 0) {
        throw createHttpError(400, 'Invalid session id');
      }

      if (!Number.isInteger(adminUserId) || adminUserId <= 0) {
        throw createHttpError(401, 'Not authenticated');
      }

      if (!reviewNotes) {
        throw createHttpError(400, 'Reason is required when rejecting a session');
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

      await prisma.$transaction(async (tx) => {
        const statusId = await resolveOrCreateSessionStatus(tx, 'Rejected');

        await tx.coachingSession.update({
          where: { SessionID: sessionId },
          data: {
            StatusID: statusId,
            ReviewedByUserID: adminUserId,
            ReviewedAt: new Date(),
            ReviewNotes: reviewNotes.slice(0, 255),
          },
        });
      });

      return {
        sessionId,
        userIdsToNotify: collectNotificationUserIds(session),
        reviewNotes,
      };
    },
  };
}

module.exports = {
  createRejectSessionUseCase,
};