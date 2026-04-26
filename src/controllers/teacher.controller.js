const prisma = require('../config/prisma');

const DEFAULT_NOTIFICATION_TYPE_ID = 1;
const TEACHER_APPROVED_STATUS = 'TEACHER_APPROVED';
const TEACHER_REJECTED_STATUS = 'TEACHER_REJECTED';

function toInteger(value) {
  if (typeof value === 'bigint') {
    return Number(value);
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeString(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function getAuthenticatedTeacherUserId(req, res) {
  const userId = Number(req.session?.userId);
  const role = normalizeString(req.session?.role);

  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }

  if (role !== 'teacher') {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }

  return userId;
}

function mapTodayScheduleRow(row) {
  return {
    sessionId: toInteger(row.sessionId),
    date: row.sessionDate,
    time: row.sessionTime,
    studio: row.studioName,
    status: row.sessionStatus,
    studentCount: toInteger(row.studentCount),
  };
}

function mapAdmissionRequestRow(row) {
  return {
    joinRequestId: toInteger(row.joinRequestId),
    sessionId: toInteger(row.sessionId),
    studentAccountId: toInteger(row.studentAccountId),
    studentUserId: toInteger(row.studentUserId),
    studentName: row.studentName,
    studentEmail: row.studentEmail,
    guardianName: row.guardianName,
    sessionLabel: row.sessionLabel,
    requestedAt: row.requestedAt,
    sessionDate: row.sessionDate,
    sessionStartTime: row.sessionStartTime,
    sessionEndTime: row.sessionEndTime,
    studioName: row.studioName,
    modalityName: row.modalityName,
    statusName: row.statusName,
    reviewedAt: row.reviewedAt,
    reviewedByUserId: row.reviewedByUserId == null ? null : toInteger(row.reviewedByUserId),
    maxParticipants: row.maxParticipants == null ? null : toInteger(row.maxParticipants),
    enrolledCount: toInteger(row.enrolledCount),
  };
}

function normalizeDecision(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();

  if (!normalized) {
    return null;
  }

  if (['approve', 'approved', 'aprove', 'aprovado'].includes(normalized)) {
    return 'approve';
  }

  if (['reject', 'rejected', 'rejeitar', 'rejeitado'].includes(normalized)) {
    return 'reject';
  }

  return null;
}

function buildNotificationTitle(message) {
  const trimmed = String(message || '').trim();

  if (!trimmed) {
    return 'Nova notificacao';
  }

  return trimmed.length > 50 ? `${trimmed.slice(0, 50)}...` : trimmed;
}

function truncateNotificationMessage(message) {
  const trimmed = String(message || '').trim();

  if (trimmed.length <= 255) {
    return trimmed;
  }

  return `${trimmed.slice(0, 252)}...`;
}

function toUTCDateString(date) {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().slice(0, 10);
}

function toUTCTimeString(date) {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().slice(11, 16);
}

function toISODateTimeString(date) {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().slice(0, 19);
}

async function getAdmissionRequestForTeacher(db, teacherUserId, joinRequestId) {
  const jr = await db.coachingJoinRequest.findFirst({
    where: {
      JoinRequestID: joinRequestId,
      CoachingSession: {
        SessionTeacher: { some: { TeacherID: teacherUserId } },
      },
    },
    include: {
      CoachingJoinRequestStatus: { select: { StatusName: true } },
      StudentAccount: {
        include: {
          User: { select: { UserID: true, FirstName: true, LastName: true, Email: true } },
        },
      },
      CoachingSession: {
        include: {
          Studio: { select: { StudioName: true } },
          Modality: { select: { ModalityName: true } },
          _count: { select: { SessionStudent: true } },
        },
      },
    },
  });

  if (!jr) return null;

  return mapAdmissionRequestRow({
    joinRequestId: jr.JoinRequestID,
    sessionId: jr.SessionID,
    studentAccountId: jr.StudentAccountID,
    studentUserId: jr.StudentAccount.User.UserID,
    studentName: `${jr.StudentAccount.User.FirstName} ${jr.StudentAccount.User.LastName}`,
    studentEmail: jr.StudentAccount.User.Email,
    guardianName: jr.StudentAccount.GuardianName,
    sessionLabel: `Sessão #${jr.CoachingSession.SessionID}`,
    requestedAt: toISODateTimeString(jr.RequestedAt),
    sessionDate: toUTCDateString(jr.CoachingSession.StartTime),
    sessionStartTime: toUTCTimeString(jr.CoachingSession.StartTime),
    sessionEndTime: toUTCTimeString(jr.CoachingSession.EndTime),
    studioName: jr.CoachingSession.Studio.StudioName,
    modalityName: jr.CoachingSession.Modality.ModalityName,
    statusName: jr.CoachingJoinRequestStatus.StatusName,
    reviewedAt: jr.ReviewedAt,
    reviewedByUserId: jr.ReviewedByUserID,
    maxParticipants: jr.CoachingSession.MaxParticipants,
    enrolledCount: jr.CoachingSession._count.SessionStudent,
  });
}

async function ensureJoinRequestStatus(db, statusName) {
  const existingStatus = await db.coachingJoinRequestStatus.findFirst({
    where: {
      StatusName: statusName,
    },
  });

  if (existingStatus) {
    return existingStatus;
  }

  return db.coachingJoinRequestStatus.create({
    data: {
      StatusName: statusName,
    },
  });
}

function buildDecisionNotificationMessage(request, decision, observations) {
  const requestLabel = `${request.sessionLabel} · ${request.modalityName} · ${request.studioName} · ${request.sessionDate} ${request.sessionStartTime}`;
  const trimmedObservations = String(observations || '').trim();

  if (decision === 'approve') {
    return truncateNotificationMessage(
      `O teu pedido para ${requestLabel} foi aprovado pelo professor e segue para validação final.${trimmedObservations ? ` Observações: ${trimmedObservations}` : ''}`,
    );
  }

  return truncateNotificationMessage(
    `O teu pedido para ${requestLabel} foi rejeitado pelo professor.${trimmedObservations ? ` Observações: ${trimmedObservations}` : ''}`,
  );
}

async function createDecisionNotification(db, request, decision, observations) {
  const message = buildDecisionNotificationMessage(request, decision, observations);

  return db.notification.create({
    data: {
      UserID: request.studentUserId,
      Message: message,
      TypeID: DEFAULT_NOTIFICATION_TYPE_ID,
      IsRead: false,
      CreatedAt: new Date(),
      Title: buildNotificationTitle(message),
      SessionID: request.sessionId,
    },
  });
}

async function getPendingAdmissions(req, res, next) {
  try {
    const teacherUserId = getAuthenticatedTeacherUserId(req, res);

    if (!teacherUserId) {
      return;
    }

    const joinRequests = await prisma.coachingJoinRequest.findMany({
      where: {
        ReviewedAt: null,
        CoachingSession: {
          SessionTeacher: { some: { TeacherID: teacherUserId } },
        },
      },
      include: {
        CoachingJoinRequestStatus: { select: { StatusName: true } },
        StudentAccount: {
          include: {
            User: { select: { UserID: true, FirstName: true, LastName: true, Email: true } },
          },
        },
        CoachingSession: {
          include: {
            Studio: { select: { StudioName: true } },
            Modality: { select: { ModalityName: true } },
            _count: { select: { SessionStudent: true } },
          },
        },
      },
      orderBy: [{ RequestedAt: 'asc' }, { JoinRequestID: 'asc' }],
    });

    const requests = joinRequests.map((jr) =>
      mapAdmissionRequestRow({
        joinRequestId: jr.JoinRequestID,
        sessionId: jr.SessionID,
        studentAccountId: jr.StudentAccountID,
        studentUserId: jr.StudentAccount.User.UserID,
        studentName: `${jr.StudentAccount.User.FirstName} ${jr.StudentAccount.User.LastName}`,
        studentEmail: jr.StudentAccount.User.Email,
        guardianName: jr.StudentAccount.GuardianName,
        sessionLabel: `Sessão #${jr.CoachingSession.SessionID}`,
        requestedAt: toISODateTimeString(jr.RequestedAt),
        sessionDate: toUTCDateString(jr.CoachingSession.StartTime),
        sessionStartTime: toUTCTimeString(jr.CoachingSession.StartTime),
        sessionEndTime: toUTCTimeString(jr.CoachingSession.EndTime),
        studioName: jr.CoachingSession.Studio.StudioName,
        modalityName: jr.CoachingSession.Modality.ModalityName,
        statusName: jr.CoachingJoinRequestStatus.StatusName,
        reviewedAt: jr.ReviewedAt,
        reviewedByUserId: jr.ReviewedByUserID,
        maxParticipants: jr.CoachingSession.MaxParticipants,
        enrolledCount: jr.CoachingSession._count.SessionStudent,
      }),
    );

    res.json({
      summary: {
        pendingRequests: requests.length,
      },
      requests,
    });
  } catch (error) {
    next(error);
  }
}

async function applyAdmissionDecision(req, res, next, forcedDecision = null) {
  try {
    const teacherUserId = getAuthenticatedTeacherUserId(req, res);

    if (!teacherUserId) {
      return;
    }

    const joinRequestId = Number(req.params?.joinRequestId);

    if (!Number.isInteger(joinRequestId) || joinRequestId <= 0) {
      res.status(400).json({ error: 'Invalid joinRequestId' });
      return;
    }

    const decision = forcedDecision || normalizeDecision(req.body?.decision);

    if (!decision) {
      res.status(400).json({ error: 'Invalid decision' });
      return;
    }

    const observations = String(req.body?.observations || '').trim();

    if (decision === 'reject' && !observations) {
      res.status(400).json({ error: 'Observations are required when rejecting a request' });
      return;
    }

    const request = await getAdmissionRequestForTeacher(prisma, teacherUserId, joinRequestId);

    if (!request) {
      res.status(404).json({ error: 'Join request not found' });
      return;
    }

    if (request.reviewedAt || request.reviewedByUserId != null) {
      res.status(409).json({ error: 'Join request has already been reviewed' });
      return;
    }

    if (decision === 'approve' && request.maxParticipants != null && request.enrolledCount >= request.maxParticipants) {
      res.status(409).json({ error: 'Session is already full' });
      return;
    }

    const result = await prisma.$transaction(async (transaction) => {
      const statusName = decision === 'approve'
        ? TEACHER_APPROVED_STATUS
        : TEACHER_REJECTED_STATUS;

      const status = await ensureJoinRequestStatus(transaction, statusName);

      await transaction.coachingJoinRequest.update({
        where: {
          JoinRequestID: joinRequestId,
        },
        data: {
          StatusID: status.StatusID,
          ReviewedByUserID: teacherUserId,
          ReviewedAt: new Date(),
        },
      });

      await createDecisionNotification(transaction, request, decision, observations);

      return {
        statusName: status.StatusName,
        reviewedAt: new Date().toISOString(),
      };
    });

    res.json({
      request: {
        ...request,
        statusName: result.statusName,
        reviewedAt: result.reviewedAt,
        reviewedByUserId: teacherUserId,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getAdmissionRequests(req, res, next) {
  return getPendingAdmissions(req, res, next);
}

async function reviewAdmissionRequest(req, res, next) {
  return applyAdmissionDecision(req, res, next);
}

async function approveJoinRequest(req, res, next) {
  return applyAdmissionDecision(req, res, next, 'approve');
}

async function rejectJoinRequest(req, res, next) {
  return applyAdmissionDecision(req, res, next, 'reject');
}

async function getDashboard(req, res, next) {
  try {
    const teacherUserId = getAuthenticatedTeacherUserId(req, res);

    if (!teacherUserId) {
      return;
    }

    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startOfTomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [classesToday, pendingConfirmations, admissionRequests, noShows] = await Promise.all([
      prisma.sessionTeacher.count({
        where: {
          TeacherID: teacherUserId,
          CoachingSession: {
            StartTime: { gte: startOfToday, lt: startOfTomorrow },
          },
        },
      }),
      prisma.sessionTeacher.count({
        where: {
          TeacherID: teacherUserId,
          CoachingSession: {
            SessionStatus: {
              OR: [
                { StatusName: { contains: 'pend' } },
                { StatusName: { contains: 'confirm' } },
              ],
            },
          },
        },
      }),
      prisma.coachingJoinRequest.count({
        where: {
          ReviewedAt: null,
          CoachingSession: {
            SessionTeacher: { some: { TeacherID: teacherUserId } },
          },
        },
      }),
      prisma.sessionStudent.count({
        where: {
          CoachingSession: {
            StartTime: { gte: sevenDaysAgo },
            SessionTeacher: { some: { TeacherID: teacherUserId } },
          },
          AttendanceStatus: {
            OR: [
              { StatusName: { contains: 'absent' } },
              { StatusName: { contains: 'faltou' } },
              { StatusName: { contains: 'missed' } },
              { StatusName: { contains: 'no show' } },
              { StatusName: { contains: 'no-show' } },
            ],
          },
        },
      }),
    ]);

    res.json({
      classesToday,
      pendingConfirmations,
      admissionRequests,
      noShows,
    });
  } catch (error) {
    next(error);
  }
}

async function getTodaySchedule(req, res, next) {
  try {
    const teacherUserId = getAuthenticatedTeacherUserId(req, res);

    if (!teacherUserId) {
      return;
    }

    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startOfTomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));

    const sessionTeachers = await prisma.sessionTeacher.findMany({
      where: {
        TeacherID: teacherUserId,
        CoachingSession: {
          StartTime: { gte: startOfToday, lt: startOfTomorrow },
        },
      },
      include: {
        CoachingSession: {
          include: {
            Studio: { select: { StudioName: true } },
            SessionStatus: { select: { StatusName: true } },
            _count: { select: { SessionStudent: true } },
          },
        },
      },
      orderBy: [{ CoachingSession: { StartTime: 'asc' } }, { SessionID: 'asc' }],
    });

    res.json({
      schedule: sessionTeachers.map((st) =>
        mapTodayScheduleRow({
          sessionId: st.CoachingSession.SessionID,
          sessionDate: toUTCDateString(st.CoachingSession.StartTime),
          sessionTime: toUTCTimeString(st.CoachingSession.StartTime),
          studioName: st.CoachingSession.Studio.StudioName,
          sessionStatus: st.CoachingSession.SessionStatus.StatusName,
          studentCount: st.CoachingSession._count.SessionStudent,
        }),
      ),
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  approveJoinRequest,
  getAdmissionRequests,
  getPendingAdmissions,
  getDashboard,
  getTodaySchedule,
  rejectJoinRequest,
  reviewAdmissionRequest,
};
