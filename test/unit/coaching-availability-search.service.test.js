const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

/**
 * Testes unitários da pesquisa de disponibilidade de coaching (Issue #50)
 *
 * Valida a filtragem por intervalo de datas e múltiplos filtros:
 * - validação do intervalo de datas (startDate/endDate)
 * - filtragem por ID do professor
 * - filtragem por modalidade/estilo
 * - geração de disponibilidade recorrente ao longo de intervalos de datas
 * - compatibilidade retroativa com o parâmetro weekStart
 *
 * Executar com: npm run test:node:unit
 */

// Estado simulado para os dados de teste
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

// Cliente Prisma simulado
const fakePrisma = {
  academicYear: {
    findFirst: async () => state.activeYear,
  },
  user: {
    findMany: async ({ where, select, orderBy }) => {
      let filtered = [...state.teachers];

      // Filtrar por ID do professor, se especificado
      if (where?.UserID) {
        filtered = filtered.filter((t) => t.UserID === where.UserID);
      }

      // Filtrar por modalidade, se especificado
      if (where?.TeacherModality?.some?.ModalityID) {
        const modalityId = where.TeacherModality.some.ModalityID;
        filtered = filtered.filter((t) =>
          t.TeacherModality?.some?.((tm) => tm.ModalityID === modalityId)
        );
      }

      // Filtrar por função
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
      // Disponibilidades recorrentes
      if (where?.TeacherAvailabilityRecurring?.is) {
        return state.recurringAvailabilities;
      }

      // Disponibilidades pontuais
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

// Substituir Module._load para usar o Prisma falso
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

// Função auxiliar para criar professores de teste
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

// Função auxiliar para criar modalidades de teste
function createModality(id, name) {
  return {
    ModalityID: id,
    ModalityName: name,
  };
}

// Função auxiliar para criar estúdios de teste
function createStudio(id, name, capacity, modalities = []) {
  return {
    StudioID: id,
    StudioName: name,
    Capacity: capacity,
    StudioModality: modalities.map((modalityId) => ({ ModalityID: modalityId })),
  };
}

// Testes de intervalo de datas
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
    assert.fail('Devia ter lançado erro para data inicial inválida');
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
    assert.fail('Devia ter lançado erro para data final antes da inicial');
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

// Testes de filtragem por professor
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
    assert.fail('Devia ter lançado erro para ID de professor inválido');
  } catch (error) {
    assert.match(error.message, /teacherId inválido/);
    assert.equal(error.status, 400);
  }
});

// Testes de filtragem por modalidade
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
    assert.fail('Devia ter lançado erro para ID de modalidade inválido');
  } catch (error) {
    assert.match(error.message, /modalityId inválido/);
    assert.equal(error.status, 400);
  }
});

// Testes de filtros combinados
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

// Testes de compatibilidade retroativa
test('Compatibilidade retroativa - o parâmetro weekStart continua a funcionar', async () => {
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
  // Deve ser 7 dias depois (weekStart + 7 dias)
  assert.equal(result.rangeEnd, '2026-05-04');
});

test('Compatibilidade retroativa - o intervalo de datas tem precedência sobre weekStart', async () => {
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
    weekStart: '2026-04-27', // Deve ser ignorado
  });

  assert.equal(result.rangeStart, '2026-04-20');
  assert.equal(result.rangeEnd, '2026-05-10');
});

// Testes de resultados vazios
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
    assert.fail('Devia ter lançado erro por não existir ano letivo ativo');
  } catch (error) {
    assert.match(error.message, /Nenhum ano letivo ativo encontrado/);
    assert.equal(error.status, 503);
  }
});

// Testes da estrutura da resposta
test('Estrutura da resposta - inclui todos os campos esperados', async () => {
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
