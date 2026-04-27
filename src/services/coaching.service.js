const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');
const { createSessionWithBusinessRules } = require('./session.service');

const DEFAULT_TEACHER_INITIATIVE_DURATION_MS = 60 * 60 * 1000;
const PENDING_APPROVAL_STATUS_NAME = 'PendingApproval';

function createHttpError(status, message, details) {
  const error = new Error(message);
  error.status = status;
  if (details) error.details = details;
  return error;
}

function toPositiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function toUTCTimeString(date) {
  const d = new Date(date);
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function getWeekBounds(weekStartStr) {
  const start = new Date(weekStartStr);
  if (Number.isNaN(start.getTime())) {
    throw createHttpError(400, 'Data de início de semana inválida');
  }
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { weekStart: start, weekEnd: end };
}

function dateForDayOfWeek(weekStart, targetDow) {
  const startDow = weekStart.getUTCDay();
  const diff = (targetDow - startDow + 7) % 7;
  const d = new Date(weekStart);
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

async function getOrCreateValidationStep(stepName, keywords) {
  const all = await prisma.validationStep.findMany({
    select: { StepID: true, StepName: true },
  });

  const found = all.find((s) =>
    keywords.some((kw) => s.StepName.toLowerCase().includes(kw))
  );

  if (found) return found.StepID;

  const created = await prisma.validationStep.create({
    data: { StepName: stepName },
    select: { StepID: true },
  });

  return created.StepID;
}

async function getAvailableSlots({ weekStart: weekStartStr, teacherId, modalityId }) {
  const weekStartInput = weekStartStr || new Date().toISOString().slice(0, 10);
  const { weekStart, weekEnd } = getWeekBounds(weekStartInput);

  const activeYear = await prisma.academicYear.findFirst({
    where: { IsActive: true },
    select: { AcademicYearID: true },
  });

  if (!activeYear) {
    throw createHttpError(503, 'Nenhum ano letivo ativo encontrado');
  }

  const teacherWhere = {
    IsActive: true,
    UserRole: { some: { Role: { RoleName: 'teacher' } } },
  };

  if (teacherId) {
    const parsedTeacherId = toPositiveInt(teacherId);
    if (!parsedTeacherId) throw createHttpError(400, 'teacherId inválido');
    teacherWhere.UserID = parsedTeacherId;
  }

  if (modalityId) {
    const parsedModalityId = toPositiveInt(modalityId);
    if (!parsedModalityId) throw createHttpError(400, 'modalityId inválido');
    teacherWhere.TeacherModality = { some: { ModalityID: parsedModalityId } };
  }

  const [teachers, modalities, studios] = await Promise.all([
    prisma.user.findMany({
      where: teacherWhere,
      select: {
        UserID: true,
        FirstName: true,
        LastName: true,
        TeacherModality: { select: { ModalityID: true } },
      },
      orderBy: { FirstName: 'asc' },
    }),
    prisma.modality.findMany({
      select: { ModalityID: true, ModalityName: true },
      orderBy: { ModalityName: 'asc' },
    }),
    prisma.studio.findMany({
      select: {
        StudioID: true,
        StudioName: true,
        Capacity: true,
        StudioModality: { select: { ModalityID: true } },
      },
      orderBy: { StudioName: 'asc' },
    }),
  ]);

  const teacherIds = teachers.map((t) => t.UserID);

  const emptyResult = {
    weekStart: weekStart.toISOString().slice(0, 10),
    weekEnd: weekEnd.toISOString().slice(0, 10),
    teachers: [],
    modalities: modalities.map((m) => ({ modalityId: m.ModalityID, modalityName: m.ModalityName })),
    studios: studios.map((s) => ({
      studioId: s.StudioID,
      studioName: s.StudioName,
      capacity: s.Capacity,
      modalityIds: s.StudioModality.map((sm) => sm.ModalityID),
    })),
    availabilityWindows: [],
  };

  if (teacherIds.length === 0) return emptyResult;

  const [recurringAvailabilities, punctualAvailabilities, absences, sessionTeachers] = await Promise.all([
    prisma.teacherAvailability.findMany({
      where: {
        TeacherID: { in: teacherIds },
        TeacherAvailabilityRecurring: {
          is: { AcademicYearID: activeYear.AcademicYearID, IsActive: true },
        },
      },
      select: {
        TeacherID: true,
        TeacherAvailabilityRecurring: {
          select: { DayOfWeek: true, StartTime: true, EndTime: true },
        },
      },
    }),
    prisma.teacherAvailability.findMany({
      where: {
        TeacherID: { in: teacherIds },
        TeacherAvailabilityPunctual: {
          is: { StartDateTime: { lt: weekEnd }, EndDateTime: { gt: weekStart } },
        },
      },
      select: {
        TeacherID: true,
        TeacherAvailabilityPunctual: {
          select: { StartDateTime: true, EndDateTime: true },
        },
      },
    }),
    prisma.teacherAbsence.findMany({
      where: {
        TeacherID: { in: teacherIds },
        StartDate: { lt: weekEnd },
        EndDate: { gt: weekStart },
      },
      select: { TeacherID: true, StartDate: true, EndDate: true },
    }),
    prisma.sessionTeacher.findMany({
      where: {
        TeacherID: { in: teacherIds },
        CoachingSession: {
          is: { StartTime: { lt: weekEnd }, EndTime: { gt: weekStart } },
        },
      },
      select: {
        TeacherID: true,
        CoachingSession: {
          select: {
            SessionID: true,
            StartTime: true,
            EndTime: true,
            StudioID: true,
            MaxParticipants: true,
            SessionStatus: { select: { StatusName: true } },
            SessionStudent: { select: { StudentAccountID: true } },
          },
        },
      },
    }),
  ]);

  function buildBookedSessions(teacherId, dayStart, dayEnd) {
    return sessionTeachers
      .filter(
        (st) =>
          st.TeacherID === teacherId &&
          new Date(st.CoachingSession.StartTime) >= dayStart &&
          new Date(st.CoachingSession.StartTime) < dayEnd
      )
      .map((st) => ({
        sessionId: st.CoachingSession.SessionID,
        startTime: st.CoachingSession.StartTime,
        endTime: st.CoachingSession.EndTime,
        studioId: st.CoachingSession.StudioID,
        status: st.CoachingSession.SessionStatus?.StatusName,
        maxParticipants: st.CoachingSession.MaxParticipants,
        enrolledCount: st.CoachingSession.SessionStudent.length,
      }));
  }

  function isTeacherAbsent(teacherId, start, end) {
    return absences.some(
      (a) =>
        a.TeacherID === teacherId &&
        new Date(a.StartDate) <= start &&
        new Date(a.EndDate) >= end
    );
  }

  const availabilityWindows = [];

  for (const avail of recurringAvailabilities) {
    const rec = avail.TeacherAvailabilityRecurring;
    if (!rec) continue;

    const date = dateForDayOfWeek(weekStart, rec.DayOfWeek);
    if (date >= weekEnd) continue;

    if (isTeacherAbsent(avail.TeacherID, date, date)) continue;

    const dayStart = new Date(date);
    const dayEnd = new Date(date);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    availabilityWindows.push({
      teacherId: avail.TeacherID,
      date: date.toISOString().slice(0, 10),
      dayOfWeek: rec.DayOfWeek,
      windowStart: toUTCTimeString(rec.StartTime),
      windowEnd: toUTCTimeString(rec.EndTime),
      bookedSessions: buildBookedSessions(avail.TeacherID, dayStart, dayEnd),
    });
  }

  for (const avail of punctualAvailabilities) {
    const punc = avail.TeacherAvailabilityPunctual;
    if (!punc) continue;

    const startDt = new Date(punc.StartDateTime);
    const endDt = new Date(punc.EndDateTime);

    if (isTeacherAbsent(avail.TeacherID, startDt, endDt)) continue;

    const date = new Date(startDt);
    date.setUTCHours(0, 0, 0, 0);

    const dayStart = new Date(date);
    const dayEnd = new Date(date);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    availabilityWindows.push({
      teacherId: avail.TeacherID,
      date: date.toISOString().slice(0, 10),
      dayOfWeek: date.getUTCDay(),
      windowStart: toUTCTimeString(startDt),
      windowEnd: toUTCTimeString(endDt),
      bookedSessions: buildBookedSessions(avail.TeacherID, dayStart, dayEnd),
    });
  }

  return {
    weekStart: weekStart.toISOString().slice(0, 10),
    weekEnd: weekEnd.toISOString().slice(0, 10),
    teachers: teachers.map((t) => ({
      teacherId: t.UserID,
      name: [t.FirstName, t.LastName].filter(Boolean).join(' '),
      modalityIds: t.TeacherModality.map((tm) => tm.ModalityID),
    })),
    modalities: modalities.map((m) => ({ modalityId: m.ModalityID, modalityName: m.ModalityName })),
    studios: studios.map((s) => ({
      studioId: s.StudioID,
      studioName: s.StudioName,
      capacity: s.Capacity,
      modalityIds: s.StudioModality.map((sm) => sm.ModalityID),
    })),
    availabilityWindows,
  };
}

async function getCompatibleStudios(modalityId) {
  const parsedId = toPositiveInt(modalityId);
  if (!parsedId) throw createHttpError(400, 'modalityId inválido');

  const studios = await prisma.studio.findMany({
    where: { StudioModality: { some: { ModalityID: parsedId } } },
    select: { StudioID: true, StudioName: true, Capacity: true },
    orderBy: { StudioName: 'asc' },
  });

  return studios.map((s) => ({
    studioId: s.StudioID,
    studioName: s.StudioName,
    capacity: s.Capacity,
  }));
}

async function resolveOrCreateSessionStatusId(statusName) {
  const normalizedStatusName = String(statusName || '').trim();

  if (!normalizedStatusName) {
    throw createHttpError(400, 'Estado da sessão inválido');
  }

  const existingStatus = await prisma.sessionStatus.findFirst({
    where: {
      StatusName: {
        equals: normalizedStatusName,
        mode: 'insensitive',
      },
    },
    select: { StatusID: true },
  });

  if (existingStatus) {
    return existingStatus.StatusID;
  }

  const createdStatus = await prisma.sessionStatus.create({
    data: { StatusName: normalizedStatusName },
    select: { StatusID: true },
  });

  return createdStatus.StatusID;
}

async function resolveOrCreatePricingRateId(pricePerHour) {
  const hourlyRate = Number(pricePerHour);

  if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
    throw createHttpError(400, 'pricePerHour inválido');
  }

  const existingRate = await prisma.sessionPricingRate.findFirst({
    where: { HourlyRate: hourlyRate },
    select: { PricingRateID: true },
  });

  if (existingRate) {
    return existingRate.PricingRateID;
  }

  const createdRate = await prisma.sessionPricingRate.create({
    data: {
      RateName: `Teacher initiative ${hourlyRate.toFixed(2)}`,
      HourlyRate: hourlyRate,
    },
    select: { PricingRateID: true },
  });

  return createdRate.PricingRateID;
}

async function createSessionInitiative(
  { date, studioId, modalityId, capacity, pricePerHour, isExternal, isOutsideStdHours },
  requestedByUserId
) {
  const startTime = new Date(date);

  if (Number.isNaN(startTime.getTime())) {
    throw createHttpError(400, 'date inválida');
  }

  const endTime = new Date(startTime.getTime() + DEFAULT_TEACHER_INITIATIVE_DURATION_MS);

  const [statusId, pricingRateId] = await Promise.all([
    resolveOrCreateSessionStatusId(PENDING_APPROVAL_STATUS_NAME),
    resolveOrCreatePricingRateId(pricePerHour),
  ]);

  return createSessionWithBusinessRules(
    {
      studioId: Number(studioId),
      startTime,
      endTime,
      modalityId: Number(modalityId),
      pricingRateId,
      statusId,
      teacherIds: [requestedByUserId],
      maxParticipants: Number(capacity),
      isExternal: Boolean(isExternal),
      isOutsideStdHours: Boolean(isOutsideStdHours),
      reviewNotes: null,
    },
    requestedByUserId
  );
}

async function createBooking({ teacherId, studioId, modalityId, startTime, endTime, maxParticipants, notes }, studentUserId) {
  const parsedTeacherId = toPositiveInt(teacherId);
  const parsedStudioId = toPositiveInt(studioId);
  const parsedModalityId = toPositiveInt(modalityId);

  if (!parsedTeacherId || !parsedStudioId || !parsedModalityId) {
    throw createHttpError(400, 'teacherId, studioId e modalityId são obrigatórios');
  }

  const startDt = new Date(startTime);
  const endDt = new Date(endTime);

  if (Number.isNaN(startDt.getTime()) || Number.isNaN(endDt.getTime()) || endDt <= startDt) {
    throw createHttpError(400, 'Intervalo temporal inválido');
  }

  const studentAccount = await prisma.studentAccount.findUnique({
    where: { UserID: studentUserId },
    select: { StudentAccountID: true },
  });

  if (!studentAccount) throw createHttpError(404, 'Conta de aluno não encontrada');

  const [pendingStatus, defaultPricingRate, attendanceStatus] = await Promise.all([
    prisma.sessionStatus.findFirst({
      where: { StatusName: { contains: 'Pending' } },
      select: { StatusID: true },
    }),
    prisma.sessionPricingRate.findFirst({
      orderBy: { PricingRateID: 'asc' },
      select: { PricingRateID: true },
    }),
    prisma.attendanceStatus.findFirst({
      select: { AttendanceStatusID: true },
    }),
  ]);

  if (!pendingStatus) throw createHttpError(500, 'Estado de sessão "Pending" não configurado');
  if (!defaultPricingRate) throw createHttpError(500, 'Nenhuma tabela de preços configurada');
  if (!attendanceStatus) throw createHttpError(500, 'Estado de presença não configurado');

  const session = await createSessionWithBusinessRules(
    {
      teacherIds: [parsedTeacherId],
      studioId: parsedStudioId,
      modalityId: parsedModalityId,
      startTime: startDt,
      endTime: endDt,
      statusId: pendingStatus.StatusID,
      pricingRateId: defaultPricingRate.PricingRateID,
      maxParticipants: maxParticipants ? Number(maxParticipants) : undefined,
      isExternal: false,
      isOutsideStdHours: false,
      reviewNotes: notes ? String(notes).slice(0, 255) : null,
    },
    studentUserId
  );

  await prisma.sessionStudent.create({
    data: {
      SessionID: session.SessionID,
      StudentAccountID: studentAccount.StudentAccountID,
      EnrolledAt: new Date(),
      AttendanceStatusID: attendanceStatus.AttendanceStatusID,
    },
  });

  return session;
}

async function cancelBooking(sessionId, studentUserId, justification) {
  const trimmedJustification = String(justification || '').trim();
  if (!trimmedJustification) {
    throw createHttpError(400, 'Justificação é obrigatória para cancelar uma sessão (BR-17)');
  }

  const studentAccount = await prisma.studentAccount.findUnique({
    where: { UserID: studentUserId },
    select: { StudentAccountID: true },
  });

  if (!studentAccount) throw createHttpError(404, 'Conta de aluno não encontrada');

  const session = await prisma.coachingSession.findUnique({
    where: { SessionID: sessionId },
    include: {
      SessionStatus: { select: { StatusName: true } },
      SessionStudent: {
        where: { StudentAccountID: studentAccount.StudentAccountID },
      },
    },
  });

  if (!session) throw createHttpError(404, 'Sessão não encontrada');

  const isEnrolled = session.SessionStudent.length > 0;
  const isRequester = session.RequestedByUserID === studentUserId;

  if (!isEnrolled && !isRequester) {
    throw createHttpError(403, 'Não tem permissão para cancelar esta sessão');
  }

  const statusName = String(session.SessionStatus?.StatusName || '').toLowerCase();

  if (statusName.includes('complet') || statusName.includes('cancel') || statusName.includes('final')) {
    throw createHttpError(409, 'Esta sessão não pode ser cancelada');
  }

  const cancelledStatus = await prisma.sessionStatus.findFirst({
    where: { StatusName: { contains: 'Cancel' } },
    select: { StatusID: true },
  });

  if (!cancelledStatus) throw createHttpError(500, 'Estado de cancelamento não configurado');

  const updated = await prisma.coachingSession.update({
    where: { SessionID: sessionId },
    data: {
      StatusID: cancelledStatus.StatusID,
      CancellationReason: trimmedJustification.slice(0, 255),
    },
    include: {
      SessionStatus: { select: { StatusName: true } },
    },
  });

  return {
    sessionId: updated.SessionID,
    status: updated.SessionStatus?.StatusName,
    cancellationReason: updated.CancellationReason,
  };
}

async function confirmCompletion(sessionId, studentUserId) {
  const studentAccount = await prisma.studentAccount.findUnique({
    where: { UserID: studentUserId },
    select: { StudentAccountID: true },
  });

  if (!studentAccount) throw createHttpError(404, 'Conta de aluno não encontrada');

  const session = await prisma.coachingSession.findUnique({
    where: { SessionID: sessionId },
    include: {
      SessionStatus: { select: { StatusName: true } },
      SessionStudent: {
        where: { StudentAccountID: studentAccount.StudentAccountID },
      },
      SessionValidation: {
        include: {
          User: {
            select: {
              UserRole: { select: { Role: { select: { RoleName: true } } } },
            },
          },
        },
      },
    },
  });

  if (!session) throw createHttpError(404, 'Sessão não encontrada');

  if (session.SessionStudent.length === 0) {
    throw createHttpError(403, 'Não está inscrito nesta sessão');
  }

  if (new Date(session.EndTime) > new Date()) {
    throw createHttpError(409, 'A sessão ainda não terminou');
  }

  const statusName = String(session.SessionStatus?.StatusName || '').toLowerCase();
  if (statusName.includes('cancel')) {
    throw createHttpError(409, 'Não é possível confirmar uma sessão cancelada');
  }

  const alreadyConfirmedByThisStudent = session.SessionValidation.some(
    (sv) =>
      sv.ValidatedByUserID === studentUserId &&
      sv.User.UserRole.some((ur) => (ur.Role?.RoleName || '').toLowerCase() === 'student')
  );

  if (alreadyConfirmedByThisStudent) {
    throw createHttpError(409, 'Já confirmou esta sessão');
  }

  const studentStepId = await getOrCreateValidationStep('StudentConfirmation', ['student']);

  const validation = await prisma.sessionValidation.create({
    data: {
      SessionID: sessionId,
      ValidatedByUserID: studentUserId,
      ValidatedAt: new Date(),
      ValidationStepID: studentStepId,
    },
    select: {
      ValidationID: true,
      SessionID: true,
      ValidatedAt: true,
      ValidationStep: { select: { StepName: true } },
    },
  });

  return {
    validationId: validation.ValidationID,
    sessionId: validation.SessionID,
    step: validation.ValidationStep?.StepName,
    validatedAt: validation.ValidatedAt,
  };
}

async function getSessionHistory(studentUserId) {
  const studentAccount = await prisma.studentAccount.findUnique({
    where: { UserID: studentUserId },
    select: { StudentAccountID: true },
  });

  if (!studentAccount) throw createHttpError(404, 'Conta de aluno não encontrada');

  const sessions = await prisma.coachingSession.findMany({
    where: {
      SessionStudent: {
        some: { StudentAccountID: studentAccount.StudentAccountID },
      },
    },
    include: {
      SessionStatus: { select: { StatusName: true } },
      Studio: { select: { StudioName: true } },
      Modality: { select: { ModalityName: true } },
      SessionTeacher: {
        include: {
          User: { select: { UserID: true, FirstName: true, LastName: true } },
        },
      },
      SessionValidation: {
        include: {
          ValidationStep: { select: { StepName: true } },
          User: {
            select: {
              UserRole: { select: { Role: { select: { RoleName: true } } } },
            },
          },
        },
      },
      SessionStudent: {
        where: { StudentAccountID: studentAccount.StudentAccountID },
        include: { AttendanceStatus: { select: { StatusName: true } } },
      },
    },
    orderBy: { StartTime: 'desc' },
  });

  const now = new Date();

  return sessions.map((cs) => {
    const studentValidated = cs.SessionValidation.some(
      (sv) =>
        sv.ValidatedByUserID === studentUserId &&
        sv.User.UserRole.some((ur) => (ur.Role?.RoleName || '').toLowerCase() === 'student')
    );

    const statusName = String(cs.SessionStatus?.StatusName || '').toLowerCase();
    const isCancelled = statusName.includes('cancel');
    const isPast = cs.EndTime < now;

    return {
      sessionId: cs.SessionID,
      startTime: cs.StartTime,
      endTime: cs.EndTime,
      status: cs.SessionStatus?.StatusName,
      studioName: cs.Studio?.StudioName,
      modalityName: cs.Modality?.ModalityName,
      finalPrice: cs.FinalPrice,
      cancellationReason: cs.CancellationReason,
      attendanceStatus: cs.SessionStudent[0]?.AttendanceStatus?.StatusName,
      teachers: cs.SessionTeacher.map((st) => ({
        teacherId: st.User.UserID,
        name: [st.User.FirstName, st.User.LastName].filter(Boolean).join(' '),
      })),
      isPast,
      studentConfirmed: studentValidated,
      canConfirm: isPast && !studentValidated && !isCancelled,
      canCancel: !isPast && !isCancelled,
    };
  });
}

module.exports = {
  createSessionInitiative,
  cancelBooking,
  confirmCompletion,
  createBooking,
  getAvailableSlots,
  getCompatibleStudios,
  getSessionHistory,
};
