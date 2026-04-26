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
      .filter((row) => row.ReviewedAt == null)
      .map((row) => ({
        ...row,
        TeacherAbsenceStatus: {
          StatusID: state.absenceStatusId,
          StatusName: 'Pending',
        },
      })),
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