const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');

function toTimeOnlyDate(date) {
  return new Date(Date.UTC(
    1970,
    0,
    1,
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds()
  ));
}

function createHttpError(status, message, details) {
  const error = new Error(message);
  error.status = status;

  if (details) {
    error.details = details;
  }

  return error;
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

    const sessionCapacity = input.maxParticipants || studio.Capacity;
    if (sessionCapacity > Number(studio.Capacity || 0)) {
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
  createSessionWithBusinessRules,
};