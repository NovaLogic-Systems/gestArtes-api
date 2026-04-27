const prisma = require('../config/prisma');
const { createPricingService } = require('../services/pricing.service');

const DEFAULT_NOTIFICATION_TYPE_ID = 1;
const TEACHER_APPROVED_STATUS = 'TEACHER_APPROVED';
const TEACHER_REJECTED_STATUS = 'TEACHER_REJECTED';
const FINALIZATION_VALIDATION_PENDING_STATUS = 'FINALIZATION_VALIDATION_PENDING';
const TEACHER_CONFIRMATION_STEP = 'TeacherConfirmation';
const NO_SHOW_STATUS = 'NO_SHOW';
const NO_SHOW_ATTENDANCE_STATUS = 'NO_SHOW';
const NO_SHOW_STEP = 'NoShowRecorded';

const pricingService = createPricingService(prisma);

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

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
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

function isTerminalSessionStatus(statusName) {
  const normalized = normalizeKey(statusName);

  return normalized.includes('cancel') || normalized.includes('finalized');
}

function isNoShowSessionStatus(statusName) {
  return normalizeKey(statusName) === normalizeKey(NO_SHOW_STATUS);
}

function hasTeacherConfirmationByUser(validations, teacherUserId) {
  return validations.some((validation) => {
    if (validation.ValidatedByUserID !== teacherUserId) {
      return false;
    }

    const stepName = normalizeKey(validation.ValidationStep?.StepName);
    return stepName.includes('teacher') && stepName.includes('confirm');
  });
}

function appendNoShowRemark(previousNotes, remark) {
  const prefix = 'NO_SHOW: ';
  const incoming = `${prefix}${String(remark || '').trim()}`;
  const existing = String(previousNotes || '').trim();

  if (!existing) {
    return incoming.slice(0, 255);
  }

  return `${existing} | ${incoming}`.slice(0, 255);
}

async function getOrCreateValidationStep(db, stepName, keywords) {
  const allSteps = await db.validationStep.findMany({
    select: { StepID: true, StepName: true },
  });

  const found = allSteps.find((step) => {
    const normalized = normalizeKey(step.StepName);
    return keywords.every((keyword) => normalized.includes(normalizeKey(keyword)));
  });

  if (found) {
    return found.StepID;
  }

  const created = await db.validationStep.create({
    data: { StepName: stepName },
    select: { StepID: true },
  });

  return created.StepID;
}

async function resolveOrCreateSessionStatusId(db, desiredStatusName, aliases = []) {
  const statuses = await db.sessionStatus.findMany({
    select: { StatusID: true, StatusName: true },
  });

  const desiredNormalized = normalizeKey(desiredStatusName);
  const aliasSet = new Set([desiredNormalized, ...aliases.map((alias) => normalizeKey(alias))]);

  const found = statuses.find((status) => aliasSet.has(normalizeKey(status.StatusName)));

  if (found) {
    return found.StatusID;
  }

  const created = await db.sessionStatus.create({
    data: { StatusName: desiredStatusName },
    select: { StatusID: true },
  });

  return created.StatusID;
}

async function resolveOrCreateAttendanceStatusId(db, desiredStatusName, aliases = []) {
  const statuses = await db.attendanceStatus.findMany({
    select: { AttendanceStatusID: true, StatusName: true },
  });

  const desiredNormalized = normalizeKey(desiredStatusName);
  const aliasSet = new Set([desiredNormalized, ...aliases.map((alias) => normalizeKey(alias))]);

  const found = statuses.find((status) => aliasSet.has(normalizeKey(status.StatusName)));

  if (found) {
    return found.AttendanceStatusID;
  }

  const created = await db.attendanceStatus.create({
    data: { StatusName: desiredStatusName },
    select: { AttendanceStatusID: true },
  });

  return created.AttendanceStatusID;
}

async function listAdminUserIds(db) {
  const rows = await db.userRole.findMany({
    where: {
      Role: {
        RoleName: {
          equals: 'admin',
          mode: 'insensitive',
        },
      },
      User: {
        IsActive: true,
      },
    },
    select: { UserID: true },
  });

  return [...new Set(rows.map((row) => row.UserID).filter((userId) => Number.isInteger(userId) && userId > 0))];
}

async function createAdminNotifications(db, { sessionId, title, message }) {
  const adminUserIds = await listAdminUserIds(db);

  if (adminUserIds.length === 0) {
    return;
  }

  const now = new Date();
  const payload = adminUserIds.map((userId) => ({
    UserID: userId,
    Message: truncateNotificationMessage(message),
    TypeID: DEFAULT_NOTIFICATION_TYPE_ID,
    IsRead: false,
    CreatedAt: now,
    Title: buildNotificationTitle(title || message),
    SessionID: sessionId,
  }));

  await db.notification.createMany({ data: payload });
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

async function getPendingSessions(req, res, next) {
  try {
    const teacherUserId = getAuthenticatedTeacherUserId(req, res);

    if (!teacherUserId) {
      return;
    }

    const now = new Date();

    const sessions = await prisma.coachingSession.findMany({
      where: {
        EndTime: {
          lte: now,
        },
        SessionTeacher: {
          some: {
            TeacherID: teacherUserId,
          },
        },
      },
      include: {
        SessionStatus: {
          select: {
            StatusID: true,
            StatusName: true,
          },
        },
        Studio: {
          select: {
            StudioName: true,
          },
        },
        Modality: {
          select: {
            ModalityName: true,
          },
        },
        SessionValidation: {
          include: {
            ValidationStep: {
              select: {
                StepName: true,
              },
            },
          },
        },
        SessionStudent: {
          include: {
            AttendanceStatus: {
              select: {
                StatusName: true,
              },
            },
            StudentAccount: {
              include: {
                User: {
                  select: {
                    UserID: true,
                    FirstName: true,
                    LastName: true,
                    Email: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [
        { EndTime: 'asc' },
        { SessionID: 'asc' },
      ],
    });

    const pendingSessions = sessions
      .filter((session) => {
        const statusName = session.SessionStatus?.StatusName;
        // Exclude cancelled/finalized; keep NO_SHOW sessions so teacher can still mark other enrolled students
        return !isTerminalSessionStatus(statusName);
      })
      .map((session) => {
        const teacherConfirmed = hasTeacherConfirmationByUser(session.SessionValidation, teacherUserId);

        return {
          sessionId: session.SessionID,
          startTime: session.StartTime,
          endTime: session.EndTime,
          statusId: session.SessionStatus?.StatusID ?? null,
          statusName: session.SessionStatus?.StatusName ?? null,
          studioName: session.Studio?.StudioName ?? null,
          modalityName: session.Modality?.ModalityName ?? null,
          teacherConfirmed,
          canConfirmCompletion: !teacherConfirmed,
          students: session.SessionStudent.map((student) => ({
            studentAccountId: student.StudentAccountID,
            studentUserId: student.StudentAccount?.User?.UserID ?? null,
            studentName: [
              student.StudentAccount?.User?.FirstName,
              student.StudentAccount?.User?.LastName,
            ]
              .filter(Boolean)
              .join(' ')
              .trim(),
            studentEmail: student.StudentAccount?.User?.Email ?? null,
            attendanceStatus: student.AttendanceStatus?.StatusName ?? null,
            canRegisterNoShow: normalizeKey(student.AttendanceStatus?.StatusName) !== normalizeKey(NO_SHOW_ATTENDANCE_STATUS),
          })),
        };
      });

    return res.json({
      summary: {
        pendingCount: pendingSessions.length,
      },
      sessions: pendingSessions,
    });
  } catch (error) {
    return next(error);
  }
}

async function confirmCompletion(req, res, next) {
  try {
    const teacherUserId = getAuthenticatedTeacherUserId(req, res);

    if (!teacherUserId) {
      return;
    }

    const sessionId = Number(req.params?.id);

    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return res.status(400).json({ error: 'Invalid session id' });
    }

    const session = await prisma.coachingSession.findFirst({
      where: {
        SessionID: sessionId,
        SessionTeacher: {
          some: {
            TeacherID: teacherUserId,
          },
        },
      },
      include: {
        SessionStatus: {
          select: {
            StatusName: true,
          },
        },
        SessionValidation: {
          include: {
            ValidationStep: {
              select: {
                StepName: true,
              },
            },
          },
        },
      },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (new Date(session.EndTime) > new Date()) {
      return res.status(409).json({ error: 'Session has not ended yet' });
    }

    const sessionStatusName = session.SessionStatus?.StatusName;
    if (isTerminalSessionStatus(sessionStatusName) || isNoShowSessionStatus(sessionStatusName)) {
      return res.status(409).json({ error: 'Session is not eligible for completion confirmation' });
    }

    if (hasTeacherConfirmationByUser(session.SessionValidation, teacherUserId)) {
      return res.status(409).json({ error: 'Session was already confirmed by this teacher' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const teacherStepId = await getOrCreateValidationStep(tx, TEACHER_CONFIRMATION_STEP, ['teacher', 'confirm']);
      const finalizationPendingStatusId = await resolveOrCreateSessionStatusId(
        tx,
        FINALIZATION_VALIDATION_PENDING_STATUS,
        ['finalization validation pending', 'finalizationpending', 'finalvalidationpending'],
      );

      const createdValidation = await tx.sessionValidation.create({
        data: {
          SessionID: sessionId,
          ValidatedByUserID: teacherUserId,
          ValidatedAt: new Date(),
          ValidationStepID: teacherStepId,
        },
        select: {
          ValidationID: true,
          ValidatedAt: true,
        },
      });

      const updatedSession = await tx.coachingSession.update({
        where: {
          SessionID: sessionId,
        },
        data: {
          StatusID: finalizationPendingStatusId,
          ValidationRequestedAt: new Date(),
        },
        include: {
          SessionStatus: {
            select: {
              StatusName: true,
            },
          },
        },
      });

      await createAdminNotifications(tx, {
        sessionId,
        title: 'Sessao pronta para validacao final',
        message: `A sessao #${sessionId} foi confirmada pelo professor e aguarda validacao final da administracao.`,
      });

      return {
        validationId: createdValidation.ValidationID,
        validatedAt: createdValidation.ValidatedAt,
        statusName: updatedSession.SessionStatus?.StatusName ?? FINALIZATION_VALIDATION_PENDING_STATUS,
      };
    });

    return res.status(201).json({
      sessionId,
      validationId: result.validationId,
      validatedAt: result.validatedAt,
      status: result.statusName,
    });
  } catch (error) {
    return next(error);
  }
}

async function registerNoShow(req, res, next) {
  try {
    const teacherUserId = getAuthenticatedTeacherUserId(req, res);

    if (!teacherUserId) {
      return;
    }

    const sessionId = Number(req.params?.id);
    const studentAccountId = Number(req.body?.studentAccountId);
    const remarks = String(req.body?.remarks || '').trim();

    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return res.status(400).json({ error: 'Invalid session id' });
    }

    if (!Number.isInteger(studentAccountId) || studentAccountId <= 0) {
      return res.status(400).json({ error: 'Invalid studentAccountId' });
    }

    if (!remarks) {
      return res.status(400).json({ error: 'Remarks are required for no-show registration' });
    }

    const session = await prisma.coachingSession.findFirst({
      where: {
        SessionID: sessionId,
        SessionTeacher: {
          some: {
            TeacherID: teacherUserId,
          },
        },
      },
      include: {
        SessionStatus: {
          select: {
            StatusName: true,
          },
        },
        SessionStudent: {
          where: {
            StudentAccountID: studentAccountId,
          },
          include: {
            AttendanceStatus: {
              select: {
                StatusName: true,
              },
            },
            StudentAccount: {
              include: {
                User: {
                  select: {
                    UserID: true,
                    FirstName: true,
                    LastName: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (new Date(session.EndTime) > new Date()) {
      return res.status(409).json({ error: 'Cannot register no-show before session end' });
    }

    if (isTerminalSessionStatus(session.SessionStatus?.StatusName)) {
      return res.status(409).json({ error: 'Session is not eligible for no-show registration' });
    }
    // Allow no-show registration even if the session is already in NO_SHOW — another student may still need to be marked

    const enrollment = session.SessionStudent[0];

    if (!enrollment) {
      return res.status(404).json({ error: 'Session enrollment not found for this student' });
    }

    if (normalizeKey(enrollment.AttendanceStatus?.StatusName) === normalizeKey(NO_SHOW_ATTENDANCE_STATUS)) {
      return res.status(409).json({ error: 'No-show already registered for this enrollment' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const noShowAttendanceStatusId = await resolveOrCreateAttendanceStatusId(
        tx,
        NO_SHOW_ATTENDANCE_STATUS,
        ['no show', 'noshow'],
      );

      const noShowSessionStatusId = await resolveOrCreateSessionStatusId(
        tx,
        NO_SHOW_STATUS,
        ['no show', 'noshow'],
      );

      const noShowStepId = await getOrCreateValidationStep(tx, NO_SHOW_STEP, ['no', 'show']);

      await tx.sessionStudent.update({
        where: {
          SessionID_StudentAccountID: {
            SessionID: sessionId,
            StudentAccountID: studentAccountId,
          },
        },
        data: {
          AttendanceStatusID: noShowAttendanceStatusId,
        },
      });

      await tx.coachingSession.update({
        where: {
          SessionID: sessionId,
        },
        data: {
          StatusID: noShowSessionStatusId,
          ReviewNotes: appendNoShowRemark(session.ReviewNotes, remarks),
        },
      });

      await tx.sessionValidation.create({
        data: {
          SessionID: sessionId,
          ValidatedByUserID: teacherUserId,
          ValidatedAt: new Date(),
          ValidationStepID: noShowStepId,
        },
      });

      const existingPenalty = await tx.financialEntry.findFirst({
        where: {
          SessionID: sessionId,
          FinancialEntryType: {
            TypeName: 'no_show_fee',
          },
        },
        select: {
          EntryID: true,
        },
      });

      const penaltyEntry = existingPenalty
        ? existingPenalty
        : await pricingService.applyNoShowPenalty(sessionId, teacherUserId, tx);

      await createAdminNotifications(tx, {
        sessionId,
        title: 'No-show registado',
        message: `Foi registado no-show na sessao #${sessionId}. A penalizacao BR-16 foi acionada.`,
      });

      if (enrollment.StudentAccount?.User?.UserID) {
        const studentName = [
          enrollment.StudentAccount?.User?.FirstName,
          enrollment.StudentAccount?.User?.LastName,
        ]
          .filter(Boolean)
          .join(' ')
          .trim();

        await tx.notification.create({
          data: {
            UserID: enrollment.StudentAccount.User.UserID,
            Message: truncateNotificationMessage(
              `Foi registado no-show na sessao #${sessionId}${studentName ? ` para ${studentName}` : ''}. Foi aplicada penalizacao conforme BR-16.`,
            ),
            TypeID: DEFAULT_NOTIFICATION_TYPE_ID,
            IsRead: false,
            CreatedAt: new Date(),
            Title: buildNotificationTitle('No-show registado e penalizacao aplicada'),
            SessionID: sessionId,
          },
        });
      }

      return {
        sessionId,
        studentAccountId,
        attendanceStatus: NO_SHOW_ATTENDANCE_STATUS,
        sessionStatus: NO_SHOW_STATUS,
        penaltyEntryId: penaltyEntry.EntryID,
      };
    });

    return res.status(201).json(result);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  approveJoinRequest,
  confirmCompletion,
  getAdmissionRequests,
  getPendingAdmissions,
  getPendingSessions,
  getDashboard,
  getTodaySchedule,
  registerNoShow,
  rejectJoinRequest,
  reviewAdmissionRequest,
};
