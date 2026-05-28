/**
 * @file src/services/coachingRequest.service.js
 */

const prisma = require('../config/prisma');
const { createSessionWithBusinessRules } = require('./session.service');
const coachingService = require('./coaching.service');
const { createHttpError } = require('../utils/http-error');

const REQUEST_STATUS = Object.freeze({
  PENDING_TEACHER_REVIEW: 'PENDING_TEACHER_REVIEW',
  PENDING_STUDENT_CONFIRMATION: 'PENDING_STUDENT_CONFIRMATION',
  PENDING_ADMIN_APPROVAL: 'PENDING_ADMIN_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
});

const ACTIVE_REQUEST_STATUSES = new Set([
  REQUEST_STATUS.PENDING_TEACHER_REVIEW,
  REQUEST_STATUS.PENDING_STUDENT_CONFIRMATION,
  REQUEST_STATUS.PENDING_ADMIN_APPROVAL,
]);

function toPositiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeRole(value) {
  return String(value || '').trim().toLowerCase();
}

function trimNullable(value, max = 255) {
  const trimmed = String(value || '').trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function normalizeStatusName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value || '').split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function extractClock(dateValue) {
  return new Date(dateValue).toISOString().slice(11, 16);
}

function formatTimeRange(startValue, endValue) {
  return `${extractClock(startValue)}-${extractClock(endValue)}`;
}

function parseIsoDate(value, message) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw createHttpError(400, message);
  }
  return date;
}

function getWeekRange(weekStart) {
  const start = parseIsoDate(weekStart, 'weekStart invalido');
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
}

function normalizeSegment(segment) {
  const startMinutes = timeToMinutes(segment.startTime);
  const endMinutes = timeToMinutes(segment.endTime);
  if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) return null;
  return {
    startTime: segment.startTime,
    endTime: segment.endTime,
    startMinutes,
    endMinutes,
  };
}

function mergeSegments(segments) {
  const normalized = segments
    .map(normalizeSegment)
    .filter(Boolean)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  const merged = [];
  for (const segment of normalized) {
    const last = merged[merged.length - 1];
    if (!last || segment.startMinutes > last.endMinutes) {
      merged.push({ ...segment });
      continue;
    }

    if (segment.endMinutes > last.endMinutes) {
      last.endMinutes = segment.endMinutes;
      last.endTime = segment.endTime;
    }
  }

  return merged.map(({ startTime, endTime }) => ({ startTime, endTime }));
}

function getDefaultSchoolSegments(dayOfWeek) {
  if (dayOfWeek >= 1 && dayOfWeek <= 6) {
    return [{ startTime: '09:00', endTime: '23:00' }];
  }
  return [];
}

async function findTeacherUnavailability({ tx = prisma, teacherId, startTime, endTime }) {
  const queryEndTime = endTime || new Date(startTime.getTime() + 1);
  return tx.teacherAbsence.findMany({
    where: {
      TeacherID: teacherId,
      StartDate: { lt: queryEndTime },
      EndDate: { gt: startTime },
      NOT: {
        OR: [
          { TeacherAbsenceStatus: { StatusName: { contains: 'rejected' } } },
          { TeacherAbsenceStatus: { StatusName: { contains: 'rejeitado' } } },
        ],
      },
    },
    include: {
      TeacherAbsenceStatus: { select: { StatusName: true } },
    },
    orderBy: [{ StartDate: 'asc' }, { AbsenceID: 'asc' }],
  });
}

async function ensureTeacherAvailableForRequest(tx, teacherId, startTime, endTime) {
  const conflicts = await findTeacherUnavailability({ tx, teacherId, startTime, endTime });

  if (conflicts.length > 0) {
    throw createHttpError(409, 'O professor não está disponível nessa hora', {
      teacherId,
      absences: conflicts.map((absence) => ({
        absenceId: absence.AbsenceID,
        startDate: absence.StartDate,
        endDate: absence.EndDate,
        reason: absence.Reason,
        status: absence.TeacherAbsenceStatus?.StatusName || null,
      })),
    });
  }
}

function mapUnavailability(absence) {
  return {
    absenceId: absence.AbsenceID,
    startDate: absence.StartDate,
    endDate: absence.EndDate,
    reason: absence.Reason,
    status: absence.TeacherAbsenceStatus?.StatusName || null,
    label: `Indisponível ${formatTimeRange(absence.StartDate, absence.EndDate)}${absence.Reason ? ` · ${absence.Reason}` : ''}`,
  };
}

async function buildSchoolScheduleDays({ weekStart, academicYearId }) {
  const { start, end } = getWeekRange(weekStart);

  const scheduleEntries = await prisma.schoolSchedule.findMany({
    where: {
      AcademicYearID: academicYearId,
      IsActive: true,
      StartsAt: { lt: end },
      EndsAt: { gt: start },
    },
    select: { StartsAt: true, EndsAt: true },
    orderBy: { StartsAt: 'asc' },
  });

  const hasScheduleEntries = scheduleEntries.length > 0;
  const days = [];

  for (let offset = 0; offset < 6; offset += 1) {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + offset);
    const dateKey = date.toISOString().slice(0, 10);
    const dayStart = new Date(`${dateKey}T00:00:00.000Z`);
    const dayEnd = new Date(`${dateKey}T23:59:59.999Z`);

    const segments = scheduleEntries
      .filter((entry) => entry.StartsAt < dayEnd && entry.EndsAt > dayStart)
      .map((entry) => ({
        startTime: extractClock(entry.StartsAt),
        endTime: extractClock(entry.EndsAt),
      }));

    const fallbackSegments = hasScheduleEntries ? [] : getDefaultSchoolSegments(date.getUTCDay());

    days.push({
      date: dateKey,
      dayOfWeek: date.getUTCDay(),
      segments: mergeSegments(segments.length > 0 ? segments : fallbackSegments),
      bookedSessions: [],
    });
  }

  return {
    weekStart: start.toISOString().slice(0, 10),
    weekEnd: end.toISOString().slice(0, 10),
    days,
  };
}

function splitFreeSegments(windowRecord) {
  const segments = [];
  const bookings = [...(windowRecord.bookedSessions || [])].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  let cursorTime = windowRecord.windowStart;
  let cursorMinutes = timeToMinutes(cursorTime);
  const windowEndMinutes = timeToMinutes(windowRecord.windowEnd);

  for (const booking of bookings) {
    const bookingStartMinutes = timeToMinutes(extractClock(booking.startTime));
    const bookingEndMinutes = timeToMinutes(extractClock(booking.endTime));

    if (cursorMinutes != null && bookingStartMinutes != null && bookingStartMinutes > cursorMinutes) {
      segments.push({
        startTime: cursorTime,
        endTime: extractClock(booking.startTime),
      });
    }

    if (bookingEndMinutes != null && cursorMinutes != null && bookingEndMinutes > cursorMinutes) {
      cursorMinutes = bookingEndMinutes;
      cursorTime = extractClock(booking.endTime);
    }
  }

  if (cursorMinutes != null && windowEndMinutes != null && cursorMinutes < windowEndMinutes) {
    segments.push({
      startTime: cursorTime,
      endTime: windowRecord.windowEnd,
    });
  }

  return segments.filter((segment) => segment.startTime < segment.endTime);
}

function mapRequestAction(action) {
  return {
    requestActionId: action.RequestActionID,
    actionType: action.ActionType,
    previousStatus: action.PreviousStatus,
    nextStatus: action.NextStatus,
    message: action.Message,
    proposedStartTime: action.ProposedStartTime,
    proposedEndTime: action.ProposedEndTime,
    createdAt: action.CreatedAt,
    actor: action.User
      ? {
          userId: action.User.UserID,
          firstName: action.User.FirstName,
          lastName: action.User.LastName,
          email: action.User.Email,
        }
      : null,
  };
}

function mapRequest(record) {
  return {
    requestId: record.RequestID,
    studentUserId: record.StudentUserID,
    teacherUserId: record.TeacherUserID,
    requestedByUserId: record.RequestedByUserID,
    modalityId: record.ModalityID,
    modalityName: record.Modality?.ModalityName || null,
    studioId: record.StudioID,
    studioName: record.Studio?.StudioName || null,
    confirmedSessionId: record.ConfirmedSessionID,
    preferredStartTime: record.PreferredStartTime,
    preferredEndTime: record.PreferredEndTime,
    currentStartTime: record.CurrentStartTime,
    currentEndTime: record.CurrentEndTime,
    suggestedStartTime: record.SuggestedStartTime,
    suggestedEndTime: record.SuggestedEndTime,
    status: record.Status,
    requestNotes: record.RequestNotes,
    teacherResponseNotes: record.TeacherResponseNotes,
    studentResponseNotes: record.StudentResponseNotes,
    adminResponseNotes: record.AdminResponseNotes,
    requestedAt: record.RequestedAt,
    updatedAt: record.UpdatedAt,
    resolvedAt: record.ResolvedAt,
    student: record.StudentUser
      ? {
          userId: record.StudentUser.UserID,
          firstName: record.StudentUser.FirstName,
          lastName: record.StudentUser.LastName,
          email: record.StudentUser.Email,
          photo: record.StudentUser.Photo || null,
        }
      : null,
    teacher: record.TeacherUser
      ? {
          userId: record.TeacherUser.UserID,
          firstName: record.TeacherUser.FirstName,
          lastName: record.TeacherUser.LastName,
          email: record.TeacherUser.Email,
          photo: record.TeacherUser.Photo || null,
        }
      : null,
    actions: Array.isArray(record.CoachingRequestAction)
      ? record.CoachingRequestAction.map(mapRequestAction)
      : [],
  };
}

async function createRequestAction(tx, payload) {
  return tx.coachingRequestAction.create({
    data: {
      CoachingRequest: { connect: { RequestID: payload.requestId } },
      User: { connect: { UserID: payload.actorUserId } },
      ActionType: payload.actionType,
      PreviousStatus: payload.previousStatus || null,
      NextStatus: payload.nextStatus || null,
      Message: trimNullable(payload.message),
      ProposedStartTime: payload.proposedStartTime || null,
      ProposedEndTime: payload.proposedEndTime || null,
      CreatedAt: new Date(),
    },
  });
}

async function resolveScheduledStatusId(tx) {
  const statuses = await tx.sessionStatus.findMany({
    select: { StatusID: true, StatusName: true },
  });
  const existing = statuses.find((status) => normalizeStatusName(status.StatusName) === 'scheduled');

  if (existing) return existing.StatusID;

  const created = await tx.sessionStatus.create({
    data: { StatusName: 'Scheduled' },
    select: { StatusID: true },
  });
  return created.StatusID;
}

async function resolveDefaultPricingRateId(tx) {
  const rate = await tx.sessionPricingRate.findFirst({
    orderBy: { PricingRateID: 'asc' },
    select: { PricingRateID: true },
  });

  if (!rate) {
    throw createHttpError(500, 'Nenhuma tabela de preços configurada');
  }

  return rate.PricingRateID;
}

async function resolveDefaultAttendanceStatusId(tx) {
  const status = await tx.attendanceStatus.findFirst({
    orderBy: { AttendanceStatusID: 'asc' },
    select: { AttendanceStatusID: true },
  });

  if (!status) {
    throw createHttpError(500, 'Nenhum estado de presença configurado');
  }

  return status.AttendanceStatusID;
}

async function ensureStudentCanRequest(tx, studentUserId, modalityId) {
  const student = await tx.studentAccount.findUnique({
    where: { UserID: studentUserId },
    include: {
      User: { select: { UserID: true, IsActive: true, DeletedAt: true } },
      StudentAllowedModality: { select: { ModalityID: true } },
    },
  });

  if (!student || !student.User?.IsActive || student.User?.DeletedAt) {
    throw createHttpError(404, 'Conta de aluno não encontrada');
  }

  if (student.IsModalityLocked) {
    const allowed = new Set(student.StudentAllowedModality.map((item) => item.ModalityID));
    if (!allowed.has(modalityId)) {
      throw createHttpError(403, 'Esta modalidade não está disponível para o aluno');
    }
  }

  return student;
}

async function ensureTeacherMatchesModality(tx, teacherUserId, modalityId) {
  const teacher = await tx.user.findFirst({
    where: {
      UserID: teacherUserId,
      IsActive: true,
      DeletedAt: null,
      UserRole: {
        some: { Role: { RoleName: 'teacher' } },
      },
      TeacherModality: {
        some: { ModalityID: modalityId },
      },
    },
    select: {
      UserID: true,
      FirstName: true,
      LastName: true,
      Email: true,
      Photo: true,
    },
  });

  if (!teacher) {
    throw createHttpError(404, 'Professor não encontrado para a modalidade selecionada');
  }

  return teacher;
}

async function assertSchoolScheduleSlotAvailable({ startTime, endTime, academicYearId }) {
  const day = new Date(startTime).toISOString().slice(0, 10);
  const dayOfWeek = new Date(startTime).getUTCDay();
  const dayStart = new Date(`${day}T00:00:00.000Z`);
  const dayEnd = new Date(`${day}T23:59:59.999Z`);

  const scheduleEntries = await prisma.schoolSchedule.findMany({
    where: {
      AcademicYearID: academicYearId,
      IsActive: true,
      StartsAt: { lt: endTime },
      EndsAt: { gt: startTime },
    },
    select: { StartsAt: true, EndsAt: true },
  });

  const startClock = new Date(startTime).toISOString().slice(11, 16);
  const endClock = new Date(endTime).toISOString().slice(11, 16);
  const selectedStart = timeToMinutes(startClock);
  const selectedEnd = timeToMinutes(endClock);

  const segments = scheduleEntries
    .filter((entry) => entry.StartsAt < dayEnd && entry.EndsAt > dayStart)
    .map((entry) => ({
      startTime: extractClock(entry.StartsAt),
      endTime: extractClock(entry.EndsAt),
    }));

  const fallbackSegments = scheduleEntries.length > 0 ? [] : getDefaultSchoolSegments(dayOfWeek);
  const allSegments = mergeSegments(segments.length > 0 ? segments : fallbackSegments);

  const matches = allSegments.some((segment) => {
    const segmentStart = timeToMinutes(segment.startTime);
    const segmentEnd = timeToMinutes(segment.endTime);
    if (segmentStart == null || segmentEnd == null || selectedStart == null || selectedEnd == null) return false;
    return selectedStart >= segmentStart && selectedEnd <= segmentEnd;
  });

  if (!matches) {
    throw createHttpError(409, 'Horario fora do horario escolar');
  }
}

async function findCompatibleStudio(tx, modalityId, startTime, endTime) {
  const studios = await tx.studio.findMany({
    where: {
      StudioModality: {
        some: { ModalityID: modalityId },
      },
    },
    select: { StudioID: true, StudioName: true, Capacity: true },
    orderBy: [{ Capacity: 'asc' }, { StudioName: 'asc' }],
  });

  for (const studio of studios) {
    const overlapCount = await tx.coachingSession.count({
      where: {
        StudioID: studio.StudioID,
        StartTime: { lt: endTime },
        EndTime: { gt: startTime },
      },
    });

    if (overlapCount === 0) {
      return studio;
    }
  }

  throw createHttpError(409, 'Nenhum estúdio compatível está disponível para este horário');
}

async function getCompatibleStudiosForRequest(requestId, adminUserId) {
  const request = await loadRequestForActor({ requestId, actorUserId: adminUserId, actorRole: 'admin' });

  if (!request.CurrentStartTime || !request.CurrentEndTime) {
    throw createHttpError(400, 'O pedido precisa de um horário completo antes de selecionar estúdio');
  }

  const startTime = new Date(request.CurrentStartTime);
  const endTime = new Date(request.CurrentEndTime);

  const dayStart = new Date(startTime);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  // Window for "nearby" context: 2 hours before and after
  const contextStart = new Date(startTime.getTime() - 2 * 60 * 60 * 1000);
  const contextEnd = new Date(endTime.getTime() + 2 * 60 * 60 * 1000);

  const studios = await prisma.studio.findMany({
    where: { StudioModality: { some: { ModalityID: request.ModalityID } } },
    select: { StudioID: true, StudioName: true, Capacity: true },
    orderBy: [{ Capacity: 'asc' }, { StudioName: 'asc' }],
  });

  const result = await Promise.all(studios.map(async (studio) => {
    const [conflictCount, dailyCount, nearbyCount] = await Promise.all([
      prisma.coachingSession.count({
        where: {
          StudioID: studio.StudioID,
          StartTime: { lt: endTime },
          EndTime: { gt: startTime },
        },
      }),
      prisma.coachingSession.count({
        where: {
          StudioID: studio.StudioID,
          StartTime: { lt: dayEnd },
          EndTime: { gt: dayStart },
        },
      }),
      prisma.coachingSession.count({
        where: {
          StudioID: studio.StudioID,
          StartTime: { lt: contextEnd },
          EndTime: { gt: contextStart },
        },
      }),
    ]);

    return {
      studioId: studio.StudioID,
      studioName: studio.StudioName,
      capacity: studio.Capacity,
      isAvailable: conflictCount === 0,
      conflictCount,
      dailySessionCount: dailyCount,
      nearbySessionCount: nearbyCount,
    };
  }));

  return result;
}

function buildRequestAccessWhere({ requestId, actorUserId, actorRole }) {
  const role = normalizeRole(actorRole);

  if (role === 'admin') {
    return { RequestID: requestId };
  }

  if (role === 'teacher') {
    return { RequestID: requestId, TeacherUserID: actorUserId };
  }

  return { RequestID: requestId, StudentUserID: actorUserId };
}

async function loadRequestForActor({ requestId, actorUserId, actorRole, tx = prisma }) {
  const request = await tx.coachingRequest.findFirst({
    where: buildRequestAccessWhere({ requestId, actorUserId, actorRole }),
    include: {
      Modality: { select: { ModalityID: true, ModalityName: true } },
      Studio: { select: { StudioID: true, StudioName: true, Capacity: true } },
      StudentUser: { select: { UserID: true, FirstName: true, LastName: true, Email: true, Photo: true } },
      TeacherUser: { select: { UserID: true, FirstName: true, LastName: true, Email: true, Photo: true } },
      CoachingRequestAction: {
        include: {
          User: { select: { UserID: true, FirstName: true, LastName: true, Email: true } },
        },
        orderBy: { CreatedAt: 'asc' },
      },
    },
  });

  if (!request) {
    throw createHttpError(404, 'Pedido de coaching não encontrado');
  }

  return request;
}

async function listModalities({ studentUserId = null } = {}) {
  let where = undefined;

  if (toPositiveInt(studentUserId)) {
    const student = await prisma.studentAccount.findUnique({
      where: { UserID: Number(studentUserId) },
      select: {
        IsModalityLocked: true,
        StudentAllowedModality: { select: { ModalityID: true } },
      },
    });

    if (student?.IsModalityLocked) {
      where = {
        ModalityID: { in: student.StudentAllowedModality.map((item) => item.ModalityID) },
      };
    }
  }

  const modalities = await prisma.modality.findMany({
    where,
    select: { ModalityID: true, ModalityName: true },
    orderBy: { ModalityName: 'asc' },
  });

  return modalities.map((item) => ({
    modalityId: item.ModalityID,
    modalityName: item.ModalityName,
  }));
}

async function listTeachersByModality({ modalityId }) {
  const parsedModalityId = toPositiveInt(modalityId);
  if (!parsedModalityId) {
    throw createHttpError(400, 'modalityId inválido');
  }

  const teachers = await prisma.user.findMany({
    where: {
      IsActive: true,
      DeletedAt: null,
      UserRole: { some: { Role: { RoleName: 'teacher' } } },
      TeacherModality: { some: { ModalityID: parsedModalityId } },
    },
    select: {
      UserID: true,
      FirstName: true,
      LastName: true,
      Email: true,
      Photo: true,
      TeacherModality: {
        select: {
          ModalityID: true,
          Modality: { select: { ModalityName: true } },
        },
      },
    },
    orderBy: [{ FirstName: 'asc' }, { LastName: 'asc' }],
  });

  return teachers.map((teacher) => ({
    teacherId: teacher.UserID,
    firstName: teacher.FirstName,
    lastName: teacher.LastName,
    name: [teacher.FirstName, teacher.LastName].filter(Boolean).join(' '),
    email: teacher.Email,
    photo: teacher.Photo || null,
    modalityIds: teacher.TeacherModality.map((item) => item.ModalityID),
    modalities: teacher.TeacherModality.map((item) => ({
      modalityId: item.ModalityID,
      modalityName: item.Modality.ModalityName,
    })),
  }));
}

async function getTeacherWeeklyAvailability({ teacherId, modalityId, weekStart, authenticatedUserId }) {
  const parsedTeacherId = toPositiveInt(teacherId);
  const parsedModalityId = toPositiveInt(modalityId);

  if (!parsedTeacherId || !parsedModalityId) {
    throw createHttpError(400, 'teacherId e modalityId são obrigatórios');
  }

  const teacher = await prisma.user.findFirst({
    where: {
      UserID: parsedTeacherId,
      IsActive: true,
      DeletedAt: null,
      UserRole: { some: { Role: { RoleName: 'teacher' } } },
      TeacherModality: { some: { ModalityID: parsedModalityId } },
    },
    select: {
      UserID: true,
      FirstName: true,
      LastName: true,
      TeacherModality: { select: { ModalityID: true } },
    },
  });

  if (!teacher) {
    throw createHttpError(404, 'Professor não encontrado');
  }

  const activeYear = await prisma.academicYear.findFirst({
    where: { IsActive: true },
    select: { AcademicYearID: true },
  });

  if (!activeYear) {
    throw createHttpError(503, 'Nenhum ano letivo ativo encontrado');
  }

  const schedule = await buildSchoolScheduleDays({
    weekStart: weekStart || new Date().toISOString().slice(0, 10),
    academicYearId: activeYear.AcademicYearID,
  });

  const rangeStart = new Date(`${schedule.weekStart}T00:00:00.000Z`);
  const rangeEnd = new Date(`${schedule.weekEnd}T00:00:00.000Z`);

  const [absences, bookedSessions] = await Promise.all([
    findTeacherUnavailability({
      teacherId: parsedTeacherId,
      startTime: rangeStart,
      endTime: rangeEnd,
    }),
    prisma.coachingSession.findMany({
      where: {
        StartTime: { lt: rangeEnd },
        EndTime: { gt: rangeStart },
        SessionTeacher: { some: { TeacherID: parsedTeacherId } },
      },
      select: {
        SessionID: true,
        StartTime: true,
        EndTime: true,
        SessionStatus: { select: { StatusName: true } },
      },
      orderBy: { StartTime: 'asc' },
    }),
  ]);

  return {
    weekStart: schedule.weekStart,
    weekEnd: schedule.weekEnd,
    teacher: {
      teacherId: teacher.UserID,
      name: [teacher.FirstName, teacher.LastName].filter(Boolean).join(' '),
      modalityIds: teacher.TeacherModality.map((item) => item.ModalityID),
    },
    days: schedule.days.map((day) => {
      const dayStart = new Date(`${day.date}T00:00:00.000Z`);
      const dayEnd = new Date(dayStart);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

      const daySessions = bookedSessions
        .filter((s) => s.StartTime < dayEnd && s.EndTime > dayStart)
        .map((s) => ({
          sessionId: s.SessionID,
          startTime: s.StartTime,
          endTime: s.EndTime,
          status: s.SessionStatus?.StatusName || null,
          label: `Aula marcada ${formatTimeRange(s.StartTime, s.EndTime)}`,
        }));

      return {
        ...day,
        unavailabilities: absences
          .filter((absence) => absence.StartDate < dayEnd && absence.EndDate > dayStart)
          .map(mapUnavailability),
        bookedSessions: daySessions,
      };
    }),
  };
}

async function createCoachingRequest({ studentUserId, payload }) {
  const teacherUserId = toPositiveInt(payload.teacherId);
  const modalityId = toPositiveInt(payload.modalityId);
  const startTime = new Date(payload.startTime);
  const hasEndTime = payload.endTime != null && String(payload.endTime).trim() !== '';
  const endTime = hasEndTime ? new Date(payload.endTime) : null;

  if (!teacherUserId || !modalityId) {
    throw createHttpError(400, 'teacherId e modalityId são obrigatórios');
  }

  if (Number.isNaN(startTime.getTime())) {
    throw createHttpError(400, 'Intervalo temporal inválido');
  }

  if (hasEndTime && (Number.isNaN(endTime.getTime()) || endTime <= startTime)) {
    throw createHttpError(400, 'Intervalo temporal inválido');
  }

  if (startTime.getTime() <= Date.now()) {
    throw createHttpError(400, 'Não é possível pedir um coaching para uma hora que já passou');
  }

  const activeYear = await prisma.academicYear.findFirst({
    where: { IsActive: true },
    select: { AcademicYearID: true },
  });

  if (!activeYear) {
    throw createHttpError(503, 'Nenhum ano letivo ativo encontrado');
  }

  return prisma.$transaction(async (tx) => {
    await ensureStudentCanRequest(tx, studentUserId, modalityId);
    await ensureTeacherMatchesModality(tx, teacherUserId, modalityId);

    const duplicate = await tx.coachingRequest.findFirst(
      hasEndTime
        ? {
            where: {
              StudentUserID: studentUserId,
              TeacherUserID: teacherUserId,
              Status: { in: [...ACTIVE_REQUEST_STATUSES] },
              CurrentStartTime: { lt: endTime },
              CurrentEndTime: { gt: startTime },
            },
            select: { RequestID: true },
          }
        : {
            where: {
              StudentUserID: studentUserId,
              TeacherUserID: teacherUserId,
              Status: { in: [...ACTIVE_REQUEST_STATUSES] },
              CurrentStartTime: startTime,
            },
            select: { RequestID: true },
          }
    );

    if (duplicate) {
      throw createHttpError(409, 'Já existe um pedido de coaching ativo para este horário');
    }

    let preferredEndTime = endTime;
    let currentEndTime = endTime;

    if (hasEndTime) {
      await assertSchoolScheduleSlotAvailable({
        startTime,
        endTime,
        academicYearId: activeYear.AcademicYearID,
      });
    } else {
      preferredEndTime = null;
      currentEndTime = null;
    }

    await ensureTeacherAvailableForRequest(tx, teacherUserId, startTime, currentEndTime);

    const now = new Date();
    const request = await tx.coachingRequest.create({
      data: {
        StudentUser: { connect: { UserID: studentUserId } },
        TeacherUser: { connect: { UserID: teacherUserId } },
        RequestedByUser: { connect: { UserID: studentUserId } },
        Modality: { connect: { ModalityID: modalityId } },
        PreferredStartTime: startTime,
        PreferredEndTime: preferredEndTime,
        CurrentStartTime: startTime,
        CurrentEndTime: currentEndTime,
        Status: REQUEST_STATUS.PENDING_TEACHER_REVIEW,
        RequestNotes: trimNullable(payload.notes),
        RequestedAt: now,
        UpdatedAt: now,
      },
      include: {
        Modality: { select: { ModalityID: true, ModalityName: true } },
        StudentUser: { select: { UserID: true, FirstName: true, LastName: true, Email: true, Photo: true } },
        TeacherUser: { select: { UserID: true, FirstName: true, LastName: true, Email: true, Photo: true } },
      },
    });

    await createRequestAction(tx, {
      requestId: request.RequestID,
      actorUserId: studentUserId,
      actionType: 'CREATED',
      previousStatus: null,
      nextStatus: REQUEST_STATUS.PENDING_TEACHER_REVIEW,
      message: payload.notes,
      proposedStartTime: startTime,
      proposedEndTime: currentEndTime,
    });

    return mapRequest({
      ...request,
      CoachingRequestAction: [],
    });
  });
}

async function listRequestsForStudent({ studentUserId }) {
  const requests = await prisma.coachingRequest.findMany({
    where: { StudentUserID: studentUserId },
    include: {
      Modality: { select: { ModalityID: true, ModalityName: true } },
      Studio: { select: { StudioID: true, StudioName: true, Capacity: true } },
      StudentUser: { select: { UserID: true, FirstName: true, LastName: true, Email: true, Photo: true } },
      TeacherUser: { select: { UserID: true, FirstName: true, LastName: true, Email: true, Photo: true } },
      CoachingRequestAction: {
        include: { User: { select: { UserID: true, FirstName: true, LastName: true, Email: true } } },
        orderBy: { CreatedAt: 'asc' },
      },
    },
    orderBy: [{ RequestedAt: 'desc' }, { RequestID: 'desc' }],
  });

  return requests.map(mapRequest);
}

async function listRequestsForTeacher({ teacherUserId, includeResolved = false }) {
  const where = includeResolved
    ? { TeacherUserID: teacherUserId }
    : { TeacherUserID: teacherUserId, Status: { in: [...ACTIVE_REQUEST_STATUSES] } };

  const requests = await prisma.coachingRequest.findMany({
    where,
    include: {
      Modality: { select: { ModalityID: true, ModalityName: true } },
      Studio: { select: { StudioID: true, StudioName: true, Capacity: true } },
      StudentUser: { select: { UserID: true, FirstName: true, LastName: true, Email: true, Photo: true } },
      TeacherUser: { select: { UserID: true, FirstName: true, LastName: true, Email: true, Photo: true } },
      CoachingRequestAction: {
        include: { User: { select: { UserID: true, FirstName: true, LastName: true, Email: true } } },
        orderBy: { CreatedAt: 'asc' },
      },
    },
    orderBy: [{ RequestedAt: 'desc' }, { RequestID: 'desc' }],
  });

  return requests.map(mapRequest);
}

async function listRequestsForAdmin({ includeResolved = false }) {
  const where = includeResolved
    ? undefined
    : { Status: REQUEST_STATUS.PENDING_ADMIN_APPROVAL };

  const requests = await prisma.coachingRequest.findMany({
    where,
    include: {
      Modality: { select: { ModalityID: true, ModalityName: true } },
      Studio: { select: { StudioID: true, StudioName: true, Capacity: true } },
      StudentUser: { select: { UserID: true, FirstName: true, LastName: true, Email: true, Photo: true } },
      TeacherUser: { select: { UserID: true, FirstName: true, LastName: true, Email: true, Photo: true } },
      CoachingRequestAction: {
        include: { User: { select: { UserID: true, FirstName: true, LastName: true, Email: true } } },
        orderBy: { CreatedAt: 'asc' },
      },
    },
    orderBy: [{ RequestedAt: 'desc' }, { RequestID: 'desc' }],
  });

  return requests.map(mapRequest);
}

async function getRequestById({ requestId, actorUserId, actorRole }) {
  const request = await loadRequestForActor({ requestId, actorUserId, actorRole });
  return mapRequest(request);
}

async function reviewRequestAsTeacher({ requestId, teacherUserId, payload }) {
  const decision = String(payload.decision || '').trim().toLowerCase();
  const notes = trimNullable(payload.notes);

  if (!['approve', 'suggest', 'reject'].includes(decision)) {
    throw createHttpError(400, 'Decisão do professor inválida');
  }

  return prisma.$transaction(async (tx) => {
    const request = await loadRequestForActor({
      requestId,
      actorUserId: teacherUserId,
      actorRole: 'teacher',
      tx,
    });

    if (request.Status !== REQUEST_STATUS.PENDING_TEACHER_REVIEW) {
      throw createHttpError(409, 'O pedido já não aguarda resposta do professor');
    }

    const now = new Date();
    let nextStatus = REQUEST_STATUS.PENDING_ADMIN_APPROVAL;
    let suggestedStartTime = null;
    let suggestedEndTime = null;
    let actionType = 'TEACHER_APPROVED';
    let currentStartTime = request.CurrentStartTime;
    let currentEndTime = request.CurrentEndTime;

    if (decision === 'suggest') {
      suggestedStartTime = new Date(payload.suggestedStartTime);
      suggestedEndTime = new Date(payload.suggestedEndTime);

      if (
        Number.isNaN(suggestedStartTime.getTime()) ||
        Number.isNaN(suggestedEndTime.getTime()) ||
        suggestedEndTime <= suggestedStartTime
      ) {
        throw createHttpError(400, 'Novo horário sugerido inválido');
      }

      const activeYear = await tx.academicYear.findFirst({
        where: { IsActive: true },
        select: { AcademicYearID: true },
      });

      if (!activeYear) {
        throw createHttpError(503, 'Nenhum ano letivo ativo encontrado');
      }

      await assertSchoolScheduleSlotAvailable({
        startTime: suggestedStartTime,
        endTime: suggestedEndTime,
        academicYearId: activeYear.AcademicYearID,
      });

      nextStatus = REQUEST_STATUS.PENDING_STUDENT_CONFIRMATION;
      actionType = 'TEACHER_SUGGESTED_TIME';
    }

    if (decision === 'approve' && (!currentEndTime || !currentStartTime)) {
      const approvedStartValue = payload.approvedStartTime ?? payload.suggestedStartTime ?? payload.startTime;
      const approvedEndValue = payload.approvedEndTime ?? payload.suggestedEndTime ?? payload.endTime;
      const approvedStartTime = approvedStartValue ? new Date(approvedStartValue) : null;
      const approvedEndTime = approvedEndValue ? new Date(approvedEndValue) : null;

      if (
        !approvedStartTime ||
        !approvedEndTime ||
        Number.isNaN(approvedStartTime.getTime()) ||
        Number.isNaN(approvedEndTime.getTime()) ||
        approvedEndTime <= approvedStartTime
      ) {
        throw createHttpError(400, 'O professor tem de definir um horário completo antes de aprovar este pedido');
      }

      const activeYear = await tx.academicYear.findFirst({
        where: { IsActive: true },
        select: { AcademicYearID: true },
      });

      if (!activeYear) {
        throw createHttpError(503, 'Nenhum ano letivo ativo encontrado');
      }

      await assertSchoolScheduleSlotAvailable({
        startTime: approvedStartTime,
        endTime: approvedEndTime,
        academicYearId: activeYear.AcademicYearID,
      });

      currentStartTime = approvedStartTime;
      currentEndTime = approvedEndTime;
    }

    if (decision === 'reject') {
      nextStatus = REQUEST_STATUS.REJECTED;
      actionType = 'TEACHER_REJECTED';
    }

    const updated = await tx.coachingRequest.update({
      where: { RequestID: requestId },
      data: {
        Status: nextStatus,
        CurrentStartTime: currentStartTime,
        CurrentEndTime: currentEndTime,
        SuggestedStartTime: suggestedStartTime,
        SuggestedEndTime: suggestedEndTime,
        TeacherResponseNotes: notes,
        UpdatedAt: now,
        ResolvedAt: nextStatus === REQUEST_STATUS.REJECTED ? now : null,
      },
      include: {
        Modality: { select: { ModalityID: true, ModalityName: true } },
        Studio: { select: { StudioID: true, StudioName: true, Capacity: true } },
        StudentUser: { select: { UserID: true, FirstName: true, LastName: true, Email: true, Photo: true } },
        TeacherUser: { select: { UserID: true, FirstName: true, LastName: true, Email: true, Photo: true } },
        CoachingRequestAction: {
          include: { User: { select: { UserID: true, FirstName: true, LastName: true, Email: true } } },
          orderBy: { CreatedAt: 'asc' },
        },
      },
    });

    await createRequestAction(tx, {
      requestId,
      actorUserId: teacherUserId,
      actionType,
      previousStatus: request.Status,
      nextStatus,
      message: notes,
      proposedStartTime: decision === 'suggest' ? suggestedStartTime : currentStartTime,
      proposedEndTime: decision === 'suggest' ? suggestedEndTime : currentEndTime,
    });

    return mapRequest(updated);
  });
}

async function respondToTeacherSuggestion({ requestId, studentUserId, payload }) {
  const decision = String(payload.decision || '').trim().toLowerCase();
  const notes = trimNullable(payload.notes);

  if (!['accept', 'reject'].includes(decision)) {
    throw createHttpError(400, 'Decisão do aluno inválida');
  }

  return prisma.$transaction(async (tx) => {
    const request = await loadRequestForActor({
      requestId,
      actorUserId: studentUserId,
      actorRole: 'student',
      tx,
    });

    if (request.Status !== REQUEST_STATUS.PENDING_STUDENT_CONFIRMATION) {
      throw createHttpError(409, 'Este pedido não aguarda resposta do aluno');
    }

    const now = new Date();
    const nextStatus = decision === 'accept'
      ? REQUEST_STATUS.PENDING_ADMIN_APPROVAL
      : REQUEST_STATUS.CANCELLED;

    const updated = await tx.coachingRequest.update({
      where: { RequestID: requestId },
      data: {
        Status: nextStatus,
        CurrentStartTime: decision === 'accept' ? request.SuggestedStartTime : request.CurrentStartTime,
        CurrentEndTime: decision === 'accept' ? request.SuggestedEndTime : request.CurrentEndTime,
        SuggestedStartTime: null,
        SuggestedEndTime: null,
        StudentResponseNotes: notes,
        UpdatedAt: now,
        ResolvedAt: nextStatus === REQUEST_STATUS.CANCELLED ? now : null,
      },
      include: {
        Modality: { select: { ModalityID: true, ModalityName: true } },
        Studio: { select: { StudioID: true, StudioName: true, Capacity: true } },
        StudentUser: { select: { UserID: true, FirstName: true, LastName: true, Email: true, Photo: true } },
        TeacherUser: { select: { UserID: true, FirstName: true, LastName: true, Email: true, Photo: true } },
        CoachingRequestAction: {
          include: { User: { select: { UserID: true, FirstName: true, LastName: true, Email: true } } },
          orderBy: { CreatedAt: 'asc' },
        },
      },
    });

    await createRequestAction(tx, {
      requestId,
      actorUserId: studentUserId,
      actionType: decision === 'accept' ? 'STUDENT_ACCEPTED_SUGGESTION' : 'STUDENT_REJECTED_SUGGESTION',
      previousStatus: request.Status,
      nextStatus,
      message: notes,
      proposedStartTime: decision === 'accept' ? request.SuggestedStartTime : null,
      proposedEndTime: decision === 'accept' ? request.SuggestedEndTime : null,
    });

    return mapRequest(updated);
  });
}

async function reviewRequestAsAdmin({ requestId, adminUserId, payload }) {
  const decision = String(payload.decision || '').trim().toLowerCase();
  const notes = trimNullable(payload.notes);

  if (!['approve', 'reject'].includes(decision)) {
    throw createHttpError(400, 'Decisão da administração inválida');
  }

  const request = await loadRequestForActor({
    requestId,
    actorUserId: adminUserId,
    actorRole: 'admin',
  });

  if (request.Status !== REQUEST_STATUS.PENDING_ADMIN_APPROVAL) {
    throw createHttpError(409, 'Este pedido não aguarda aprovação da direção');
  }

  if (!request.CurrentStartTime || !request.CurrentEndTime) {
    throw createHttpError(400, 'O pedido precisa de um horário completo antes da validação final');
  }

  const now = new Date();
  let confirmedSessionId = request.ConfirmedSessionID;
  let studioId = request.StudioID;
  let nextStatus = REQUEST_STATUS.REJECTED;

  if (decision === 'approve') {
    const requestedStudioId = toPositiveInt(payload.studioId);

    let studioPromise;
    if (requestedStudioId) {
      studioPromise = prisma.studio.findUnique({
        where: { StudioID: requestedStudioId },
        select: { StudioID: true, StudioName: true, Capacity: true },
      }).then((s) => {
        if (!s) throw createHttpError(404, 'Estúdio não encontrado');
        return s;
      });
    } else {
      studioPromise = findCompatibleStudio(
        prisma,
        request.ModalityID,
        request.CurrentStartTime,
        request.CurrentEndTime
      );
    }

    const [studentAccount, studio, scheduledStatusId, pricingRateId, attendanceStatusId] = await Promise.all([
      prisma.studentAccount.findUnique({
        where: { UserID: request.StudentUserID },
        select: { StudentAccountID: true },
      }),
      studioPromise,
      resolveScheduledStatusId(prisma),
      resolveDefaultPricingRateId(prisma),
      resolveDefaultAttendanceStatusId(prisma),
    ]);

    if (!studentAccount) {
      throw createHttpError(404, 'Conta de aluno não encontrada');
    }

    const session = await createSessionWithBusinessRules({
      studioId: studio.StudioID,
      startTime: request.CurrentStartTime,
      endTime: request.CurrentEndTime,
      modalityId: request.ModalityID,
      pricingRateId,
      statusId: scheduledStatusId,
      teacherIds: [request.TeacherUserID],
      maxParticipants: 1,
      isExternal: false,
      isOutsideStdHours: false,
      reviewNotes: null,
      skipTeacherAvailability: true,
    }, request.StudentUserID);

    await prisma.sessionStudent.create({
      data: {
        SessionID: session.SessionID,
        StudentAccountID: studentAccount.StudentAccountID,
        EnrolledAt: now,
        AttendanceStatusID: attendanceStatusId,
      },
    });

    confirmedSessionId = session.SessionID;
    studioId = studio.StudioID;
    nextStatus = REQUEST_STATUS.APPROVED;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.coachingRequest.update({
      where: { RequestID: requestId },
      data: {
        Status: nextStatus,
        StudioID: studioId,
        ConfirmedSessionID: confirmedSessionId,
        AdminResponseNotes: notes,
        UpdatedAt: now,
        ResolvedAt: now,
      },
      include: {
        Modality: { select: { ModalityID: true, ModalityName: true } },
        Studio: { select: { StudioID: true, StudioName: true, Capacity: true } },
        StudentUser: { select: { UserID: true, FirstName: true, LastName: true, Email: true, Photo: true } },
        TeacherUser: { select: { UserID: true, FirstName: true, LastName: true, Email: true, Photo: true } },
        CoachingRequestAction: {
          include: { User: { select: { UserID: true, FirstName: true, LastName: true, Email: true } } },
          orderBy: { CreatedAt: 'asc' },
        },
      },
    });

    await createRequestAction(tx, {
      requestId,
      actorUserId: adminUserId,
      actionType: decision === 'approve' ? 'ADMIN_APPROVED' : 'ADMIN_REJECTED',
      previousStatus: request.Status,
      nextStatus,
      message: notes,
      proposedStartTime: request.CurrentStartTime,
      proposedEndTime: request.CurrentEndTime,
    });

    return saved;
  });

  return mapRequest(updated);
}

module.exports = {
  REQUEST_STATUS,
  createCoachingRequest,
  getCompatibleStudiosForRequest,
  getRequestById,
  getTeacherWeeklyAvailability,
  listModalities,
  listRequestsForAdmin,
  listRequestsForStudent,
  listRequestsForTeacher,
  listTeachersByModality,
  respondToTeacherSuggestion,
  reviewRequestAsAdmin,
  reviewRequestAsTeacher,
};
