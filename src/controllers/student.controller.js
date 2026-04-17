const prisma = require('../config/prisma');

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

async function getProfile(req, res, next) {
  try {
    const userId = Number(req.session?.userId);
    const role = String(req.session?.role || '')
      .trim()
      .toLowerCase();

    if (!Number.isInteger(userId) || userId <= 0) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    if (role !== 'student') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

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
      res.status(404).json({ error: 'Student account not found' });
      return;
    }

    const studentAccountId = toInteger(profileRow.studentAccountId);

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

module.exports = {
  getProfile,
};