const prisma = require('../config/prisma');

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeStatusName(statusName) {
  return String(statusName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

async function getStatusIdByKey(db, key) {
  const statuses = await db.coachingJoinRequestStatus.findMany({
    select: {
      StatusID: true,
      StatusName: true,
    },
  });

  const statusMap = new Map(
    statuses.map((status) => [normalizeStatusName(status.StatusName), status.StatusID])
  );

  const statusId = statusMap.get(normalizeStatusName(key));
  if (!statusId) {
    throw createHttpError(500, `Join request status '${key}' is not configured`);
  }

  return statusId;
}

async function getDefaultAttendanceStatusId(db) {
  const preferredStatuses = ['pending', 'scheduled', 'notmarked', 'unmarked'];

  const attendanceStatuses = await db.attendanceStatus.findMany({
    select: {
      AttendanceStatusID: true,
      StatusName: true,
    },
    orderBy: {
      AttendanceStatusID: 'asc',
    },
  });

  for (const preferred of preferredStatuses) {
    const found = attendanceStatuses.find(
      (status) => normalizeStatusName(status.StatusName) === preferred
    );

    if (found) {
      return found.AttendanceStatusID;
    }
  }

  const fallback = attendanceStatuses[0];
  if (!fallback) {
    throw createHttpError(500, 'No attendance status configured');
  }

  return fallback.AttendanceStatusID;
}

async function assertSessionHasCapacity(db, session) {
  if (!session) {
    throw createHttpError(404, 'Session not found');
  }

  if (!Number.isInteger(session.MaxParticipants) || session.MaxParticipants <= 0) {
    return;
  }

  const enrolledCount = await db.sessionStudent.count({
    where: {
      SessionID: session.SessionID,
    },
  });

  if (enrolledCount >= session.MaxParticipants) {
    throw createHttpError(409, 'Session has no available spots');
  }
}

async function getStudentAccountIdByUserId(db, userId) {
  const student = await db.studentAccount.findUnique({
    where: {
      UserID: userId,
    },
    select: {
      StudentAccountID: true,
    },
  });

  if (!student) {
    throw createHttpError(404, 'Student account not found');
  }

  return student.StudentAccountID;
}

async function getTeacherUserIdsBySessionId(db, sessionId) {
  const teacherRows = await db.sessionTeacher.findMany({
    where: {
      SessionID: sessionId,
    },
    select: {
      TeacherID: true,
    },
  });

  return teacherRows.map((row) => row.TeacherID);
}

async function getAdminUserIds(db) {
  const adminRows = await db.userRole.findMany({
    where: {
      Role: {
        RoleName: 'admin',
      },
      User: {
        IsActive: true,
        DeletedAt: null,
      },
    },
    select: {
      UserID: true,
    },
  });

  return adminRows.map((row) => row.UserID);
}

function mapJoinRequest(record) {
  return {
    joinRequestId: record.JoinRequestID,
    sessionId: record.SessionID,
    studentAccountId: record.StudentAccountID,
    requestedAt: record.RequestedAt,
    reviewedAt: record.ReviewedAt,
    reviewedByUserId: record.ReviewedByUserID,
    status: record.CoachingJoinRequestStatus?.StatusName || null,
    student: record.StudentAccount
      ? {
        userId: record.StudentAccount.User?.UserID || null,
        firstName: record.StudentAccount.User?.FirstName || null,
        lastName: record.StudentAccount.User?.LastName || null,
        email: record.StudentAccount.User?.Email || null,
      }
      : null,
  };
}

async function createJoinRequest({ sessionId, requesterUserId }) {
  return prisma.$transaction(async (db) => {
    const studentAccountId = await getStudentAccountIdByUserId(db, requesterUserId);

    const session = await db.coachingSession.findUnique({
      where: {
        SessionID: sessionId,
      },
      select: {
        SessionID: true,
        MaxParticipants: true,
      },
    });

    await assertSessionHasCapacity(db, session);

    const alreadyEnrolled = await db.sessionStudent.findUnique({
      where: {
        SessionID_StudentAccountID: {
          SessionID: sessionId,
          StudentAccountID: studentAccountId,
        },
      },
      select: {
        SessionID: true,
      },
    });

    if (alreadyEnrolled) {
      throw createHttpError(409, 'Student is already enrolled in this session');
    }

    const pendingTeacherStatusId = await getStatusIdByKey(db, 'PendingTeacher');
    const pendingAdminStatusId = await getStatusIdByKey(db, 'PendingAdmin');

    const existingOpenRequest = await db.coachingJoinRequest.findFirst({
      where: {
        SessionID: sessionId,
        StudentAccountID: studentAccountId,
        StatusID: {
          in: [pendingTeacherStatusId, pendingAdminStatusId],
        },
      },
      select: {
        JoinRequestID: true,
      },
    });

    if (existingOpenRequest) {
      throw createHttpError(409, 'There is already a pending join request for this session');
    }

    const created = await db.coachingJoinRequest.create({
      data: {
        SessionID: sessionId,
        StudentAccountID: studentAccountId,
        RequestedAt: new Date(),
        StatusID: pendingTeacherStatusId,
      },
      include: {
        CoachingJoinRequestStatus: true,
        StudentAccount: {
          include: {
            User: true,
          },
        },
      },
    });

    const teacherUserIds = await getTeacherUserIdsBySessionId(db, sessionId);

    return {
      joinRequest: mapJoinRequest(created),
      teacherUserIds,
    };
  });
}

async function listJoinRequestsBySession({ sessionId, requesterUserId, requesterRole }) {
  const role = String(requesterRole || '').trim().toLowerCase();

  if (role === 'teacher') {
    const teacherOwnsSession = await prisma.sessionTeacher.findFirst({
      where: {
        SessionID: sessionId,
        TeacherID: requesterUserId,
      },
      select: {
        SessionID: true,
      },
    });

    if (!teacherOwnsSession) {
      throw createHttpError(403, 'Forbidden');
    }
  }

  const requests = await prisma.coachingJoinRequest.findMany({
    where: {
      SessionID: sessionId,
    },
    include: {
      CoachingJoinRequestStatus: true,
      StudentAccount: {
        include: {
          User: true,
        },
      },
    },
    orderBy: {
      RequestedAt: 'desc',
    },
  });

  return requests.map(mapJoinRequest);
}

async function listTeacherPendingRequests({ teacherUserId }) {
  const pendingTeacherStatusId = await getStatusIdByKey(prisma, 'PendingTeacher');

  const requests = await prisma.coachingJoinRequest.findMany({
    where: {
      StatusID: pendingTeacherStatusId,
      CoachingSession: {
        SessionTeacher: {
          some: {
            TeacherID: teacherUserId,
          },
        },
      },
    },
    include: {
      CoachingJoinRequestStatus: true,
      StudentAccount: {
        include: {
          User: true,
        },
      },
    },
    orderBy: {
      RequestedAt: 'asc',
    },
  });

  return requests.map(mapJoinRequest);
}

async function teacherApprove({ joinRequestId, teacherUserId }) {
  return prisma.$transaction(async (db) => {
    const pendingTeacherStatusId = await getStatusIdByKey(db, 'PendingTeacher');
    const pendingAdminStatusId = await getStatusIdByKey(db, 'PendingAdmin');

    const request = await db.coachingJoinRequest.findUnique({
      where: {
        JoinRequestID: joinRequestId,
      },
      include: {
        CoachingSession: {
          select: {
            SessionID: true,
            MaxParticipants: true,
          },
        },
        CoachingJoinRequestStatus: true,
        StudentAccount: {
          include: {
            User: true,
          },
        },
      },
    });

    if (!request) {
      throw createHttpError(404, 'Join request not found');
    }

    if (request.StatusID !== pendingTeacherStatusId) {
      throw createHttpError(409, 'Join request is not pending teacher approval');
    }

    const teacherOwnsSession = await db.sessionTeacher.findFirst({
      where: {
        SessionID: request.SessionID,
        TeacherID: teacherUserId,
      },
      select: {
        SessionID: true,
      },
    });

    if (!teacherOwnsSession) {
      throw createHttpError(403, 'Forbidden');
    }

    await assertSessionHasCapacity(db, request.CoachingSession);

    const updated = await db.coachingJoinRequest.update({
      where: {
        JoinRequestID: joinRequestId,
      },
      data: {
        StatusID: pendingAdminStatusId,
        ReviewedByUserID: teacherUserId,
        ReviewedAt: new Date(),
      },
      include: {
        CoachingJoinRequestStatus: true,
        StudentAccount: {
          include: {
            User: true,
          },
        },
      },
    });

    const adminUserIds = await getAdminUserIds(db);

    return {
      joinRequest: mapJoinRequest(updated),
      adminUserIds,
    };
  });
}

async function teacherReject({ joinRequestId, teacherUserId }) {
  return prisma.$transaction(async (db) => {
    const pendingTeacherStatusId = await getStatusIdByKey(db, 'PendingTeacher');
    const rejectedStatusId = await getStatusIdByKey(db, 'Rejected');

    const request = await db.coachingJoinRequest.findUnique({
      where: {
        JoinRequestID: joinRequestId,
      },
      include: {
        StudentAccount: {
          include: {
            User: true,
          },
        },
      },
    });

    if (!request) {
      throw createHttpError(404, 'Join request not found');
    }

    if (request.StatusID !== pendingTeacherStatusId) {
      throw createHttpError(409, 'Join request is not pending teacher approval');
    }

    const teacherOwnsSession = await db.sessionTeacher.findFirst({
      where: {
        SessionID: request.SessionID,
        TeacherID: teacherUserId,
      },
      select: {
        SessionID: true,
      },
    });

    if (!teacherOwnsSession) {
      throw createHttpError(403, 'Forbidden');
    }

    const updated = await db.coachingJoinRequest.update({
      where: {
        JoinRequestID: joinRequestId,
      },
      data: {
        StatusID: rejectedStatusId,
        ReviewedByUserID: teacherUserId,
        ReviewedAt: new Date(),
      },
      include: {
        CoachingJoinRequestStatus: true,
        StudentAccount: {
          include: {
            User: true,
          },
        },
      },
    });

    return {
      joinRequest: mapJoinRequest(updated),
      studentUserId: updated.StudentAccount?.UserID || null,
    };
  });
}

async function listAdminPendingRequests() {
  const pendingAdminStatusId = await getStatusIdByKey(prisma, 'PendingAdmin');

  const requests = await prisma.coachingJoinRequest.findMany({
    where: {
      StatusID: pendingAdminStatusId,
    },
    include: {
      CoachingJoinRequestStatus: true,
      StudentAccount: {
        include: {
          User: true,
        },
      },
    },
    orderBy: {
      RequestedAt: 'asc',
    },
  });

  return requests.map(mapJoinRequest);
}

async function adminApprove({ joinRequestId, adminUserId }) {
  return prisma.$transaction(async (db) => {
    const pendingAdminStatusId = await getStatusIdByKey(db, 'PendingAdmin');
    const approvedStatusId = await getStatusIdByKey(db, 'Approved');

    const request = await db.coachingJoinRequest.findUnique({
      where: {
        JoinRequestID: joinRequestId,
      },
      include: {
        CoachingSession: {
          select: {
            SessionID: true,
            MaxParticipants: true,
          },
        },
        StudentAccount: {
          include: {
            User: true,
          },
        },
      },
    });

    if (!request) {
      throw createHttpError(404, 'Join request not found');
    }

    if (request.StatusID !== pendingAdminStatusId) {
      throw createHttpError(409, 'Join request is not pending admin approval');
    }

    await assertSessionHasCapacity(db, request.CoachingSession);

    const alreadyEnrolled = await db.sessionStudent.findUnique({
      where: {
        SessionID_StudentAccountID: {
          SessionID: request.SessionID,
          StudentAccountID: request.StudentAccountID,
        },
      },
      select: {
        SessionID: true,
      },
    });

    if (alreadyEnrolled) {
      throw createHttpError(409, 'Student is already enrolled in this session');
    }

    const attendanceStatusId = await getDefaultAttendanceStatusId(db);

    await db.sessionStudent.create({
      data: {
        SessionID: request.SessionID,
        StudentAccountID: request.StudentAccountID,
        EnrolledAt: new Date(),
        AttendanceStatusID: attendanceStatusId,
      },
    });

    const updated = await db.coachingJoinRequest.update({
      where: {
        JoinRequestID: joinRequestId,
      },
      data: {
        StatusID: approvedStatusId,
        ReviewedByUserID: adminUserId,
        ReviewedAt: new Date(),
      },
      include: {
        CoachingJoinRequestStatus: true,
        StudentAccount: {
          include: {
            User: true,
          },
        },
      },
    });

    return {
      joinRequest: mapJoinRequest(updated),
      studentUserId: updated.StudentAccount?.UserID || null,
    };
  });
}

async function adminReject({ joinRequestId, adminUserId }) {
  return prisma.$transaction(async (db) => {
    const pendingAdminStatusId = await getStatusIdByKey(db, 'PendingAdmin');
    const rejectedStatusId = await getStatusIdByKey(db, 'Rejected');

    const request = await db.coachingJoinRequest.findUnique({
      where: {
        JoinRequestID: joinRequestId,
      },
      include: {
        StudentAccount: {
          include: {
            User: true,
          },
        },
      },
    });

    if (!request) {
      throw createHttpError(404, 'Join request not found');
    }

    if (request.StatusID !== pendingAdminStatusId) {
      throw createHttpError(409, 'Join request is not pending admin approval');
    }

    const updated = await db.coachingJoinRequest.update({
      where: {
        JoinRequestID: joinRequestId,
      },
      data: {
        StatusID: rejectedStatusId,
        ReviewedByUserID: adminUserId,
        ReviewedAt: new Date(),
      },
      include: {
        CoachingJoinRequestStatus: true,
        StudentAccount: {
          include: {
            User: true,
          },
        },
      },
    });

    return {
      joinRequest: mapJoinRequest(updated),
      studentUserId: updated.StudentAccount?.UserID || null,
    };
  });
}

module.exports = {
  createJoinRequest,
  listJoinRequestsBySession,
  listTeacherPendingRequests,
  teacherApprove,
  teacherReject,
  listAdminPendingRequests,
  adminApprove,
  adminReject,
};
