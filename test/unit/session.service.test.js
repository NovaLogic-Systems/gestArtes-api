const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function createState() {
  return {
    studioExists: true,
    studioCapacity: 20,
    studioSupportsModality: true,
    studioOverlapCount: 0,
    teacherConflicts: [],
    absentTeacherIds: new Set(),
    availabilityByTeacherId: new Map(),
    validStatusIds: new Set([1]),
    validPricingRateIds: new Set([1]),
    validAssignmentRoleIds: new Set([1]),
    validTeacherIds: new Set([101]),
    createdSessions: [],
    createdSessionTeachers: [],
    lastDoubleBookingWhere: null,
  };
}

let state = createState();

const fakePrisma = {
  $transaction: async (callback) => callback(fakePrisma),
  studio: {
    findUnique: async () => {
      if (!state.studioExists) {
        return null;
      }

      return {
        StudioID: 1,
        Capacity: state.studioCapacity,
      };
    },
  },
  studioModality: {
    findUnique: async () => (state.studioSupportsModality ? { StudioID: 1, ModalityID: 2 } : null),
  },
  coachingSession: {
    count: async () => state.studioOverlapCount,
    create: async ({ data }) => {
      const created = {
        SessionID: state.createdSessions.length + 1,
        ...data,
      };
      state.createdSessions.push(created);
      return created;
    },
  },
  sessionTeacher: {
    findMany: async ({ where }) => {
      state.lastDoubleBookingWhere = where;
      if (!where?.CoachingSession?.is) {
        throw new Error('Expected to-one relation filter using CoachingSession.is');
      }

      return state.teacherConflicts.map((TeacherID) => ({ TeacherID }));
    },
    createMany: async ({ data }) => {
      state.createdSessionTeachers = data;
      return { count: data.length };
    },
  },
  teacherAbsence: {
    count: async ({ where }) => (state.absentTeacherIds.has(where.TeacherID) ? 1 : 0),
  },
  teacherAvailability: {
    count: async ({ where }) => {
      const availability = state.availabilityByTeacherId.get(where.TeacherID) || {
        punctual: false,
        recurring: false,
      };

      if (where.TeacherAvailabilityPunctual) {
        return availability.punctual ? 1 : 0;
      }

      if (where.TeacherAvailabilityRecurring) {
        return availability.recurring ? 1 : 0;
      }

      return 0;
    },
  },
  sessionStatus: {
    findUnique: async ({ where }) => (state.validStatusIds.has(where.StatusID) ? { StatusID: where.StatusID } : null),
  },
  sessionPricingRate: {
    findUnique: async ({ where }) => (
      state.validPricingRateIds.has(where.PricingRateID) ? { PricingRateID: where.PricingRateID } : null
    ),
  },
  teacherAssignmentRole: {
    findUnique: async ({ where }) => (
      state.validAssignmentRoleIds.has(where.AssignmentRoleID) ? { AssignmentRoleID: where.AssignmentRoleID } : null
    ),
  },
  user: {
    findMany: async ({ where }) => {
      const ids = where?.UserID?.in || [];
      return ids
        .filter((id) => state.validTeacherIds.has(id))
        .map((id) => ({ UserID: id }));
    },
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '../config/prisma') {
    return fakePrisma;
  }

  if (request === '@prisma/client') {
    return {
      Prisma: {
        TransactionIsolationLevel: {
          Serializable: 'Serializable',
        },
      },
    };
  }

  return originalLoad.call(this, request, parent, isMain);
};

let createSessionWithBusinessRules;

try {
  ({ createSessionWithBusinessRules } = require('../../src/services/session.service'));
} finally {
  Module._load = originalLoad;
}

function resetState() {
  state = createState();
  state.availabilityByTeacherId.set(101, { punctual: true, recurring: false });
}

function validInput(overrides = {}) {
  return {
    studioId: 1,
    startTime: '2026-05-15T10:00:00.000Z',
    endTime: '2026-05-15T11:00:00.000Z',
    modalityId: 2,
    pricingRateId: 1,
    statusId: 1,
    teacherIds: [101],
    assignmentRoleId: 1,
    maxParticipants: 10,
    isExternal: false,
    isOutsideStdHours: false,
    reviewNotes: null,
    ...overrides,
  };
}

test('creates a session and applies to-one relation filter for teacher conflicts', async () => {
  resetState();

  const created = await createSessionWithBusinessRules(validInput(), 900);

  assert.equal(created.SessionID, 1);
  assert.equal(state.createdSessionTeachers.length, 1);
  assert.deepEqual(state.lastDoubleBookingWhere.CoachingSession.is, {
    StartTime: { lt: new Date('2026-05-15T11:00:00.000Z') },
    EndTime: { gt: new Date('2026-05-15T10:00:00.000Z') },
  });
});

test('rejects payload with teacher ids that do not exist or do not have teacher role', async () => {
  resetState();

  await assert.rejects(
    () => createSessionWithBusinessRules(validInput({ teacherIds: [101, 999] }), 900),
    (error) => {
      assert.equal(error.status, 422);
      assert.equal(error.message, 'Lista de professores invalida');
      assert.deepEqual(error.details, { teacherIds: [999] });
      return true;
    }
  );
});

test('rejects payload when status does not exist', async () => {
  resetState();

  await assert.rejects(
    () => createSessionWithBusinessRules(validInput({ statusId: 999 }), 900),
    (error) => {
      assert.equal(error.status, 422);
      assert.equal(error.message, 'Estado da sessao invalido');
      return true;
    }
  );
});

test('rejects payload when pricing rate does not exist', async () => {
  resetState();

  await assert.rejects(
    () => createSessionWithBusinessRules(validInput({ pricingRateId: 999 }), 900),
    (error) => {
      assert.equal(error.status, 422);
      assert.equal(error.message, 'Tabela de preco invalida');
      return true;
    }
  );
});

test('rejects payload when assignment role does not exist', async () => {
  resetState();

  await assert.rejects(
    () => createSessionWithBusinessRules(validInput({ assignmentRoleId: 999 }), 900),
    (error) => {
      assert.equal(error.status, 422);
      assert.equal(error.message, 'Papel de atribuicao invalido');
      return true;
    }
  );
});

test('rejects payload when assignment role value is invalid instead of falling back', async () => {
  resetState();

  await assert.rejects(
    () => createSessionWithBusinessRules(validInput({ assignmentRoleId: 'abc' }), 900),
    (error) => {
      assert.equal(error.status, 422);
      assert.equal(error.message, 'Papel de atribuicao invalido');
      return true;
    }
  );
});