const prisma = require('../config/prisma');

const PENDING_STATUS_NAME = 'Pending';

function createHttpError(status, message, details) {
  const error = new Error(message);
  error.status = status;

  if (details) {
    error.details = details;
  }

  return error;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeText(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeMode(value) {
  const normalized = String(value ?? '').trim().toLowerCase();

  if (['weekly', 'recurring', 'semana', 'semanal'].includes(normalized)) {
    return 'weekly';
  }

  if (['semester', 'punctual', 'semestre', 'pontual'].includes(normalized)) {
    return 'semester';
  }

  return null;
}

function toDate(value, message) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw createHttpError(400, message);
  }

  return date;
}

function toPositiveInteger(value, message) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createHttpError(400, message);
  }

  return parsed;
}

function toDayOfWeek(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 6) {
    throw createHttpError(400, 'Dia da semana invalido');
  }

  return parsed;
}

function toTimeOnlyDate(value, message) {
  const raw = value instanceof Date ? value : String(value ?? '').trim();

  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) {
      throw createHttpError(400, message);
    }

    return new Date(Date.UTC(
      1970,
      0,
      1,
      raw.getUTCHours(),
      raw.getUTCMinutes(),
      raw.getUTCSeconds(),
      raw.getUTCMilliseconds()
    ));
  }

  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(raw);

  if (!match) {
    throw createHttpError(400, message);
  }

  return new Date(Date.UTC(
    1970,
    0,
    1,
    Number(match[1]),
    Number(match[2]),
    Number(match[3] || 0),
    0
  ));
}

function formatTimeOnly(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(11, 19);
}

function detectMode(slot, defaultMode) {
  const explicitMode = normalizeMode(slot.mode ?? slot.availabilityMode ?? slot.type);

  if (explicitMode) {
    return explicitMode;
  }

  if (slot.startDateTime != null || slot.endDateTime != null || slot.startDate != null || slot.endDate != null) {
    return 'semester';
  }

  if (
    slot.dayOfWeek != null
    || slot.startTime != null
    || slot.endTime != null
    || slot.academicYearId != null
    || slot.isActive != null
  ) {
    return 'weekly';
  }

  return defaultMode;
}

function extractSlots(body) {
  if (Array.isArray(body?.slots) && body.slots.length > 0) {
    return body.slots.filter(isPlainObject);
  }

  if (isPlainObject(body?.slot)) {
    return [body.slot];
  }

  if (isPlainObject(body) && (
    body.startDateTime != null
    || body.endDateTime != null
    || body.startDate != null
    || body.endDate != null
    || body.dayOfWeek != null
    || body.startTime != null
    || body.endTime != null
    || body.academicYearId != null
    || body.isActive != null
  )) {
    return [body];
  }

  return [];
}

function normalizeAvailabilitySlot(slot, defaultMode) {
  const mode = detectMode(slot, defaultMode);

  if (!mode) {
    throw createHttpError(400, 'Modo de disponibilidade invalido');
  }

  if (mode === 'semester') {
    const startDateTime = toDate(slot.startDateTime ?? slot.startDate, 'Data de inicio invalida');
    const endDateTime = toDate(slot.endDateTime ?? slot.endDate, 'Data de fim invalida');

    if (endDateTime <= startDateTime) {
      throw createHttpError(400, 'Intervalo temporal invalido');
    }

    return {
      mode,
      startDateTime,
      endDateTime,
    };
  }

  const dayOfWeek = toDayOfWeek(slot.dayOfWeek);
  const startTime = toTimeOnlyDate(slot.startTime, 'Hora de inicio invalida');
  const endTime = toTimeOnlyDate(slot.endTime, 'Hora de fim invalida');
  const academicYearId = toPositiveInteger(slot.academicYearId, 'Ano letivo invalido');
  const isActive = slot.isActive == null ? true : Boolean(slot.isActive);

  if (endTime <= startTime) {
    throw createHttpError(400, 'Intervalo horario invalido');
  }

  return {
    mode,
    dayOfWeek,
    startTime,
    endTime,
    academicYearId,
    isActive,
  };
}

function normalizeAvailabilityPayload(body, { requireSlot = true } = {}) {
  const defaultMode = normalizeMode(body?.mode ?? body?.availabilityMode ?? body?.type);
  const notes = normalizeText(body?.notes);
  const slots = extractSlots(body).map((slot) => normalizeAvailabilitySlot(slot, defaultMode));

  if (requireSlot && slots.length === 0) {
    throw createHttpError(400, 'Slot de disponibilidade invalido');
  }

  return {
    notes,
    mode: defaultMode ?? slots[0]?.mode ?? null,
    slots,
  };
}

function normalizeExceptionPayload(body) {
  const startDate = toDate(body?.startDate ?? body?.startDateTime, 'Data de inicio invalida');
  const endDate = toDate(body?.endDate ?? body?.endDateTime, 'Data de fim invalida');

  if (endDate <= startDate) {
    throw createHttpError(400, 'Intervalo temporal invalido');
  }

  return {
    startDate,
    endDate,
    reason: normalizeText(body?.reason),
  };
}

async function findStatusIdByName(tx, modelName, statusName, domainLabel) {
  const model = tx[modelName];
  const existing = await model.findFirst({
    where: { StatusName: statusName },
    select: { StatusID: true },
  });

  if (!existing) {
    throw createHttpError(500, `${domainLabel} nao configurado`);
  }

  return existing.StatusID;
}

async function fetchAvailabilityById(tx, teacherId, availabilityId) {
  return tx.teacherAvailability.findFirst({
    where: {
      AvailabilityID: availabilityId,
      TeacherID: teacherId,
    },
    include: {
      TeacherAvailabilityStatus: {
        select: {
          StatusID: true,
          StatusName: true,
        },
      },
      TeacherAvailabilityPunctual: true,
      TeacherAvailabilityRecurring: {
        include: {
          AcademicYear: {
            select: {
              AcademicYearID: true,
              Label: true,
            },
          },
        },
      },
    },
  });
}

async function createAvailabilityWithSlot(tx, teacherId, slot, notes, statusId) {
  const created = await tx.teacherAvailability.create({
    data: {
      TeacherID: teacherId,
      Notes: notes,
      RequestedAt: new Date(),
      StatusID: statusId,
      ReviewedByUserID: null,
      ReviewedAt: null,
      ReviewNotes: null,
    },
    select: { AvailabilityID: true },
  });

  if (slot.mode === 'semester') {
    await tx.teacherAvailabilityPunctual.create({
      data: {
        AvailabilityID: created.AvailabilityID,
        StartDateTime: slot.startDateTime,
        EndDateTime: slot.endDateTime,
      },
    });
  } else {
    await tx.teacherAvailabilityRecurring.create({
      data: {
        AvailabilityID: created.AvailabilityID,
        DayOfWeek: slot.dayOfWeek,
        StartTime: slot.startTime,
        EndTime: slot.endTime,
        AcademicYearID: slot.academicYearId,
        IsActive: slot.isActive,
      },
    });
  }

  return fetchAvailabilityById(tx, teacherId, created.AvailabilityID);
}

function serializeAvailability(row) {
  if (!row) {
    return null;
  }

  const punctual = row.TeacherAvailabilityPunctual;
  const recurring = row.TeacherAvailabilityRecurring;

  return {
    availabilityId: row.AvailabilityID,
    teacherId: row.TeacherID,
    notes: row.Notes,
    requestedAt: row.RequestedAt,
    reviewedAt: row.ReviewedAt,
    reviewNotes: row.ReviewNotes,
    status: row.TeacherAvailabilityStatus?.StatusName ?? null,
    mode: punctual ? 'semester' : 'weekly',
    slot: punctual
      ? {
          startDateTime: punctual.StartDateTime,
          endDateTime: punctual.EndDateTime,
        }
      : {
          dayOfWeek: recurring?.DayOfWeek ?? null,
          startTime: formatTimeOnly(recurring?.StartTime),
          endTime: formatTimeOnly(recurring?.EndTime),
          academicYearId: recurring?.AcademicYearID ?? null,
          academicYearLabel: recurring?.AcademicYear?.Label ?? null,
          isActive: recurring?.IsActive ?? null,
        },
  };
}

function serializeException(row) {
  if (!row) {
    return null;
  }

  return {
    absenceId: row.AbsenceID,
    teacherId: row.TeacherID,
    startDate: row.StartDate,
    endDate: row.EndDate,
    reason: row.Reason,
    requestedAt: row.RequestedAt,
    reviewedAt: row.ReviewedAt,
    reviewNotes: row.ReviewNotes,
    status: row.TeacherAbsenceStatus?.StatusName ?? null,
  };
}

async function submitAvailability(teacherId, body) {
  const payload = normalizeAvailabilityPayload(body);

  return prisma.$transaction(async (tx) => {
    const statusId = await findStatusIdByName(
      tx,
      'teacherAvailabilityStatus',
      PENDING_STATUS_NAME,
      'Estado de disponibilidade'
    );
    const created = [];

    for (const slot of payload.slots) {
      const row = await createAvailabilityWithSlot(tx, teacherId, slot, payload.notes, statusId);
      created.push(serializeAvailability(row));
    }

    return {
      summary: {
        totalSlots: created.length,
        weeklySlots: created.filter((item) => item.mode === 'weekly').length,
        semesterSlots: created.filter((item) => item.mode === 'semester').length,
      },
      availability: created,
    };
  });
}

async function getAvailability(teacherId) {
  const rows = await prisma.teacherAvailability.findMany({
    where: {
      TeacherID: teacherId,
    },
    include: {
      TeacherAvailabilityStatus: {
        select: {
          StatusID: true,
          StatusName: true,
        },
      },
      TeacherAvailabilityPunctual: true,
      TeacherAvailabilityRecurring: {
        include: {
          AcademicYear: {
            select: {
              AcademicYearID: true,
              Label: true,
            },
          },
        },
      },
    },
    orderBy: [
      { RequestedAt: 'desc' },
      { AvailabilityID: 'desc' },
    ],
  });

  const availability = rows.map(serializeAvailability);

  return {
    summary: {
      totalSlots: availability.length,
      weeklySlots: availability.filter((item) => item.mode === 'weekly').length,
      semesterSlots: availability.filter((item) => item.mode === 'semester').length,
    },
    availability,
  };
}

async function updateAvailability(teacherId, availabilityId, body) {
  const payload = normalizeAvailabilityPayload(body, { requireSlot: false });

  if (!Number.isInteger(availabilityId) || availabilityId <= 0) {
    throw createHttpError(400, 'Availability id invalido');
  }

  return prisma.$transaction(async (tx) => {
    const existing = await fetchAvailabilityById(tx, teacherId, availabilityId);

    if (!existing) {
      throw createHttpError(404, 'Disponibilidade nao encontrada');
    }

    const currentMode = existing.TeacherAvailabilityPunctual ? 'semester' : 'weekly';
    const requestedMode = payload.mode;

    if (requestedMode && requestedMode !== currentMode) {
      throw createHttpError(400, 'Modo de disponibilidade invalido para atualizacao');
    }

    if (payload.notes !== null || Object.prototype.hasOwnProperty.call(body, 'notes')) {
      await tx.teacherAvailability.update({
        where: { AvailabilityID: availabilityId },
        data: { Notes: payload.notes },
      });
    }

    if (currentMode === 'semester') {
      const punctualInput = isPlainObject(body?.slot) ? body.slot : body;
      const nextStartDateTime = punctualInput.startDateTime ?? punctualInput.startDate;
      const nextEndDateTime = punctualInput.endDateTime ?? punctualInput.endDate;
      const currentSlot = existing.TeacherAvailabilityPunctual;
      const data = {};

      if (nextStartDateTime != null) {
        data.StartDateTime = toDate(nextStartDateTime, 'Data de inicio invalida');
      }

      if (nextEndDateTime != null) {
        data.EndDateTime = toDate(nextEndDateTime, 'Data de fim invalida');
      }

      if ((data.StartDateTime ?? currentSlot.StartDateTime) >= (data.EndDateTime ?? currentSlot.EndDateTime)) {
        throw createHttpError(400, 'Intervalo temporal invalido');
      }

      if (Object.keys(data).length > 0) {
        await tx.teacherAvailabilityPunctual.update({
          where: { AvailabilityID: availabilityId },
          data,
        });
      }
    } else {
      const recurringInput = isPlainObject(body?.slot) ? body.slot : body;
      const currentSlot = existing.TeacherAvailabilityRecurring;
      const data = {};

      if (recurringInput.dayOfWeek != null) {
        data.DayOfWeek = toDayOfWeek(recurringInput.dayOfWeek);
      }

      if (recurringInput.startTime != null) {
        data.StartTime = toTimeOnlyDate(recurringInput.startTime, 'Hora de inicio invalida');
      }

      if (recurringInput.endTime != null) {
        data.EndTime = toTimeOnlyDate(recurringInput.endTime, 'Hora de fim invalida');
      }

      if (recurringInput.academicYearId != null) {
        data.AcademicYearID = toPositiveInteger(recurringInput.academicYearId, 'Ano letivo invalido');
      }

      if (recurringInput.isActive != null) {
        data.IsActive = Boolean(recurringInput.isActive);
      }

      if ((data.StartTime ?? currentSlot.StartTime) >= (data.EndTime ?? currentSlot.EndTime)) {
        throw createHttpError(400, 'Intervalo horario invalido');
      }

      if (Object.keys(data).length > 0) {
        await tx.teacherAvailabilityRecurring.update({
          where: { AvailabilityID: availabilityId },
          data,
        });
      }
    }

    const updated = await fetchAvailabilityById(tx, teacherId, availabilityId);
    return serializeAvailability(updated);
  });
}

async function createException(teacherId, body) {
  const payload = normalizeExceptionPayload(body);

  return prisma.$transaction(async (tx) => {
    const statusId = await findStatusIdByName(
      tx,
      'teacherAbsenceStatus',
      PENDING_STATUS_NAME,
      'Estado de ausencia'
    );

    const created = await tx.teacherAbsence.create({
      data: {
        TeacherID: teacherId,
        StartDate: payload.startDate,
        EndDate: payload.endDate,
        Reason: payload.reason,
        StatusID: statusId,
        RequestedAt: new Date(),
        ReviewedByUserID: null,
        ReviewedAt: null,
        ReviewNotes: null,
      },
      include: {
        TeacherAbsenceStatus: {
          select: {
            StatusID: true,
            StatusName: true,
          },
        },
      },
    });

    return serializeException(created);
  });
}

async function getPendingExceptions(teacherId) {
  const now = new Date();
  const rows = await prisma.teacherAbsence.findMany({
    where: {
      TeacherID: teacherId,
      EndDate: { gte: now },
      ReviewedAt: null,
    },
    include: {
      TeacherAbsenceStatus: {
        select: {
          StatusID: true,
          StatusName: true,
        },
      },
    },
    orderBy: [
      { StartDate: 'asc' },
      { AbsenceID: 'asc' },
    ],
  });

  const exceptions = rows.map(serializeException);

  return {
    summary: {
      pendingExceptions: exceptions.length,
    },
    exceptions,
  };
}

module.exports = {
  createException,
  getAvailability,
  getPendingExceptions,
  submitAvailability,
  updateAvailability,
};