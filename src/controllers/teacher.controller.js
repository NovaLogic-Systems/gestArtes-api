const prisma = require('../config/prisma');

function toInteger(value) {
  if (typeof value === 'bigint') {
    return Number(value);
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getAuthenticatedTeacherUserId(req, res) {
  const userId = Number(req.session?.userId);
  const role = String(req.session?.role || '')
    .trim()
    .toLowerCase();

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
        INNER JOIN [CoachingJoinRequestStatus] AS cjrs ON cjrs.StatusID = cjr.StatusID
        INNER JOIN [SessionTeacher] AS st ON st.SessionID = cjr.SessionID
        WHERE st.TeacherID = ${teacherUserId}
          AND LOWER(cjrs.StatusName) LIKE '%pend%'
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
  getDashboard,
  getTodaySchedule,
};
