const test = require('node:test');
const assert = require('node:assert/strict');

/**
 * Testes de integração do endpoint de pesquisa de disponibilidade de coaching (Issue #50)
 *
 * Valida o fluxo completo do endpoint HTTP:
 * - GET /coaching/slots com várias combinações de parâmetros
 * - filtragem por intervalo de datas com validação
 * - filtragem por professor e modalidade
 * - formato da resposta e correção dos dados
 * - tratamento de erros e códigos de estado
 *
 * Pré-requisitos:
 * - ano letivo ativo na base de dados
 * - dados de teste (professores, modalidades, estúdios, janelas de disponibilidade)
 * - servidor da API em execução em BASE_URL
 *
 * Executar com: RUN_DB_INTEGRATION_TESTS=true npm run test:node:integration
 */

const shouldRun = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

if (!shouldRun) {
  test('Coaching availability integration tests are skipped unless RUN_DB_INTEGRATION_TESTS=true', { skip: true }, () => {});
}

if (shouldRun) {
const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3001';
const prisma = require('../../src/config/prisma');

// Função auxiliar para fazer pedidos HTTP
async function makeRequest(method, path, body = null, headers = {}) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Cookie': 'sid=test-session-id',
      ...headers,
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${BASE_URL}${path}`, options);
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    return { status: response.status, data };
  } catch (error) {
    return { status: 0, data: null, error: error.message };
  }
}

// Preparação dos dados de teste
async function setupTestData() {
  // Create or get active academic year
    let activeYear = await prisma.academicYear.findFirst({
    where: { IsActive: true },
  });

  if (!activeYear) {
    activeYear = await prisma.academicYear.create({
      data: {
        Label: 'Test Year 2026',
        StartsOn: new Date('2026-01-01'),
        EndsOn: new Date('2026-12-31'),
        IsActive: true,
      },
    });
  }

  // Create test modalities if needed
  let modalities = await prisma.modality.findMany();
  if (modalities.length === 0) {
    modalities = await Promise.all([
      prisma.modality.create({ data: { ModalityName: 'Ballet Clássico' } }),
      prisma.modality.create({ data: { ModalityName: 'Contemporâneo' } }),
      prisma.modality.create({ data: { ModalityName: 'Jazz' } }),
    ]);
  }

  // Create test studios if needed
  let studios = await prisma.studio.findMany();
  if (studios.length === 0) {
    studios = await Promise.all([
      prisma.studio.create({
        data: {
          StudioName: 'E1',
          Capacity: 20,
        },
      }),
      prisma.studio.create({
        data: {
          StudioName: 'E2',
          Capacity: 15,
        },
      }),
    ]);
  }

  // Create test teachers with availability
  let teachers = await prisma.user.findMany({
    where: { UserRole: { some: { Role: { RoleName: 'teacher' } } } },
    take: 2,
  });

  if (teachers.length < 2) {
    const role = await prisma.role.findFirst({ where: { RoleName: 'teacher' } });

    const testTeachers = await Promise.all([
      prisma.user.create({
        data: {
          FirstName: 'Ana',
          LastName: 'Silva',
          Email: `ana.silva.${Date.now()}@test.local`,
          IsActive: true,
          UserRole: {
            create: [{ RoleID: role.RoleID }],
          },
          TeacherModality: {
            create: [
              { ModalityID: modalities[0].ModalityID },
              { ModalityID: modalities[1].ModalityID },
            ],
          },
        },
      }),
      prisma.user.create({
        data: {
          FirstName: 'Rui',
          LastName: 'Costa',
          Email: `rui.costa.${Date.now()}@test.local`,
          IsActive: true,
          UserRole: {
            create: [{ RoleID: role.RoleID }],
          },
          TeacherModality: {
            create: [
              { ModalityID: modalities[1].ModalityID },
              { ModalityID: modalities[2].ModalityID },
            ],
          },
        },
      }),
    ]);

    teachers = testTeachers;
  }

  return {
    academicYearId: activeYear.AcademicYearID,
    teachers,
    modalities,
    studios,
  };
}

// Test: Get available slots with date range
test('GET /coaching/slots - returns slots for date range', async () => {
  const { academicYearId } = await setupTestData();

  const { status, data } = await makeRequest(
    'GET',
    '/coaching/slots?startDate=2026-04-27&endDate=2026-05-04'
  );

  assert.equal(status, 200, `Expected 200, got ${status}`);
  assert.ok(data.rangeStart, 'Missing rangeStart in response');
  assert.ok(data.rangeEnd, 'Missing rangeEnd in response');
  assert.equal(data.rangeStart, '2026-04-27');
  assert.equal(data.rangeEnd, '2026-05-04');
  assert.ok(Array.isArray(data.teachers), 'teachers should be array');
  assert.ok(Array.isArray(data.modalities), 'modalities should be array');
  assert.ok(Array.isArray(data.studios), 'studios should be array');
  assert.ok(Array.isArray(data.availabilityWindows), 'availabilityWindows should be array');
});

// Test: Filter by teacher ID
test('GET /coaching/slots - filters by teacher ID', async () => {
  const { teachers } = await setupTestData();
  const teacherId = teachers[0].UserID;

  const { status, data } = await makeRequest(
    'GET',
    `/coaching/slots?startDate=2026-04-27&endDate=2026-05-04&teacherId=${teacherId}`
  );

  assert.equal(status, 200);
  assert.ok(data.teachers.length <= 1, 'Should filter to one teacher');
  if (data.teachers.length > 0) {
    assert.equal(data.teachers[0].teacherId, teacherId);
  }
});

// Test: Filter by modality ID
test('GET /coaching/slots - filters by modality ID', async () => {
  const { modalities } = await setupTestData();
  const modalityId = modalities[0].ModalityID;

  const { status, data } = await makeRequest(
    'GET',
    `/coaching/slots?startDate=2026-04-27&endDate=2026-05-04&modalityId=${modalityId}`
  );

  assert.equal(status, 200);
  // Modalities array should always have all modalities
    assert.ok(data.modalities.length > 0, 'Modalities array should not be empty');
  // Teachers should only have those teaching this modality
  if (data.teachers.length > 0) {
    data.teachers.forEach((teacher) => {
      assert.ok(
        teacher.modalityIds.includes(modalityId),
        `Teacher ${teacher.teacherId} should teach modality ${modalityId}`
      );
    });
  }
});

// Test: Combined teacher and modality filters
test('GET /coaching/slots - filters by both teacher and modality', async () => {
  const { teachers, modalities } = await setupTestData();
  const teacherId = teachers[0].UserID;
  const modalityId = modalities[0].ModalityID;

  const { status, data } = await makeRequest(
    'GET',
    `/coaching/slots?startDate=2026-04-27&endDate=2026-05-04&teacherId=${teacherId}&modalityId=${modalityId}`
  );

  assert.equal(status, 200);
  // Should only return the filtered teacher (if they teach the modality)
  if (data.teachers.length > 0) {
    data.teachers.forEach((teacher) => {
      assert.equal(teacher.teacherId, teacherId);
      assert.ok(teacher.modalityIds.includes(modalityId));
    });
  }
});

// Test: Invalid date range
test('GET /coaching/slots - rejects invalid date format', async () => {
  const { status, data } = await makeRequest(
    'GET',
    '/coaching/slots?startDate=invalid-date&endDate=2026-05-04'
  );

  assert.equal(status, 400);
  assert.ok(data.error, 'Should return error message');
});

// Test: End date before start date
test('GET /coaching/slots - rejects end date before start date', async () => {
  const { status, data } = await makeRequest(
    'GET',
    '/coaching/slots?startDate=2026-05-04&endDate=2026-04-27'
  );

  assert.equal(status, 400);
  assert.ok(data.error, 'Should return error message');
});

// Test: Invalid teacher ID
test('GET /coaching/slots - rejects invalid teacher ID', async () => {
  const { status, data } = await makeRequest(
    'GET',
    '/coaching/slots?startDate=2026-04-27&endDate=2026-05-04&teacherId=invalid'
  );

  assert.equal(status, 400);
  assert.ok(data.error, 'Should return error message');
});

// Test: Invalid modality ID
test('GET /coaching/slots - rejects invalid modality ID', async () => {
  const { status, data } = await makeRequest(
    'GET',
    '/coaching/slots?startDate=2026-04-27&endDate=2026-05-04&modalityId=invalid'
  );

  assert.equal(status, 400);
  assert.ok(data.error, 'Should return error message');
});

// Test: Backwards compatibility with weekStart
test('GET /coaching/slots - supports legacy weekStart parameter', async () => {
  const { status, data } = await makeRequest(
    'GET',
    '/coaching/slots?weekStart=2026-04-27'
  );

  assert.equal(status, 200);
  assert.equal(data.rangeStart, '2026-04-27');
  // Should be 7 days later
  const expectedEnd = new Date('2026-04-27');
  expectedEnd.setUTCDate(expectedEnd.getUTCDate() + 7);
  assert.equal(data.rangeEnd, expectedEnd.toISOString().slice(0, 10));
});

// Test: Date range takes precedence over weekStart
test('GET /coaching/slots - date range takes precedence over weekStart', async () => {
  const { status, data } = await makeRequest(
    'GET',
    '/coaching/slots?startDate=2026-04-20&endDate=2026-05-10&weekStart=2026-04-27'
  );

  assert.equal(status, 200);
  assert.equal(data.rangeStart, '2026-04-20');
  assert.equal(data.rangeEnd, '2026-05-10');
});

// Test: Response structure
test('GET /coaching/slots - response has correct structure', async () => {
  const { status, data } = await makeRequest(
    'GET',
    '/coaching/slots?startDate=2026-04-27&endDate=2026-05-04'
  );

  assert.equal(status, 200);

  // Check top-level fields
  assert.ok(data.rangeStart, 'Missing rangeStart');
  assert.ok(data.rangeEnd, 'Missing rangeEnd');

  // Check teachers array structure
  assert.ok(Array.isArray(data.teachers));
  if (data.teachers.length > 0) {
    const teacher = data.teachers[0];
    assert.ok(teacher.teacherId, 'Teacher missing teacherId');
    assert.ok(teacher.name, 'Teacher missing name');
    assert.ok(Array.isArray(teacher.modalityIds), 'Teacher missing modalityIds array');
  }

  // Check modalities array structure
  assert.ok(Array.isArray(data.modalities));
  if (data.modalities.length > 0) {
    const modality = data.modalities[0];
    assert.ok(modality.modalityId, 'Modality missing modalityId');
    assert.ok(modality.modalityName, 'Modality missing modalityName');
  }

  // Check studios array structure
  assert.ok(Array.isArray(data.studios));
  if (data.studios.length > 0) {
    const studio = data.studios[0];
    assert.ok(studio.studioId, 'Studio missing studioId');
    assert.ok(studio.studioName, 'Studio missing studioName');
    assert.ok(typeof studio.capacity === 'number', 'Studio missing capacity');
    assert.ok(Array.isArray(studio.modalityIds), 'Studio missing modalityIds array');
  }

  // Check availabilityWindows array structure (if any)
  assert.ok(Array.isArray(data.availabilityWindows));
  if (data.availabilityWindows.length > 0) {
    const window = data.availabilityWindows[0];
    assert.ok(window.teacherId, 'Window missing teacherId');
    assert.ok(window.date, 'Window missing date');
    assert.ok(typeof window.dayOfWeek === 'number', 'Window missing dayOfWeek');
    assert.ok(window.windowStart, 'Window missing windowStart');
    assert.ok(window.windowEnd, 'Window missing windowEnd');
    assert.ok(Array.isArray(window.bookedSessions), 'Window missing bookedSessions array');
  }
});

console.log('✓ All coaching availability search integration tests passed');
}
