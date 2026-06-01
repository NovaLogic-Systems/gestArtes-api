/**
 * @file src/controllers/student.controller.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const bcrypt = require('bcrypt');
const prisma = require('../config/prisma');
const { getAuthenticatedRole } = require('../utils/auth-context');
const { revokeAllRefreshTokensForUser } = require('../services/jwt.service');

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
const OPEN_JOIN_REQUEST_STATUS_KEYS = new Set([
  'awaitingapproval',
  'pendingteacher',
  'pendingapproval',
  'teacherapproved',
  'pendingadmin',
]);

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

function normalizeWorkflowStatusKey(value) {
  return normalizeStatusName(value).replace(/[^a-z0-9]/g, '');
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

function serializeStudentProfile(profileRow, studentAccountId) {
  return {
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
    isModalityLocked: profileRow.isModalityLocked,
    allowedModalities: profileRow.allowedModalities,
    accountCreatedAt: profileRow.accountCreatedAt,
    accountUpdatedAt: profileRow.accountUpdatedAt,
  };
}

function getAuthenticatedStudentUserId(req, res) {
  const userId = Number(req.auth?.userId);
  const role = getAuthenticatedRole(req);

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

async function loadStudentProfile(userId) {
  const user = await prisma.user.findFirst({
    where: {
      UserID: userId,
      IsActive: true,
      DeletedAt: null,
    },
    select: {
      UserID: true,
      AuthUID: true,
      FirstName: true,
      LastName: true,
      Email: true,
      PhoneNumber: true,
      Photo: true,
      CreatedAt: true,
      UpdatedAt: true,
      StudentAccount: {
        select: {
          StudentAccountID: true,
          BirthDate: true,
          GuardianName: true,
          GuardianPhone: true,
          IsModalityLocked: true,
          StudentAllowedModality: {
            select: {
              ModalityID: true
            }
          }
        },
      },
    },
  });

  if (!user || !user.StudentAccount) return null;

  return {
    profileRow: {
      userId: user.UserID,
      authUid: user.AuthUID,
      firstName: user.FirstName,
      lastName: user.LastName,
      email: user.Email,
      phoneNumber: user.PhoneNumber,
      photoUrl: user.Photo,
      accountCreatedAt: user.CreatedAt,
      accountUpdatedAt: user.UpdatedAt,
      studentAccountId: user.StudentAccount.StudentAccountID,
      birthDate: user.StudentAccount.BirthDate,
      guardianName: user.StudentAccount.GuardianName,
      guardianPhone: user.StudentAccount.GuardianPhone,
      isModalityLocked: user.StudentAccount.IsModalityLocked,
      allowedModalities: user.StudentAccount.StudentAllowedModality.map(m => m.ModalityID)
    },
    studentAccountId: user.StudentAccount.StudentAccountID,
  };
}

async function listOpenJoinRequestStatusIds() {
  const statuses = await prisma.coachingJoinRequestStatus.findMany({
    select: {
      StatusID: true,
      StatusName: true,
    },
  });

  return statuses
    .filter((status) => OPEN_JOIN_REQUEST_STATUS_KEYS.has(normalizeWorkflowStatusKey(status.StatusName)))
    .map((status) => status.StatusID);
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
  const now = new Date();

  const sessionStudents = await prisma.sessionStudent.findMany({
    where: {
      StudentAccountID: studentAccountId,
      CoachingSession: { StartTime: { gte: now } },
    },
    include: {
      CoachingSession: {
        include: {
          Studio: { select: { StudioName: true } },
          SessionStatus: { select: { StatusName: true } },
          SessionTeacher: {
            orderBy: [{ AssignmentRoleID: 'asc' }, { TeacherID: 'asc' }],
            include: {
              User: { select: { FirstName: true, LastName: true } },
            },
          },
        },
      },
    },
    orderBy: [{ CoachingSession: { StartTime: 'asc' } }, { SessionID: 'asc' }],
    take: safeLimit,
  });

  return sessionStudents.map((ss) => {
    const cs = ss.CoachingSession;
    const teacher = cs.SessionTeacher[0];
    return mapScheduleRow({
      sessionId: cs.SessionID,
      sessionDate: toUTCDateString(cs.StartTime),
      sessionTime: toUTCTimeString(cs.StartTime),
      teacherName: teacher
        ? [teacher.User.FirstName, teacher.User.LastName].filter(Boolean).join(' ')
        : 'Por atribuir',
      studioName: cs.Studio.StudioName,
      sessionStatus: cs.SessionStatus.StatusName,
    });
  });
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

    const now = new Date();

    const [
      totalSessionsEnrolled,
      upcomingSessions,
      completedSessions,
      sessionStudentsWithStatus,
      nextSessionsRaw,
      sessionModalityRaw,
      totalJoinRequests,
      totalInventoryRentals,
      totalMarketplacePurchases,
    ] = await Promise.all([
      prisma.sessionStudent.count({ where: { StudentAccountID: studentAccountId } }),
      prisma.sessionStudent.count({
        where: {
          StudentAccountID: studentAccountId,
          CoachingSession: { StartTime: { gte: now } },
        },
      }),
      prisma.sessionStudent.count({
        where: {
          StudentAccountID: studentAccountId,
          CoachingSession: { EndTime: { lt: now } },
        },
      }),
      prisma.sessionStudent.findMany({
        where: { StudentAccountID: studentAccountId },
        select: { AttendanceStatus: { select: { StatusName: true } } },
      }),
      prisma.sessionStudent.findMany({
        where: {
          StudentAccountID: studentAccountId,
          CoachingSession: { StartTime: { gte: now } },
        },
        select: {
          CoachingSession: {
            select: {
              SessionID: true,
              StartTime: true,
              EndTime: true,
              Modality: { select: { ModalityName: true } },
              Studio: { select: { StudioName: true } },
              SessionStatus: { select: { StatusName: true } },
            },
          },
        },
        orderBy: { CoachingSession: { StartTime: 'asc' } },
        take: 5,
      }),
      prisma.sessionStudent.findMany({
        where: { StudentAccountID: studentAccountId },
        select: {
          CoachingSession: {
            select: { Modality: { select: { ModalityName: true } } },
          },
        },
      }),
      prisma.coachingJoinRequest.count({
        where: { StudentAccountID: studentAccountId },
      }),
      prisma.inventoryTransaction.count({
        where: { RenterID: userId },
      }),
      prisma.marketplaceTransaction.count({
        where: { BuyerID: userId },
      }),
    ]);

    const statusCounts = new Map();
    for (const ss of sessionStudentsWithStatus) {
      const name = ss.AttendanceStatus.StatusName;
      statusCounts.set(name, (statusCounts.get(name) || 0) + 1);
    }
    const attendanceByStatus = [...statusCounts.entries()]
      .map(([statusName, total]) => ({ statusName, total }))
      .sort((a, b) => a.statusName.localeCompare(b.statusName));

    const totalSessionsAttended = attendanceByStatus.reduce((acc, item) => {
      return isAttendedStatus(item.statusName) ? acc + item.total : acc;
    }, 0);

    const modalityCounts = new Map();
    for (const ss of sessionModalityRaw) {
      const name = ss.CoachingSession.Modality.ModalityName;
      modalityCounts.set(name, (modalityCounts.get(name) || 0) + 1);
    }
    const modalityDistribution = [...modalityCounts.entries()]
      .map(([modalityName, sessions]) => ({ modalityName, sessions }))
      .sort((a, b) => b.sessions - a.sessions || a.modalityName.localeCompare(b.modalityName));

    const nextSessions = nextSessionsRaw.map((ss) => ({
      sessionId: ss.CoachingSession.SessionID,
      startTime: ss.CoachingSession.StartTime,
      endTime: ss.CoachingSession.EndTime,
      modalityName: ss.CoachingSession.Modality.ModalityName,
      studioName: ss.CoachingSession.Studio.StudioName,
      status: ss.CoachingSession.SessionStatus.StatusName,
    }));

    res.json({
      profile: serializeStudentProfile(profileRow, studentAccountId),
      trainingPlan: {
        name: modalityDistribution[0]?.modalityName || null,
        modalityDistribution,
        nextSessions,
      },
      statistics: {
        totalSessionsEnrolled,
        totalSessionsAttended,
        upcomingSessions,
        completedSessions,
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

async function updateProfile(req, res, next) {
  try {
    const userId = getAuthenticatedStudentUserId(req, res);

    if (!userId) {
      return;
    }

    const phoneNumber = typeof req.body?.phoneNumber === 'string'
      ? String(req.body.phoneNumber).trim()
      : undefined;

    const existing = await loadStudentProfile(userId);

    if (!existing) {
      res.status(404).json({ error: 'Student account not found' });
      return;
    }

    await prisma.user.update({
      where: { UserID: userId },
      data: {
        PhoneNumber: typeof phoneNumber === 'string' ? (phoneNumber || null) : undefined,
        UpdatedAt: new Date(),
      },
    });

    const refreshed = await loadStudentProfile(userId);

    if (!refreshed) {
      res.status(404).json({ error: 'Student account not found' });
      return;
    }

    res.json({
      profile: serializeStudentProfile(refreshed.profileRow, refreshed.studentAccountId),
      message: 'Phone number updated successfully.',
    });
  } catch (error) {
    next(error);
  }
}

async function changePassword(req, res, next) {
  try {
    const userId = getAuthenticatedStudentUserId(req, res);

    if (!userId) {
      return;
    }

    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current and new passwords are required' });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({ error: 'Password must have at least 8 characters' });
      return;
    }

    const user = await prisma.user.findFirst({
      where: {
        UserID: userId,
        IsActive: true,
        DeletedAt: null,
      },
      select: {
        UserID: true,
        PasswordHash: true,
        StudentAccount: {
          select: {
            StudentAccountID: true,
          },
        },
      },
    });

    if (!user || !user.StudentAccount) {
      res.status(404).json({ error: 'Student account not found' });
      return;
    }

    const isValidPassword = await bcrypt.compare(currentPassword, user.PasswordHash);

    if (!isValidPassword) {
      res.status(400).json({ error: 'Current password is incorrect' });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { UserID: userId },
      data: {
        PasswordHash: passwordHash,
        UpdatedAt: new Date(),
      },
    });

    await revokeAllRefreshTokensForUser(userId);

    res.json({ message: 'Password updated successfully.' });
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

    const now = new Date();
    const openJoinRequestStatusIds = await listOpenJoinRequestStatusIds();

    const [
      upcomingSessions,
      pendingValidations,
      reviewRequests,
      activeMarketplaceListings,
      notificationRows,
      schedule,
    ] = await Promise.all([
      prisma.sessionStudent.count({
        where: {
          StudentAccountID: studentAccountId,
          CoachingSession: { StartTime: { gte: now } },
        },
      }),
      // Sessions that ended and still need the student's confirmation
      prisma.coachingSession.count({
        where: {
          EndTime: { lt: now },
          SessionStudent: { some: { StudentAccountID: studentAccountId } },
          SessionStatus: { StatusName: { not: { contains: 'cancel' } } },
          SessionValidation: { none: { ValidatedByUserID: userId } },
        },
      }),
      prisma.coachingJoinRequest.count({
        where: {
          StudentAccountID: studentAccountId,
          StatusID: { in: openJoinRequestStatusIds },
        },
      }),
      prisma.marketplaceItem.count({
        where: { SellerID: userId, IsActive: true },
      }),
      prisma.notification.findMany({
        where: { UserID: userId },
        orderBy: [{ CreatedAt: 'desc' }, { NotificationID: 'desc' }],
        take: 5,
        select: {
          NotificationID: true,
          Title: true,
          Message: true,
          IsRead: true,
          CreatedAt: true,
        },
      }),
      listUpcomingSchedule(studentAccountId, 5),
    ]);

    res.json({
      upcomingSessions,
      pendingValidations,
      reviewRequests,
      activeMarketplaceListings,
      notifications: notificationRows.map((n) =>
        mapNotificationRow({
          notificationId: n.NotificationID,
          title: n.Title,
          message: n.Message,
          isRead: n.IsRead,
          createdAt: n.CreatedAt,
        }),
      ),
      schedule,
    });
  } catch (error) {
    next(error);
  }
}

const { createStudentUseCases } = require('../application/use-cases/student');

// Factory de use-cases: injeção de Prisma ao arranque
// Controller delega orquestração ao use-case e mantém responsabilidade de IO/HTTP
const studentUseCases = createStudentUseCases({ prisma });

async function getUpcomingSchedule(req, res, next) {
  try {
    const userId = getAuthenticatedStudentUserId(req, res);

    if (!userId) return;

    const student = await loadStudentProfile(userId);

    if (!student) {
      res.status(404).json({ error: 'Student account not found' });
      return;
    }

    const schedule = await studentUseCases.getUpcomingSchedule.execute({ studentAccountId: student.studentAccountId, limit: 5 });
    res.json({ schedule });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
  getDashboard,
  getUpcomingSchedule,
};
