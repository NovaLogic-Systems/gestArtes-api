/**
 * @file src/services/session.service.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');
const { createHttpError } = require('../utils/http-error');
const { toTimeOnlyDate, formatDateLabel } = require('../utils/date');

const DEFAULT_NOTIFICATION_TYPE_ID = 1;
const PENDING_SESSION_STATUS_CANDIDATES = ['pending'];
const CANCELLED_SESSION_STATUS_NAME = 'cancelled';

function normalizeStatusName(statusName) {
  return String(statusName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function buildApprovedAvailabilityStatusFilter() {
  return {
    OR: [
      { StatusName: { contains: 'approved' } },
      { StatusName: { contains: 'aprovado' } },
      { StatusName: { contains: 'validated' } },
      { StatusName: { contains: 'validado' } },
    ],
  };
}

function buildNotificationTitle(message) {
  const trimmed = String(message || '').trim();

  if (!trimmed) {
    return 'Nova notificacao';
  }

  return trimmed.length > 50 ? `${trimmed.slice(0, 50)}...` : trimmed;
}

function buildAbsenceCancellationMessage(startTime, endTime) {
  const startLabel = startTime instanceof Date ? formatDateLabel(startTime) : String(startTime || '');
  const endLabel = endTime instanceof Date ? formatDateLabel(endTime) : String(endTime || '');

  return `A tua reserva foi cancelada automaticamente porque o professor ficou indisponivel entre ${startLabel} e ${endLabel}.`;
}

function normalizeTeacherIds(teacherIds) {
  return [
    ...new Set(
      (teacherIds || [])
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    ),
  ];
}

async function ensureStudioModalityCompatibility(tx, studioId, modalityId) {
  const relation = await tx.studioModality.findUnique({
    where: {
      StudioID_ModalityID: {
        StudioID: studioId,
        ModalityID: modalityId,
      },
    },
  });

  if (!relation) {
    throw createHttpError(422, 'Estudio nao suporta a modalidade selecionada');
  }
}

async function ensureNoStudioOverlap(tx, studioId, startTime, endTime) {
  const count = await tx.coachingSession.count({
    where: {
      StudioID: studioId,
      StartTime: { lt: endTime },
      EndTime: { gt: startTime },
    },
  });

  if (count > 0) {
    throw createHttpError(409, 'Conflito de horario no estudio');
  }
}

async function ensureNoTeacherDoubleBooking(tx, teacherIds, startTime, endTime) {
  if (teacherIds.length === 0) {
    return;
  }

  const conflicts = await tx.sessionTeacher.findMany({
    where: {
      TeacherID: { in: teacherIds },
      CoachingSession: {
        is: {
          StartTime: { lt: endTime },
          EndTime: { gt: startTime },
        },
      },
    },
    select: { TeacherID: true },
  });

  if (conflicts.length > 0) {
    const teacherSet = [...new Set(conflicts.map((item) => item.TeacherID))];
    throw createHttpError(409, 'Professor ja tem sessao nesse horario', {
      teacherIds: teacherSet,
    });
  }
}

async function ensureStatusExists(tx, statusId) {
  const status = await tx.sessionStatus.findUnique({
    where: { StatusID: statusId },
    select: { StatusID: true },
  });

  if (!status) {
    throw createHttpError(422, 'Estado da sessao invalido');
  }
}

async function ensurePricingRateExists(tx, pricingRateId) {
  const pricingRate = await tx.sessionPricingRate.findUnique({
    where: { PricingRateID: pricingRateId },
    select: { PricingRateID: true },
  });

  if (!pricingRate) {
    throw createHttpError(422, 'Tabela de preco invalida');
  }
}

async function ensureAssignmentRoleExists(tx, assignmentRoleId) {
  const assignmentRole = await tx.teacherAssignmentRole.findUnique({
    where: { AssignmentRoleID: assignmentRoleId },
    select: { AssignmentRoleID: true },
  });

  if (!assignmentRole) {
    throw createHttpError(422, 'Papel de atribuicao invalido');
  }
}

async function ensureTeachersExistAndHaveTeacherRole(tx, teacherIds) {
  const teachers = await tx.user.findMany({
    where: {
      UserID: { in: teacherIds },
      UserRole: {
        some: {
          Role: {
            RoleName: 'teacher',
          },
        },
      },
    },
    select: { UserID: true },
  });

  const existingTeacherIds = new Set(teachers.map((teacher) => teacher.UserID));
  const invalidTeacherIds = teacherIds.filter((teacherId) => !existingTeacherIds.has(teacherId));

  if (invalidTeacherIds.length > 0) {
    throw createHttpError(422, 'Lista de professores invalida', {
      teacherIds: invalidTeacherIds,
    });
  }
}

async function ensureTeacherNotAbsent(tx, teacherId, startTime, endTime) {
  const total = await tx.teacherAbsence.count({
    where: {
      TeacherID: teacherId,
      StartDate: { lt: endTime },
      EndDate: { gt: startTime },
    },
  });

  if (total > 0) {
    throw createHttpError(409, 'Professor indisponivel por ausencia', { teacherId });
  }
}

async function ensureTeacherHasAvailability(tx, teacherId, startTime, endTime) {
  const dayOfWeek = startTime.getUTCDay();
  const startTimeOnly = toTimeOnlyDate(startTime);
  const endTimeOnly = toTimeOnlyDate(endTime);

  const [punctualTotal, recurringTotal] = await Promise.all([
    tx.teacherAvailability.count({
      where: {
        TeacherID: teacherId,
        TeacherAvailabilityStatus: buildApprovedAvailabilityStatusFilter(),
        TeacherAvailabilityPunctual: {
          is: {
            StartDateTime: { lte: startTime },
            EndDateTime: { gte: endTime },
          },
        },
      },
    }),
    tx.teacherAvailability.count({
      where: {
        TeacherID: teacherId,
        TeacherAvailabilityStatus: buildApprovedAvailabilityStatusFilter(),
        TeacherAvailabilityRecurring: {
          is: {
            IsActive: true,
            DayOfWeek: dayOfWeek,
            StartTime: { lte: startTimeOnly },
            EndTime: { gte: endTimeOnly },
          },
        },
      },
    }),
  ]);

  if (punctualTotal === 0 && recurringTotal === 0) {
    throw createHttpError(409, 'Professor sem disponibilidade para o horario selecionado', {
      teacherId,
    });
  }
}

async function resolveSessionStatusIds(tx, candidates, errorMessage) {
  const statuses = await tx.sessionStatus.findMany({
    select: {
      StatusID: true,
      StatusName: true,
    },
  });

  const statusIds = statuses
    .filter((status) => {
      const normalizedStatusName = normalizeStatusName(status.StatusName);
      return candidates.some((candidate) => normalizedStatusName.includes(candidate));
    })
    .map((status) => status.StatusID);

  const uniqueStatusIds = [...new Set(statusIds)];

  if (uniqueStatusIds.length === 0) {
    throw createHttpError(500, errorMessage);
  }

  return uniqueStatusIds;
}

async function resolveSessionStatusId(tx, candidate, errorMessage) {
  const statuses = await tx.sessionStatus.findMany({
    select: {
      StatusID: true,
      StatusName: true,
    },
  });

  const match = statuses.find(
    (status) => normalizeStatusName(status.StatusName) === normalizeStatusName(candidate)
  );

  if (!match) {
    throw createHttpError(500, errorMessage);
  }

  return match.StatusID;
}

async function cancelPendingBookingsForTeacherAbsence(tx, teacherId, startTime, endTime) {
  const pendingStatusIds = await resolveSessionStatusIds(
    tx,
    PENDING_SESSION_STATUS_CANDIDATES,
    'Estado de sessao pendente nao configurado'
  );
  const cancelledStatusId = await resolveSessionStatusId(
    tx,
    CANCELLED_SESSION_STATUS_NAME,
    'Estado de sessao cancelada nao configurado'
  );

  const sessions = await tx.coachingSession.findMany({
    where: {
      StatusID: {
        in: pendingStatusIds,
      },
      StartTime: { lt: endTime },
      EndTime: { gt: startTime },
      SessionTeacher: {
        some: {
          TeacherID: teacherId,
        },
      },
    },
    select: {
      SessionID: true,
      RequestedByUserID: true,
      StartTime: true,
      EndTime: true,
      SessionStudent: {
        select: {
          StudentAccount: {
            select: {
              UserID: true,
            },
          },
        },
      },
    },
  });

  if (sessions.length === 0) {
    return {
      cancelledSessionCount: 0,
      notificationCount: 0,
    };
  }

  const sessionIds = sessions.map((session) => session.SessionID);
  const cancellationReason = 'Cancelamento automatico por indisponibilidade do professor';

  await tx.coachingSession.updateMany({
    where: {
      SessionID: {
        in: sessionIds,
      },
    },
    data: {
      StatusID: cancelledStatusId,
      CancellationReason: cancellationReason,
    },
  });

  const notifications = [];

  for (const session of sessions) {
    const recipientIds = new Set([
      session.RequestedByUserID,
      ...session.SessionStudent
        .map((entry) => entry?.StudentAccount?.UserID)
        .filter((userId) => Number.isInteger(userId) && userId > 0),
    ]);
    const message = buildAbsenceCancellationMessage(session.StartTime, session.EndTime);
    const title = buildNotificationTitle(message);
    const now = new Date();

    for (const userId of recipientIds) {
      if (!Number.isInteger(userId) || userId <= 0) {
        continue;
      }

      notifications.push({
        UserID: userId,
        Message: message,
        TypeID: DEFAULT_NOTIFICATION_TYPE_ID,
        IsRead: false,
        CreatedAt: now,
        Title: title,
        SessionID: session.SessionID,
      });
    }
  }

  if (notifications.length > 0) {
    await tx.notification.createMany({ data: notifications });
  }

  return {
    cancelledSessionCount: sessions.length,
    notificationCount: notifications.length,
  };
}

async function createSessionWithBusinessRules(input, requestedByUserId) {
  const teacherIds = normalizeTeacherIds(input.teacherIds);
  const hasAssignmentRoleId = input.assignmentRoleId !== undefined && input.assignmentRoleId !== null;
  const parsedAssignmentRoleId = Number(input.assignmentRoleId);
  const assignmentRoleId = hasAssignmentRoleId ? parsedAssignmentRoleId : 1;

  if (hasAssignmentRoleId && (!Number.isInteger(parsedAssignmentRoleId) || parsedAssignmentRoleId <= 0)) {
    throw createHttpError(422, 'Papel de atribuicao invalido');
  }

  if (teacherIds.length === 0) {
    throw createHttpError(400, 'Lista de professores invalida');
  }

  const startTime = new Date(input.startTime);
  const endTime = new Date(input.endTime);
  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime()) || endTime <= startTime) {
    throw createHttpError(400, 'Intervalo temporal invalido');
  }

  return prisma.$transaction(async (tx) => {
    const studio = await tx.studio.findUnique({
      where: { StudioID: input.studioId },
      select: { StudioID: true, Capacity: true },
    });

    if (!studio) {
      throw createHttpError(404, 'Estudio nao encontrado');
    }

    const sessionCapacity = input.maxParticipants ?? studio.Capacity;
    if (Number(sessionCapacity) > Number(studio.Capacity || 0)) {
      throw createHttpError(409, 'Capacidade da sessao excede capacidade do estudio');
    }

    await ensureStatusExists(tx, input.statusId);
    await ensurePricingRateExists(tx, input.pricingRateId);
    await ensureAssignmentRoleExists(tx, assignmentRoleId);
    await ensureTeachersExistAndHaveTeacherRole(tx, teacherIds);
    await ensureStudioModalityCompatibility(tx, input.studioId, input.modalityId);
    await ensureNoStudioOverlap(tx, input.studioId, startTime, endTime);
    await ensureNoTeacherDoubleBooking(tx, teacherIds, startTime, endTime);

    for (const teacherId of teacherIds) {
      await ensureTeacherNotAbsent(tx, teacherId, startTime, endTime);
      await ensureTeacherHasAvailability(tx, teacherId, startTime, endTime);
    }

    const created = await tx.coachingSession.create({
      data: {
        StudioID: input.studioId,
        StartTime: startTime,
        EndTime: endTime,
        StatusID: input.statusId,
        RequestedByUserID: requestedByUserId,
        ModalityID: input.modalityId,
        MaxParticipants: sessionCapacity,
        IsExternal: Boolean(input.isExternal),
        IsOutsideStdHours: Boolean(input.isOutsideStdHours),
        CreatedAt: new Date(),
        PricingRateID: input.pricingRateId,
        ReviewNotes: input.reviewNotes || null,
      },
    });

    await tx.sessionTeacher.createMany({
      data: teacherIds.map((teacherId) => ({
        SessionID: created.SessionID,
        TeacherID: teacherId,
        AssignmentRoleID: assignmentRoleId,
      })),
    });

    return created;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

module.exports = {
  cancelPendingBookingsForTeacherAbsence,
  createSessionWithBusinessRules,
};
