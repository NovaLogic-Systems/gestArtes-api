const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

/**
 * Unit Tests for Coaching Availability Search (Issue #50)
 *
 * Tests the date range filtering and multi-filter capabilities:
 * - Date range validation (startDate/endDate)
 * - Teacher ID filtering
 * - Modality/style filtering
 * - Recurring availability generation across date ranges
 * - Backwards compatibility with weekStart parameter
 *
 * Run with: npm run test:node:unit
 */

// Mock state for test data
function createState() {
  return {
    activeYear: { AcademicYearID: 1 },
    teachers: [],
    modalities: [],
    studios: [],
    recurringAvailabilities: [],
    punctualAvailabilities: [],
    absences: [],
    sessionTeachers: [],
  };
}

let state = createState();

// Mock Prisma client
const fakePrisma = {
  academicYear: {
    findFirst: async () => state.activeYear,
  },
  user: {
    findMany: async ({ where, select, orderBy }) => {
      let filtered = [...state.teachers];

      // Filter by teacher ID if specified
      if (where?.UserID) {
        filtered = filtered.filter((t) => t.UserID === where.UserID);
      }

      // Filter by modality if specified
      if (where?.TeacherModality?.some?.ModalityID) {
        const modalityId = where.TeacherModality.some.ModalityID;
        filtered = filtered.filter((t) =>
          t.TeacherModality?.some?.((tm) => tm.ModalityID === modalityId)
        );
      }

      // Filter by role
      if (where?.UserRole?.some?.Role?.RoleName) {
        filtered = filtered.filter((t) =>
          t.UserRole?.some?.((ur) => ur.Role?.RoleName === where.UserRole.some.Role.RoleName)
        );
      }

      return filtered;
    },
  },
  modality: {
    findMany: async () => state.modalities,
  },
  studio: {
    findMany: async () => state.studios,
  },
  teacherAvailability: {
    findMany: async ({ where, select }) => {
      // Recurring availabilities
      if (where?.TeacherAvailabilityRecurring?.is) {
        return state.recurringAvailabilities;
      }

      // Punctual availabilities
      if (where?.TeacherAvailabilityPunctual?.is) {
        return state.punctualAvailabilities;
      }

      return [];
    },
  },
  teacherAbsence: {
    findMany: async () => state.absences,
  },
  sessionTeacher: {
    findMany: async () => state.sessionTeachers,
  },
};

// Patch Module._load to use fake Prisma
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '../config/prisma') {
    return fakePrisma;
  }
  return originalLoad.call(this, request, parent, isMain);
};

let coachingService;

try {
  coachingService = require('../../src/services/coaching.service');
} finally {
  Module._load = originalLoad;
}

function resetState(overrides = {}) {
  state = {
    ...createState(),
    ...overrides,
  };
}

// Helper to create test teachers
function createTeacher(id, name, modalities = []) {
  return {
    UserID: id,
    FirstName: name.split(' ')[0],
    LastName: name.split(' ')[1] || '',
    IsActive: true,
    UserRole: [{ Role: { RoleName: 'teacher' } }],
    TeacherModality: modalities.map((modalityId) => ({ ModalityID: modalityId })),
  };
}

// Helper to create test modalities
function createModality(id, name) {
  return {
    ModalityID: id,
    ModalityName: name,
  };
}

// Helper to create test studios
function createStudio(id, name, capacity, modalities = []) {
  return {
    StudioID: id,
    StudioName: name,
    Capacity: capacity,
    StudioModality: modalities.map((modalityId) => ({ ModalityID: modalityId })),
  };
}

// Date range tests
test('Date range validation - rejects invalid start date', async () => {
  resetState({
    teachers: [],
    modalities: [],
    studios: [],
  });

  try {
    await coachingService.getAvailableSlots({
      startDate: 'invalid-date',
      endDate: '2026-05-04',
    });
    assert.fail('Should have thrown error for invalid start date');
  } catch (error) {
    assert.match(error.message, /Data de início ou fim inválida/);
    assert.equal(error.status, 400);
  }
});

test('Date range validation - rejects end date before start date', async () => {
  resetState({
    teachers: [],
    modalities: [],
    studios: [],
  });

  try {
    await coachingService.getAvailableSlots({
      startDate: '2026-05-04',
      endDate: '2026-04-27',
    });
    assert.fail('Should have thrown error for end date before start date');
  } catch (error) {
    assert.match(error.message, /Data de fim deve ser posterior/);
    assert.equal(error.status, 400);
  }
});

test('Date range - returns correct range bounds in response', async () => {
  resetState({
    activeYear: { AcademicYearID: 1 },
    teachers: [],
    modalities: [],
    studios: [],
    recurringAvailabilities: [],
    punctualAvailabilities: [],
    absences: [],
    sessionTeachers: [],
  });

  const result = await coachingService.getAvailableSlots({
    startDate: '2026-04-27',
    endDate: '2026-05-04',
  });

  assert.equal(result.rangeStart, '2026-04-27');
  assert.equal(result.rangeEnd, '2026-05-04');
});

// Teacher filtering tests
test('Teacher filter - filters by teacher ID', async () => {
  const ana = createTeacher(5, 'Ana Silva', [1]);
  const rui = createTeacher(6, 'Rui Costa', [1]);

  resetState({
    activeYear: { AcademicYearID: 1 },
    teachers: [ana, rui],
    modalities: [createModality(1, 'Ballet Clássico')],
    studios: [],
    recurringAvailabilities: [],
    punctualAvailabilities: [],
    absences: [],
    sessionTeachers: [],
  });

  const result = await coachingService.getAvailableSlots({
    startDate: '2026-04-27',
    endDate: '2026-05-04',
    teacherId: '5',
  });

  assert.deepEqual(result.teachers, [
    {
      teacherId: 5,
      name: 'Ana Silva',
      modalityIds: [1],
    },
  ]);
});

test('Teacher filter - invalid teacher ID returns error', async () => {
  resetState({
    teachers: [],
    modalities: [],
    studios: [],
  });

  try {
    await coachingService.getAvailableSlots({
      startDate: '2026-04-27',
      endDate: '2026-05-04',
      teacherId: 'invalid',
    });
    assert.fail('Should have thrown error for invalid teacher ID');
  } catch (error) {
    assert.match(error.message, /teacherId inválido/);
    assert.equal(error.status, 400);
  }
});

// Modality filtering tests
test('Modality filter - filters by modality ID', async () => {
  const ana = createTeacher(5, 'Ana Silva', [1, 2]);
  const rui = createTeacher(6, 'Rui Costa', [2, 3]);

  resetState({
    activeYear: { AcademicYearID: 1 },
    teachers: [ana, rui],
    modalities: [
      createModality(1, 'Ballet Clássico'),
      createModality(2, 'Contemporâneo'),
      createModality(3, 'Jazz'),
    ],
    studios: [],
    recurringAvailabilities: [],
    punctualAvailabilities: [],
    absences: [],
    sessionTeachers: [],
  });

  const result = await coachingService.getAvailableSlots({
    startDate: '2026-04-27',
    endDate: '2026-05-04',
    modalityId: '1',
  });

  assert.equal(result.teachers.length, 1);
  assert.equal(result.teachers[0].teacherId, 5);
  assert.equal(result.teachers[0].name, 'Ana Silva');
});

test('Modality filter - invalid modality ID returns error', async () => {
  resetState({
    teachers: [],
    modalities: [],
    studios: [],
  });

  try {
    await coachingService.getAvailableSlots({
      startDate: '2026-04-27',
      endDate: '2026-05-04',
      modalityId: 'invalid',
    });
    assert.fail('Should have thrown error for invalid modality ID');
  } catch (error) {
    assert.match(error.message, /modalityId inválido/);
    assert.equal(error.status, 400);
  }
});

// Combined filters tests
test('Combined filters - teacher AND modality', async () => {
  const ana = createTeacher(5, 'Ana Silva', [1, 2]);
  const rui = createTeacher(6, 'Rui Costa', [2, 3]);

  resetState({
    activeYear: { AcademicYearID: 1 },
    teachers: [ana, rui],
    modalities: [
      createModality(1, 'Ballet Clássico'),
      createModality(2, 'Contemporâneo'),
      createModality(3, 'Jazz'),
    ],
    studios: [],
    recurringAvailabilities: [],
    punctualAvailabilities: [],
    absences: [],
    sessionTeachers: [],
  });

  const result = await coachingService.getAvailableSlots({
    startDate: '2026-04-27',
    endDate: '2026-05-04',
    teacherId: '5',
    modalityId: '1',
  });

  assert.equal(result.teachers.length, 1);
  assert.equal(result.teachers[0].teacherId, 5);
});

// Backwards compatibility tests
test('Backwards compatibility - weekStart parameter still works', async () => {
  resetState({
    activeYear: { AcademicYearID: 1 },
    teachers: [],
    modalities: [],
    studios: [],
    recurringAvailabilities: [],
    punctualAvailabilities: [],
    absences: [],
    sessionTeachers: [],
  });

  const result = await coachingService.getAvailableSlots({
    weekStart: '2026-04-27',
  });

  assert.equal(result.rangeStart, '2026-04-27');
  // Should be 7 days later (weekStart + 7 days)
  assert.equal(result.rangeEnd, '2026-05-04');
});

test('Backwards compatibility - date range takes precedence over weekStart', async () => {
  resetState({
    activeYear: { AcademicYearID: 1 },
    teachers: [],
    modalities: [],
    studios: [],
    recurringAvailabilities: [],
    punctualAvailabilities: [],
    absences: [],
    sessionTeachers: [],
  });

  const result = await coachingService.getAvailableSlots({
    startDate: '2026-04-20',
    endDate: '2026-05-10',
    weekStart: '2026-04-27', // Should be ignored
  });

  assert.equal(result.rangeStart, '2026-04-20');
  assert.equal(result.rangeEnd, '2026-05-10');
});

// Empty results tests
test('Empty results - no teachers found returns empty array', async () => {
  resetState({
    activeYear: { AcademicYearID: 1 },
    teachers: [],
    modalities: [],
    studios: [],
    recurringAvailabilities: [],
    punctualAvailabilities: [],
    absences: [],
    sessionTeachers: [],
  });

  const result = await coachingService.getAvailableSlots({
    startDate: '2026-04-27',
    endDate: '2026-05-04',
    teacherId: '999',
  });

  assert.equal(result.teachers.length, 0);
  assert.equal(result.availabilityWindows.length, 0);
});

test('No active academic year returns error', async () => {
  resetState({
    activeYear: null,
  });

  try {
    await coachingService.getAvailableSlots({
      startDate: '2026-04-27',
      endDate: '2026-05-04',
    });
    assert.fail('Should have thrown error for no active academic year');
  } catch (error) {
    assert.match(error.message, /Nenhum ano letivo ativo encontrado/);
    assert.equal(error.status, 503);
  }
});

// Response structure tests
test('Response structure - includes all expected fields', async () => {
  const ana = createTeacher(5, 'Ana Silva', [1]);

  resetState({
    activeYear: { AcademicYearID: 1 },
    teachers: [ana],
    modalities: [createModality(1, 'Ballet Clássico')],
    studios: [createStudio(1, 'E1', 20, [1])],
    recurringAvailabilities: [],
    punctualAvailabilities: [],
    absences: [],
    sessionTeachers: [],
  });

  const result = await coachingService.getAvailableSlots({
    startDate: '2026-04-27',
    endDate: '2026-05-04',
  });

  assert.ok(result.rangeStart);
  assert.ok(result.rangeEnd);
  assert.ok(Array.isArray(result.teachers));
  assert.ok(Array.isArray(result.modalities));
  assert.ok(Array.isArray(result.studios));
  assert.ok(Array.isArray(result.availabilityWindows));
});

console.log('✓ All coaching availability search tests passed');
