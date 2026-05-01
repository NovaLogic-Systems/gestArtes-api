/**
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function createState() {
  return {
    nextAvailabilityId: 1,
    nextAbsenceId: 1,
    availabilityStatusId: 10,
    absenceStatusId: 20,
    hasAvailabilityPendingStatus: true,
    hasAbsencePendingStatus: true,
    availabilityRows: [],
    punctualRows: new Map(),
    recurringRows: new Map(),
    exceptions: [],
    sessionStatuses: [
      { StatusID: 1, StatusName: 'Pending' },
      { StatusID: 2, StatusName: 'Approved' },
      { StatusID: 3, StatusName: 'Cancelled' },
    ],
    pendingSessions: [],
    updatedSessionIds: [],
    notifications: [],
    academicYearById: new Map([[1, { AcademicYearID: 1, Label: '2025/2026' }]]),
  };
}

let state = createState();

function buildAvailabilityRow(availability) {
  return {
    AvailabilityID: availability.AvailabilityID,
    TeacherID: availability.TeacherID,
    Notes: availability.Notes,
    RequestedAt: availability.RequestedAt,
    ReviewedAt: availability.ReviewedAt,
    ReviewNotes: availability.ReviewNotes,
    TeacherAvailabilityStatus: {
      StatusID: state.availabilityStatusId,
      StatusName: 'Pending',
    },
    TeacherAvailabilityPunctual: state.punctualRows.get(availability.AvailabilityID) || null,
    TeacherAvailabilityRecurring: state.recurringRows.get(availability.AvailabilityID) || null,
  };
}

const fakePrisma = {
  $transaction: async (callback) => callback(fakePrisma),
  teacherAvailabilityStatus: {
    findFirst: async ({ where }) => {
      if (where?.StatusName === 'Pending' && state.hasAvailabilityPendingStatus) {
        return { StatusID: state.availabilityStatusId, StatusName: 'Pending' };
      }

      return null;
    },
  },
  teacherAbsenceStatus: {
    findFirst: async ({ where }) => {
      if (where?.StatusName === 'Pending' && state.hasAbsencePendingStatus) {
        return { StatusID: state.absenceStatusId, StatusName: 'Pending' };
      }

      return null;
    },
  },
  teacherAvailability: {
    create: async ({ data }) => {
      const created = {
        AvailabilityID: state.nextAvailabilityId++,
        ...data,
      };
      state.availabilityRows.push(created);
      return { AvailabilityID: created.AvailabilityID };
    },
    findFirst: async ({ where }) => {
      const found = state.availabilityRows.find(
        (row) => row.AvailabilityID === where.AvailabilityID && row.TeacherID === where.TeacherID
      );

      return found ? buildAvailabilityRow(found) : null;
    },
    findMany: async ({ where }) => state.availabilityRows
      .filter((row) => row.TeacherID === where.TeacherID)
      .map(buildAvailabilityRow),
    update: async ({ where, data }) => {
      const row = state.availabilityRows.find((item) => item.AvailabilityID === where.AvailabilityID);
      Object.assign(row, data);
      return row;
    },
  },
  teacherAvailabilityPunctual: {
    create: async ({ data }) => {
      state.punctualRows.set(data.AvailabilityID, {
        AvailabilityID: data.AvailabilityID,
        StartDateTime: data.StartDateTime,
        EndDateTime: data.EndDateTime,
      });
    },
    update: async ({ where, data }) => {
      const row = state.punctualRows.get(where.AvailabilityID);
      Object.assign(row, data);
      return row;
    },
  },
  teacherAvailabilityRecurring: {
    create: async ({ data }) => {
      state.recurringRows.set(data.AvailabilityID, {
        AvailabilityID: data.AvailabilityID,
        DayOfWeek: data.DayOfWeek,
        StartTime: data.StartTime,
        EndTime: data.EndTime,
        AcademicYearID: data.AcademicYearID,
        IsActive: data.IsActive,
        AcademicYear: state.academicYearById.get(data.AcademicYearID) || null,
      });
    },
    update: async ({ where, data }) => {
      const row = state.recurringRows.get(where.AvailabilityID);
      Object.assign(row, data);
      if (data.AcademicYearID != null) {
        row.AcademicYear = state.academicYearById.get(data.AcademicYearID) || null;
      }
      return row;
    },
  },
  teacherAbsence: {
    create: async ({ data }) => {
      const created = {
        AbsenceID: state.nextAbsenceId++,
        ...data,
      };
      state.exceptions.push(created);
      return {
        ...created,
        TeacherAbsenceStatus: {
          StatusID: state.absenceStatusId,
          StatusName: 'Pending',
        },
      };
    },
    findMany: async ({ where }) => state.exceptions
      .filter((row) => row.TeacherID === where.TeacherID)
      .filter((row) => row.EndDate >= where.EndDate.gte)
      .filter((row) => where.StatusID == null || row.StatusID === where.StatusID)
      .map((row) => ({
        ...row,
        TeacherAbsenceStatus: {
          StatusID: state.absenceStatusId,
          StatusName: 'Pending',
        },
      })),
  },
  sessionStatus: {
    findMany: async () => state.sessionStatuses,
  },
  coachingSession: {
    findMany: async ({ where }) => state.pendingSessions.filter((session) => (
      session.StartTime < where.StartTime.lt
      && session.EndTime > where.EndTime.gt
    )),
    updateMany: async ({ where, data }) => {
      state.updatedSessionIds = where.SessionID.in;
      state.pendingSessions = state.pendingSessions.map((session) => (
        where.SessionID.in.includes(session.SessionID)
          ? { ...session, ...data }
          : session
      ));

      return { count: where.SessionID.in.length };
    },
  },
  notification: {
    createMany: async ({ data }) => {
      const created = data.map((item, i) => ({
        NotificationID: state.notifications.length + i + 1,
        ...item,
      }));
      state.notifications.push(...created);
      return { count: created.length };
    },
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '../config/prisma') {
    return fakePrisma;
  }

  return originalLoad.call(this, request, parent, isMain);
};

let availabilityService;

try {
  availabilityService = require('../../src/services/availability.service');
} finally {
  Module._load = originalLoad;
}

function resetState() {
  state = createState();
}

test('submits recurring availability and summarizes slots', async () => {
  resetState();

  const result = await availabilityService.submitAvailability(42, {
    mode: 'weekly',
    notes: 'After class hours',
    dayOfWeek: 1,
    startTime: '09:00',
    endTime: '11:00',
    academicYearId: 1,
    isActive: true,
  });

  assert.equal(result.summary.totalSlots, 1);
  assert.equal(result.summary.weeklySlots, 1);
  assert.equal(result.summary.semesterSlots, 0);
  assert.equal(result.availability[0].mode, 'weekly');
  assert.equal(result.availability[0].slot.academicYearLabel, '2025/2026');
});

test('updates punctual availability in place', async () => {
  resetState();

  await availabilityService.submitAvailability(42, {
    mode: 'semester',
    startDateTime: '2026-05-01T10:00:00.000Z',
    endDateTime: '2026-05-01T12:00:00.000Z',
  });

  const updated = await availabilityService.updateAvailability(42, 1, {
    startDateTime: '2026-05-01T10:30:00.000Z',
    endDateTime: '2026-05-01T12:30:00.000Z',
  });

  assert.equal(updated.mode, 'semester');
  assert.equal(updated.slot.startDateTime.toISOString(), '2026-05-01T10:30:00.000Z');
});

test('creates and lists pending exceptions', async () => {
  resetState();

  const exception = await availabilityService.createException(42, {
    startDate: '2026-06-10T00:00:00.000Z',
    endDate: '2026-06-11T00:00:00.000Z',
    reason: 'Holiday',
  });

  assert.equal(exception.reason, 'Holiday');

  const pending = await availabilityService.getPendingExceptions(42);
  assert.equal(pending.summary.pendingExceptions, 1);
  assert.equal(pending.exceptions[0].reason, 'Holiday');
});

test('creates exception and auto-cancels overlapping pending sessions with notifications', async () => {
  resetState();
  state.pendingSessions = [
    {
      SessionID: 77,
      RequestedByUserID: 9001,
      StartTime: new Date('2026-06-10T10:00:00.000Z'),
      EndTime: new Date('2026-06-10T11:00:00.000Z'),
      SessionStudent: [
        { StudentAccount: { UserID: 9002 } },
      ],
    },
    {
      SessionID: 78,
      RequestedByUserID: 9003,
      StartTime: new Date('2026-06-12T10:00:00.000Z'),
      EndTime: new Date('2026-06-12T11:00:00.000Z'),
      SessionStudent: [],
    },
  ];

  const exception = await availabilityService.createException(42, {
    startDate: '2026-06-10T00:00:00.000Z',
    endDate: '2026-06-11T00:00:00.000Z',
    reason: 'Holiday',
  });

  assert.equal(exception.reason, 'Holiday');
  assert.deepEqual(state.updatedSessionIds, [77]);
  assert.equal(state.pendingSessions[0].StatusID, 3);
  assert.equal(state.pendingSessions[0].CancellationReason, 'Cancelamento automatico por indisponibilidade do professor');
  assert.equal(state.notifications.length, 2);
  assert.equal(state.notifications[0].SessionID, 77);
  assert.equal(state.notifications[0].Title.startsWith('A tua reserva foi cancelada automaticamente'), true);
});

test('fails when pending availability status is not configured', async () => {
  resetState();
  state.hasAvailabilityPendingStatus = false;

  await assert.rejects(
    () => availabilityService.submitAvailability(42, {
      mode: 'weekly',
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '11:00',
      academicYearId: 1,
    }),
    (error) => {
      assert.equal(error.status, 500);
      assert.equal(error.message, 'Estado de disponibilidade nao configurado');
      return true;
    }
  );
});

test('submits semester availability and summarizes slots', async () => {
  resetState();

  const result = await availabilityService.submitAvailability(42, {
    mode: 'semester',
    startDateTime: '2026-09-01T08:00:00.000Z',
    endDateTime: '2026-09-01T10:00:00.000Z',
  });

  assert.equal(result.summary.totalSlots, 1);
  assert.equal(result.summary.weeklySlots, 0);
  assert.equal(result.summary.semesterSlots, 1);
  assert.equal(result.availability[0].mode, 'semester');
  assert.equal(result.availability[0].slot.startDateTime.toISOString(), '2026-09-01T08:00:00.000Z');
});

test('submits multiple slots in a single request', async () => {
  resetState();

  const result = await availabilityService.submitAvailability(42, {
    slots: [
      { mode: 'weekly', dayOfWeek: 1, startTime: '09:00', endTime: '11:00', academicYearId: 1 },
      { mode: 'weekly', dayOfWeek: 3, startTime: '14:00', endTime: '16:00', academicYearId: 1 },
    ],
  });

  assert.equal(result.summary.totalSlots, 2);
  assert.equal(result.summary.weeklySlots, 2);
});

test('getAvailability returns all slots for a teacher', async () => {
  resetState();

  await availabilityService.submitAvailability(42, {
    mode: 'weekly',
    dayOfWeek: 2,
    startTime: '10:00',
    endTime: '12:00',
    academicYearId: 1,
  });

  const result = await availabilityService.getAvailability(42);

  assert.equal(result.summary.totalSlots, 1);
  assert.equal(result.availability[0].teacherId, 42);
  assert.equal(result.availability[0].mode, 'weekly');
});

test('updates recurring availability in place', async () => {
  resetState();

  await availabilityService.submitAvailability(42, {
    mode: 'weekly',
    dayOfWeek: 1,
    startTime: '09:00',
    endTime: '11:00',
    academicYearId: 1,
  });

  const updated = await availabilityService.updateAvailability(42, 1, {
    startTime: '10:00',
    endTime: '12:00',
  });

  assert.equal(updated.mode, 'weekly');
  assert.equal(updated.slot.startTime, '10:00:00');
  assert.equal(updated.slot.endTime, '12:00:00');
});

test('rejects update when requested mode differs from existing mode', async () => {
  resetState();

  await availabilityService.submitAvailability(42, {
    mode: 'weekly',
    dayOfWeek: 1,
    startTime: '09:00',
    endTime: '11:00',
    academicYearId: 1,
  });

  await assert.rejects(
    () => availabilityService.updateAvailability(42, 1, {
      mode: 'semester',
      startDateTime: '2026-09-01T08:00:00.000Z',
      endDateTime: '2026-09-01T10:00:00.000Z',
    }),
    (error) => {
      assert.equal(error.status, 400);
      assert.equal(error.message, 'Modo de disponibilidade invalido para atualizacao');
      return true;
    }
  );
});

test('rejects update for non-existent availability id', async () => {
  resetState();

  await assert.rejects(
    () => availabilityService.updateAvailability(42, 9999, { startTime: '10:00', endTime: '12:00' }),
    (error) => {
      assert.equal(error.status, 404);
      assert.equal(error.message, 'Disponibilidade nao encontrada');
      return true;
    }
  );
});

test('rejects weekly slot with end time not after start time', async () => {
  resetState();

  await assert.rejects(
    () => availabilityService.submitAvailability(42, {
      mode: 'weekly',
      dayOfWeek: 1,
      startTime: '11:00',
      endTime: '09:00',
      academicYearId: 1,
    }),
    (error) => {
      assert.equal(error.status, 400);
      assert.equal(error.message, 'Intervalo horario invalido');
      return true;
    }
  );
});

test('rejects slot with conflicting semester and weekly fields and no explicit mode', async () => {
  resetState();

  await assert.rejects(
    () => availabilityService.submitAvailability(42, {
      startDateTime: '2026-09-01T08:00:00.000Z',
      dayOfWeek: 1,
    }),
    (error) => {
      assert.equal(error.status, 400);
      assert.match(error.message, /incompativeis/);
      return true;
    }
  );
});

test('getPendingExceptions returns empty list when no pending exceptions exist', async () => {
  resetState();

  const result = await availabilityService.getPendingExceptions(42);

  assert.equal(result.summary.pendingExceptions, 0);
  assert.deepEqual(result.exceptions, []);
});

test('notifications use human-readable dates in absence cancellation messages', async () => {
  resetState();
  state.pendingSessions = [
    {
      SessionID: 55,
      RequestedByUserID: 9001,
      StartTime: new Date('2026-06-10T10:00:00.000Z'),
      EndTime: new Date('2026-06-10T11:00:00.000Z'),
      SessionStudent: [],
    },
  ];

  await availabilityService.createException(42, {
    startDate: '2026-06-10T00:00:00.000Z',
    endDate: '2026-06-11T00:00:00.000Z',
  });

  assert.equal(state.notifications.length, 1);
  assert.ok(!state.notifications[0].Message.includes('T'), 'Message should not contain ISO T separator');
  assert.ok(!state.notifications[0].Message.includes('.000Z'), 'Message should not contain ISO milliseconds');
});