const prisma = require('../config/prisma');
const { getSessionRole } = require('../middlewares/auth.middleware');

const ATTENDED_STATUS_KEYWORDS = [
  'attended',
  'present',
  'presente',
  'compareceu',
  'assistiu',
];
const NOT_ATTENDED_STATUS_KEYWORDS = [
  'absent',
  'faltou',
  'missed',
  'cancel',
  'nao compareceu',
  'no show',
];

function toInteger(value) {
  if (typeof value === 'bigint') {
    return Number(value);
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeStatusName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isAttendedStatus(statusName) {
  const normalized = normalizeStatusName(statusName);

  if (!normalized) {
    return false;
  }

  if (NOT_ATTENDED_STATUS_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return false;
  }

  return ATTENDED_STATUS_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function toStudentCode(studentAccountId) {
  return `ST-${String(studentAccountId).padStart(4, '0')}`;
}

function getAuthenticatedStudentUserId(req, res) {
  const userId = Number(req.session?.userId);
  const role = getSessionRole(req.session);

  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }

  if (role !== 'student') {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }

  return userId;
}

async function loadStudentProfile(userId) {
  const profileRows = await prisma.$queryRaw`
    SELECT
      u.UserID AS userId,
      u.AuthUID AS authUid,
      u.FirstName AS firstName,
      u.LastName AS lastName,
      u.Email AS email,
      u.PhoneNumber AS phoneNumber,
      u.Photo AS photoUrl,
      u.CreatedAt AS accountCreatedAt,
      u.UpdatedAt AS accountUpdatedAt,
      sa.StudentAccountID AS studentAccountId,
      sa.BirthDate AS birthDate,
      sa.GuardianName AS guardianName,
      sa.GuardianPhone AS guardianPhone
    FROM [User] AS u
    INNER JOIN [StudentAccount] AS sa ON sa.UserID = u.UserID
    WHERE u.UserID = ${userId}
      AND u.IsActive = 1
      AND u.DeletedAt IS NULL
  `;

  const profileRow = profileRows[0];

  if (!profileRow) {
    return null;
  }

  return {
    profileRow,
    studentAccountId: toInteger(profileRow.studentAccountId),
  };
}

function mapNotificationRow(row) {
  return {
    id: toInteger(row.notificationId),
    title: row.title,
    message: row.message,
    read: Boolean(row.isRead),
    createdAt: row.createdAt,
  };
}

function mapScheduleRow(row) {
  return {
    sessionId: toInteger(row.sessionId),
    date: row.sessionDate,
    time: row.sessionTime,
    teacher: row.teacherName,
    studio: row.studioName,
    status: row.sessionStatus,
  };
}

async function listUpcomingSchedule(studentAccountId, limit = 5) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 5;

  const scheduleRows = await prisma.$queryRaw`
    SELECT TOP (${safeLimit})
      cs.SessionID AS sessionId,
      CONVERT(char(10), cs.StartTime, 23) AS sessionDate,
      CONVERT(char(5), cs.StartTime, 108) AS sessionTime,
      COALESCE(teacher.teacherName, 'Por atribuir') AS teacherName,
      st.StudioName AS studioName,
      sst.StatusName AS sessionStatus
    FROM [SessionStudent] AS ss
    INNER JOIN [CoachingSession] AS cs ON cs.SessionID = ss.SessionID
    INNER JOIN [Studio] AS st ON st.StudioID = cs.StudioID
    INNER JOIN [SessionStatus] AS sst ON sst.StatusID = cs.StatusID
    OUTER APPLY (
      SELECT TOP (1)
        CONCAT(u.FirstName, ' ', u.LastName) AS teacherName
      FROM [SessionTeacher] AS stt
      INNER JOIN [User] AS u ON u.UserID = stt.TeacherID
      WHERE stt.SessionID = cs.SessionID
      ORDER BY stt.AssignmentRoleID ASC, stt.TeacherID ASC
    ) AS teacher
    WHERE ss.StudentAccountID = ${studentAccountId}
      AND cs.StartTime >= SYSUTCDATETIME()
    ORDER BY cs.StartTime ASC, cs.SessionID ASC
  `;

  return scheduleRows.map(mapScheduleRow);
}

async function getProfile(req, res, next) {
  try {
    const userId = getAuthenticatedStudentUserId(req, res);

    if (!userId) {
      return;
    }

    const student = await loadStudentProfile(userId);

    if (!student) {
      res.status(404).json({ error: 'Student account not found' });
      return;
    }

    const { profileRow, studentAccountId } = student;

    const [
      sessionStatsRows,
      attendanceRows,
      nextSessionsRows,
      modalityRows,
      totalJoinRequests,
      totalInventoryRentals,
      totalMarketplacePurchases,
    ] = await Promise.all([
      prisma.$queryRaw`
        SELECT
          COUNT(1) AS totalSessionsEnrolled,
          SUM(CASE WHEN cs.StartTime >= SYSUTCDATETIME() THEN 1 ELSE 0 END) AS upcomingSessions,
          SUM(CASE WHEN cs.EndTime < SYSUTCDATETIME() THEN 1 ELSE 0 END) AS completedSessions
        FROM [SessionStudent] AS ss
        INNER JOIN [CoachingSession] AS cs ON cs.SessionID = ss.SessionID
        WHERE ss.StudentAccountID = ${studentAccountId}
      `,
      prisma.$queryRaw`
        SELECT
          ast.StatusName AS statusName,
          COUNT(1) AS total
        FROM [SessionStudent] AS ss
        INNER JOIN [AttendanceStatus] AS ast ON ast.AttendanceStatusID = ss.AttendanceStatusID
        WHERE ss.StudentAccountID = ${studentAccountId}
        GROUP BY ast.StatusName
        ORDER BY ast.StatusName ASC
      `,
      prisma.$queryRaw`
        SELECT TOP (5)
          cs.SessionID AS sessionId,
          cs.StartTime AS startTime,
          cs.EndTime AS endTime,
          m.ModalityName AS modalityName,
          st.StudioName AS studioName,
          sst.StatusName AS sessionStatus
        FROM [SessionStudent] AS ss
        INNER JOIN [CoachingSession] AS cs ON cs.SessionID = ss.SessionID
        INNER JOIN [Modality] AS m ON m.ModalityID = cs.ModalityID
        INNER JOIN [Studio] AS st ON st.StudioID = cs.StudioID
        INNER JOIN [SessionStatus] AS sst ON sst.StatusID = cs.StatusID
        WHERE ss.StudentAccountID = ${studentAccountId}
          AND cs.StartTime >= SYSUTCDATETIME()
        ORDER BY cs.StartTime ASC
      `,
      prisma.$queryRaw`
        SELECT
          m.ModalityName AS modalityName,
          COUNT(1) AS sessions
        FROM [SessionStudent] AS ss
        INNER JOIN [CoachingSession] AS cs ON cs.SessionID = ss.SessionID
        INNER JOIN [Modality] AS m ON m.ModalityID = cs.ModalityID
        WHERE ss.StudentAccountID = ${studentAccountId}
        GROUP BY m.ModalityName
        ORDER BY COUNT(1) DESC, m.ModalityName ASC
      `,
      prisma.coachingJoinRequest.count({
        where: {
          StudentAccountID: studentAccountId,
        },
      }),
      prisma.inventoryTransaction.count({
        where: {
          RenterID: userId,
        },
      }),
      prisma.marketplaceTransaction.count({
        where: {
          BuyerID: userId,
        },
      }),
    ]);

    const sessionStats = sessionStatsRows[0] || {};

    const attendanceByStatus = attendanceRows.map((row) => ({
      statusName: row.statusName,
      total: toInteger(row.total),
    }));

    const totalSessionsAttended = attendanceByStatus.reduce((acc, item) => {
      if (!isAttendedStatus(item.statusName)) {
        return acc;
      }

      return acc + item.total;
    }, 0);

    const modalityDistribution = modalityRows.map((row) => ({
      modalityName: row.modalityName,
      sessions: toInteger(row.sessions),
    }));

    const nextSessions = nextSessionsRows.map((row) => ({
      sessionId: toInteger(row.sessionId),
      startTime: row.startTime,
      endTime: row.endTime,
      modalityName: row.modalityName,
      studioName: row.studioName,
      status: row.sessionStatus,
    }));

    res.json({
      profile: {
        userId: toInteger(profileRow.userId),
        authUid: profileRow.authUid,
        studentAccountId,
        studentCode: toStudentCode(studentAccountId),
        firstName: profileRow.firstName,
        lastName: profileRow.lastName,
        email: profileRow.email,
        phoneNumber: profileRow.phoneNumber,
        photoUrl: profileRow.photoUrl,
        birthDate: profileRow.birthDate,
        guardianName: profileRow.guardianName,
        guardianPhone: profileRow.guardianPhone,
        accountCreatedAt: profileRow.accountCreatedAt,
        accountUpdatedAt: profileRow.accountUpdatedAt,
      },
      trainingPlan: {
        name: modalityDistribution[0]?.modalityName || null,
        modalityDistribution,
        nextSessions,
      },
      statistics: {
        totalSessionsEnrolled: toInteger(sessionStats.totalSessionsEnrolled),
        totalSessionsAttended,
        upcomingSessions: toInteger(sessionStats.upcomingSessions),
        completedSessions: toInteger(sessionStats.completedSessions),
        totalJoinRequests,
        totalInventoryRentals,
        totalMarketplacePurchases,
        attendanceByStatus,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getDashboard(req, res, next) {
  try {
    const userId = getAuthenticatedStudentUserId(req, res);

    if (!userId) {
      return;
    }

    const student = await loadStudentProfile(userId);

    if (!student) {
      res.status(404).json({ error: 'Student account not found' });
      return;
    }

    const { studentAccountId } = student;

    const [upcomingSessionsRows, pendingValidationsRows, reviewRequestsRows, externalPaymentsRows, notificationsRows, schedule] =
      await Promise.all([
        prisma.$queryRaw`
          SELECT COUNT(1) AS upcomingSessions
          FROM [SessionStudent] AS ss
          INNER JOIN [CoachingSession] AS cs ON cs.SessionID = ss.SessionID
          WHERE ss.StudentAccountID = ${studentAccountId}
            AND cs.StartTime >= SYSUTCDATETIME()
        `,
        prisma.$queryRaw`
          SELECT COUNT(DISTINCT sv.SessionID) AS pendingValidations
          FROM [SessionValidation] AS sv
          INNER JOIN [ValidationStep] AS vs ON vs.StepID = sv.ValidationStepID
          INNER JOIN [SessionStudent] AS ss ON ss.SessionID = sv.SessionID
          WHERE ss.StudentAccountID = ${studentAccountId}
            AND (
              LOWER(vs.StepName) LIKE '%pending%'
              OR LOWER(vs.StepName) LIKE '%finalization%'
            )
        `,
        prisma.$queryRaw`
          SELECT COUNT(1) AS reviewRequests
          FROM [CoachingJoinRequest] AS cjr
          INNER JOIN [CoachingJoinRequestStatus] AS cjrs ON cjrs.StatusID = cjr.StatusID
          WHERE cjr.StudentAccountID = ${studentAccountId}
            AND LOWER(cjrs.StatusName) LIKE '%pend%'
        `,
        prisma.$queryRaw`
          SELECT COUNT(DISTINCT cs.SessionID) AS externalPayments
          FROM [CoachingSession] AS cs
          INNER JOIN [SessionStudent] AS ss ON ss.SessionID = cs.SessionID
          INNER JOIN [SessionStatus] AS sst ON sst.StatusID = cs.StatusID
          WHERE ss.StudentAccountID = ${studentAccountId}
            AND cs.IsExternal = 1
            AND cs.StartTime >= SYSUTCDATETIME()
            AND (
              LOWER(sst.StatusName) NOT LIKE '%completed%'
              AND LOWER(sst.StatusName) NOT LIKE '%cancelled%'
            )
        `,
        prisma.$queryRaw`
          SELECT TOP (5)
            n.NotificationID AS notificationId,
            n.Title AS title,
            n.Message AS message,
            n.IsRead AS isRead,
            n.CreatedAt AS createdAt
          FROM [Notification] AS n
          WHERE n.UserID = ${userId}
          ORDER BY n.CreatedAt DESC, n.NotificationID DESC
        `,
        listUpcomingSchedule(studentAccountId, 5),
      ]);

    res.json({
      upcomingSessions: toInteger(upcomingSessionsRows[0]?.upcomingSessions),
      pendingValidations: toInteger(pendingValidationsRows[0]?.pendingValidations),
      reviewRequests: toInteger(reviewRequestsRows[0]?.reviewRequests),
      externalPaymentsInProgress: toInteger(externalPaymentsRows[0]?.externalPayments),
      notifications: notificationsRows.map(mapNotificationRow),
      schedule,
    });
  } catch (error) {
    next(error);
  }
}

async function getUpcomingSchedule(req, res, next) {
  try {
    const userId = getAuthenticatedStudentUserId(req, res);

    if (!userId) {
      return;
    }

    const student = await loadStudentProfile(userId);

    if (!student) {
      res.status(404).json({ error: 'Student account not found' });
      return;
    }

    const schedule = await listUpcomingSchedule(student.studentAccountId, 5);
    res.json({ schedule });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getProfile,
  getDashboard,
  getUpcomingSchedule,
};
