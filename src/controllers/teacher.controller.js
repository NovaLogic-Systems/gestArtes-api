const prisma = require('../config/prisma');
const { getSessionRole } = require('../middlewares/auth.middleware');

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

function getAuthenticatedTeacherUserId(req, res) {
  const userId = Number(req.session?.userId);
  const role = getSessionRole(req.session);

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

async function getAdmissionRequestForTeacher(db, teacherUserId, joinRequestId) {
  const rows = await db.$queryRaw`
    SELECT TOP (1)
      cjr.JoinRequestID AS joinRequestId,
      cjr.SessionID AS sessionId,
      cjr.StudentAccountID AS studentAccountId,
      sa.UserID AS studentUserId,
      CONCAT(u.FirstName, ' ', u.LastName) AS studentName,
      u.Email AS studentEmail,
      sa.GuardianName AS guardianName,
      CONVERT(char(19), cjr.RequestedAt, 126) AS requestedAt,
      CONVERT(char(10), cs.StartTime, 23) AS sessionDate,
      CONVERT(char(5), cs.StartTime, 108) AS sessionStartTime,
      CONVERT(char(5), cs.EndTime, 108) AS sessionEndTime,
      CONCAT('Sessão #', CAST(cs.SessionID AS varchar(20))) AS sessionLabel,
      st.StudioName AS studioName,
      m.ModalityName AS modalityName,
      cjrs.StatusName AS statusName,
      cjr.ReviewedAt AS reviewedAt,
      cjr.ReviewedByUserID AS reviewedByUserId,
      cs.MaxParticipants AS maxParticipants,
      COUNT(DISTINCT sstd.StudentAccountID) AS enrolledCount
    FROM [CoachingJoinRequest] AS cjr
    INNER JOIN [CoachingJoinRequestStatus] AS cjrs ON cjrs.StatusID = cjr.StatusID
    INNER JOIN [StudentAccount] AS sa ON sa.StudentAccountID = cjr.StudentAccountID
    INNER JOIN [User] AS u ON u.UserID = sa.UserID
    INNER JOIN [CoachingSession] AS cs ON cs.SessionID = cjr.SessionID
    INNER JOIN [Studio] AS st ON st.StudioID = cs.StudioID
    INNER JOIN [Modality] AS m ON m.ModalityID = cs.ModalityID
    INNER JOIN [SessionTeacher] AS stt ON stt.SessionID = cjr.SessionID
    LEFT JOIN [SessionStudent] AS sstd ON sstd.SessionID = cjr.SessionID
    WHERE cjr.JoinRequestID = ${joinRequestId}
      AND stt.TeacherID = ${teacherUserId}
    GROUP BY
      cjr.JoinRequestID,
      cjr.SessionID,
      cjr.StudentAccountID,
      sa.UserID,
      u.FirstName,
      u.LastName,
      u.Email,
      sa.GuardianName,
      cjr.RequestedAt,
      cs.StartTime,
      cs.EndTime,
      cs.SessionID,
      st.StudioName,
      m.ModalityName,
      cjrs.StatusName,
      cjr.ReviewedAt,
      cjr.ReviewedByUserID,
      cs.MaxParticipants
  `;

  return rows[0] ? mapAdmissionRequestRow(rows[0]) : null;
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

    const requestRows = await prisma.$queryRaw`
      SELECT
        cjr.JoinRequestID AS joinRequestId,
        cjr.SessionID AS sessionId,
        cjr.StudentAccountID AS studentAccountId,
        sa.UserID AS studentUserId,
        CONCAT(u.FirstName, ' ', u.LastName) AS studentName,
        u.Email AS studentEmail,
        sa.GuardianName AS guardianName,
        CONVERT(char(19), cjr.RequestedAt, 126) AS requestedAt,
        CONVERT(char(10), cs.StartTime, 23) AS sessionDate,
        CONVERT(char(5), cs.StartTime, 108) AS sessionStartTime,
        CONVERT(char(5), cs.EndTime, 108) AS sessionEndTime,
        CONCAT('Sessão #', CAST(cs.SessionID AS varchar(20))) AS sessionLabel,
        st.StudioName AS studioName,
        m.ModalityName AS modalityName,
        cjrs.StatusName AS statusName,
        cjr.ReviewedAt AS reviewedAt,
        cjr.ReviewedByUserID AS reviewedByUserId,
        cs.MaxParticipants AS maxParticipants,
        COUNT(DISTINCT sstd.StudentAccountID) AS enrolledCount
      FROM [CoachingJoinRequest] AS cjr
      INNER JOIN [CoachingJoinRequestStatus] AS cjrs ON cjrs.StatusID = cjr.StatusID
      INNER JOIN [StudentAccount] AS sa ON sa.StudentAccountID = cjr.StudentAccountID
      INNER JOIN [User] AS u ON u.UserID = sa.UserID
      INNER JOIN [CoachingSession] AS cs ON cs.SessionID = cjr.SessionID
      INNER JOIN [Studio] AS st ON st.StudioID = cs.StudioID
      INNER JOIN [Modality] AS m ON m.ModalityID = cs.ModalityID
      INNER JOIN [SessionTeacher] AS stt ON stt.SessionID = cjr.SessionID
      LEFT JOIN [SessionStudent] AS sstd ON sstd.SessionID = cjr.SessionID
      WHERE stt.TeacherID = ${teacherUserId}
        AND cjr.ReviewedAt IS NULL
      GROUP BY
        cjr.JoinRequestID,
        cjr.SessionID,
        cjr.StudentAccountID,
        sa.UserID,
        u.FirstName,
        u.LastName,
        u.Email,
        sa.GuardianName,
        cjr.RequestedAt,
        cs.StartTime,
        cs.EndTime,
        cs.SessionID,
        st.StudioName,
        m.ModalityName,
        cjrs.StatusName,
        cjr.ReviewedAt,
        cjr.ReviewedByUserID,
        cs.MaxParticipants
      ORDER BY cjr.RequestedAt ASC, cjr.JoinRequestID ASC
    `;

    res.json({
      summary: {
        pendingRequests: requestRows.length,
      },
      requests: requestRows.map(mapAdmissionRequestRow),
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

    const [classesTodayRows, pendingConfirmationsRows, admissionRequestsRows, noShowsRows] = await Promise.all([
      prisma.$queryRaw`
        SELECT COUNT(DISTINCT cs.SessionID) AS classesToday
        FROM [SessionTeacher] AS st
        INNER JOIN [CoachingSession] AS cs ON cs.SessionID = st.SessionID
        WHERE st.TeacherID = ${teacherUserId}
          AND CONVERT(date, cs.StartTime) = CONVERT(date, SYSUTCDATETIME())
      `,
      prisma.$queryRaw`
        SELECT COUNT(DISTINCT cs.SessionID) AS pendingConfirmations
        FROM [SessionTeacher] AS st
        INNER JOIN [CoachingSession] AS cs ON cs.SessionID = st.SessionID
        INNER JOIN [SessionStatus] AS ss ON ss.StatusID = cs.StatusID
        WHERE st.TeacherID = ${teacherUserId}
          AND (
            LOWER(ss.StatusName) LIKE '%pend%'
            OR LOWER(ss.StatusName) LIKE '%confirm%'
          )
      `,
      prisma.$queryRaw`
        SELECT COUNT(1) AS admissionRequests
        FROM [CoachingJoinRequest] AS cjr
        INNER JOIN [SessionTeacher] AS st ON st.SessionID = cjr.SessionID
        WHERE st.TeacherID = ${teacherUserId}
          AND cjr.ReviewedAt IS NULL
      `,
      prisma.$queryRaw`
        SELECT COUNT(1) AS noShows
        FROM [SessionStudent] AS sstd
        INNER JOIN [CoachingSession] AS cs ON cs.SessionID = sstd.SessionID
        INNER JOIN [AttendanceStatus] AS ast ON ast.AttendanceStatusID = sstd.AttendanceStatusID
        INNER JOIN [SessionTeacher] AS st ON st.SessionID = cs.SessionID
        WHERE st.TeacherID = ${teacherUserId}
          AND cs.StartTime >= DATEADD(day, -7, SYSUTCDATETIME())
          AND (
            LOWER(ast.StatusName) LIKE '%absent%'
            OR LOWER(ast.StatusName) LIKE '%faltou%'
            OR LOWER(ast.StatusName) LIKE '%missed%'
            OR LOWER(ast.StatusName) LIKE '%no show%'
            OR LOWER(ast.StatusName) LIKE '%no-show%'
          )
      `,
    ]);

    res.json({
      classesToday: toInteger(classesTodayRows[0]?.classesToday),
      pendingConfirmations: toInteger(pendingConfirmationsRows[0]?.pendingConfirmations),
      admissionRequests: toInteger(admissionRequestsRows[0]?.admissionRequests),
      noShows: toInteger(noShowsRows[0]?.noShows),
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

    const scheduleRows = await prisma.$queryRaw`
      SELECT
        cs.SessionID AS sessionId,
        CONVERT(char(10), cs.StartTime, 23) AS sessionDate,
        CONVERT(char(5), cs.StartTime, 108) AS sessionTime,
        st.StudioName AS studioName,
        ss.StatusName AS sessionStatus,
        COUNT(sstd.StudentAccountID) AS studentCount
      FROM [SessionTeacher] AS stc
      INNER JOIN [CoachingSession] AS cs ON cs.SessionID = stc.SessionID
      INNER JOIN [Studio] AS st ON st.StudioID = cs.StudioID
      INNER JOIN [SessionStatus] AS ss ON ss.StatusID = cs.StatusID
      LEFT JOIN [SessionStudent] AS sstd ON sstd.SessionID = cs.SessionID
      WHERE stc.TeacherID = ${teacherUserId}
        AND CONVERT(date, cs.StartTime) = CONVERT(date, SYSUTCDATETIME())
      GROUP BY
        cs.SessionID,
        CONVERT(char(10), cs.StartTime, 23),
        CONVERT(char(5), cs.StartTime, 108),
        st.StudioName,
        ss.StatusName,
        cs.StartTime
      ORDER BY cs.StartTime ASC, cs.SessionID ASC
    `;

    res.json({
      schedule: scheduleRows.map(mapTodayScheduleRow),
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
