/**
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

/**
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

/**
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { withPatchedModules } = require('./helpers/moduleLoader');

/**
 * ═════════════════════════════════════════════════════════════════════════
 * TESTES: student.controller.js (Endpoints do Painel do Aluno)
 * ═════════════════════════════════════════════════════════════════════════
 * 
 * O QUE ESTÁ A SER TESTADO:
 * ─────────────────────────
 *   Endpoints que servem o painel do aluno (dashboard):
 *   - getStudentDashboard(): Retorna KPIs (coaching, marketplace, inventário)
 *   - getDashboardNotifications(): Notificações pendentes
 *   - getStudentProfile(): Dados do aluno (nome, email, etc.)
 *   - updateStudentProfile(): Alterar dados de conta
 * 
 * LÓGICA TESTADA:
 * ───────────────
 *   Cada endpoint precisa:
 *   1. Extrair userId do contexto autenticado (req.auth.userId)
 *   2. Buscar dados do aluno (user, perfil, notificações)
 *   3. Validar que aluno existe e está ativo
 *   4. Agregar dados (KPIs de múltiplas tabelas)
 *   5. Serializar resposta com campos corretos
 * 
 * PADRÕES TESTADOS:
 * ────────────────
 *   - Aluno não existe → 404
 *   - Aluno existe → 200 com dados
 *   - Notificações agregadas de múltiplas tabelas
 *   - Campos corretos na resposta (userId, email, firstName, etc.)
 *   - Contagem de transações, pedidos, sessões
 * 
 */

const mockState = {
  user: null,
  sessionStudentCounts: [],
  sessionStudentFindMany: [],
  validationSessions: [],
  notifications: [],
  counts: {
    coachingJoinRequest: 0,
    coachingSession: 0,
    inventoryTransaction: 0,
    marketplaceTransaction: 0,
  },
  joinRequestStatuses: [
    { StatusID: 1, StatusName: 'PendingTeacher' },
    { StatusID: 2, StatusName: 'PendingAdmin' },
    { StatusID: 3, StatusName: 'Approved' },
  ],
};

const fakePrisma = {
  user: {
    findFirst: async () => mockState.user,
  },
  sessionStudent: {
    count: async () => mockState.sessionStudentCounts.shift() ?? 0,
    findMany: async () => mockState.sessionStudentFindMany.shift() ?? [],
  },
  sessionValidation: {
    findMany: async () => mockState.validationSessions,
  },
  coachingJoinRequest: {
    count: async () => mockState.counts.coachingJoinRequest,
  },
  coachingJoinRequestStatus: {
    findMany: async () => mockState.joinRequestStatuses,
  },
  coachingSession: {
    count: async () => mockState.counts.coachingSession,
  },
  notification: {
    findMany: async () => mockState.notifications,
  },
  inventoryTransaction: {
    count: async () => mockState.counts.inventoryTransaction,
  },
  marketplaceTransaction: {
    count: async () => mockState.counts.marketplaceTransaction,
  },
};

const { getProfile, getDashboard, getUpcomingSchedule } = withPatchedModules(
  { '../config/prisma': fakePrisma },
  () => require('../../src/controllers/student.controller')
);

function createResponse() {
  return {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    },
  };
}

async function runController(handler, auth, extra = {}) {
  const req = {
    auth,
    ...extra,
  };
  const res = createResponse();
  let nextCalled = false;

  await handler(req, res, () => {
    nextCalled = true;
  });

  return { res, nextCalled };
}

function makeUser(overrides = {}) {
  return {
    UserID: 12,
    AuthUID: 'auth-12',
    FirstName: 'Ana',
    LastName: 'Silva',
    Email: 'ana@example.com',
    PhoneNumber: '999',
    Photo: null,
    CreatedAt: new Date('2026-01-01T10:00:00Z'),
    UpdatedAt: new Date('2026-01-02T10:00:00Z'),
    StudentAccount: {
      StudentAccountID: 7,
      BirthDate: new Date('2005-03-04T00:00:00Z'),
      GuardianName: 'Maria',
      GuardianPhone: '123',
    },
    ...overrides,
  };
}

function resetMockState() {
  mockState.user = null;
  mockState.sessionStudentCounts = [];
  mockState.sessionStudentFindMany = [];
  mockState.validationSessions = [];
  mockState.notifications = [];
  mockState.counts.coachingJoinRequest = 0;
  mockState.counts.coachingSession = 0;
  mockState.counts.inventoryTransaction = 0;
  mockState.counts.marketplaceTransaction = 0;
  mockState.joinRequestStatuses = [
    { StatusID: 1, StatusName: 'PendingTeacher' },
    { StatusID: 2, StatusName: 'PendingAdmin' },
    { StatusID: 3, StatusName: 'Approved' },
  ];
}

test('student dashboard rejects sessions without a student role', async () => {
  resetMockState();

  const result = await runController(getDashboard, { userId: 123, role: 'teacher' });

  assert.equal(result.res.statusCode, 403);
  assert.deepEqual(result.res.payload, { error: 'Forbidden' });
  assert.equal(result.nextCalled, false);
});

test('student profile rejects sessions without a student role', async () => {
  resetMockState();

  const result = await runController(getProfile, { userId: 123, role: 'teacher' });

  assert.equal(result.res.statusCode, 403);
  assert.deepEqual(result.res.payload, { error: 'Forbidden' });
  assert.equal(result.nextCalled, false);
});

test('student profile returns profile and statistics payloads', async () => {
  resetMockState();

  mockState.user = makeUser();

  // totalSessionsEnrolled=4, upcomingSessions=2, completedSessions=1
  mockState.sessionStudentCounts = [4, 2, 1];

  mockState.sessionStudentFindMany = [
    // attendance (sessionStudentsWithStatus)
    [
      { AttendanceStatus: { StatusName: 'attended' } },
      { AttendanceStatus: { StatusName: 'attended' } },
    ],
    // nextSessions (nextSessionsRaw)
    [
      {
        CoachingSession: {
          SessionID: 99,
          StartTime: new Date('2026-03-27T18:30:00Z'),
          EndTime: new Date('2026-03-27T19:30:00Z'),
          Modality: { ModalityName: 'Ballet' },
          Studio: { StudioName: 'Studio A' },
          SessionStatus: { StatusName: 'Scheduled' },
        },
      },
    ],
    // sessionModalityRaw
    [
      { CoachingSession: { Modality: { ModalityName: 'Ballet' } } },
      { CoachingSession: { Modality: { ModalityName: 'Ballet' } } },
    ],
  ];

  mockState.counts.coachingJoinRequest = 1;
  mockState.counts.inventoryTransaction = 2;
  mockState.counts.marketplaceTransaction = 3;

  const req = {
    auth: {
      userId: 12,
      role: 'student',
    },
  };
  const res = createResponse();

  await getProfile(req, res, () => {
    throw new Error('next() should not be called for a successful profile request');
  });

  assert.equal(res.statusCode, null);
  assert.deepEqual(res.payload.profile.studentCode, 'ST-0007');
  assert.equal(res.payload.statistics.upcomingSessions, 2);
  assert.equal(res.payload.statistics.totalJoinRequests, 1);
  assert.equal(res.payload.statistics.totalInventoryRentals, 2);
  assert.equal(res.payload.statistics.totalMarketplacePurchases, 3);
});

      test('student dashboard returns summary, notifications and schedule', async () => {
        resetMockState();

        mockState.user = makeUser();

        // upcomingSessions count
        mockState.sessionStudentCounts = [2];

        // pendingValidations: 1 distinct session
        mockState.validationSessions = [{ SessionID: 10 }];

        // reviewRequests via coachingJoinRequest.count: 0 (default)
        // externalPayments via coachingSession.count: 0 (default)

        mockState.notifications = [
          {
            NotificationID: 1,
            Title: 'Session confirmed',
            Message: 'Session confirmed',
            IsRead: false,
            CreatedAt: new Date('2026-03-20T09:00:00Z'),
          },
        ];

        // schedule via listUpcomingSchedule → sessionStudent.findMany
        mockState.sessionStudentFindMany = [
          [
            {
              CoachingSession: {
                SessionID: 21,
                StartTime: new Date('2026-03-27T18:30:00Z'),
                Studio: { StudioName: 'Studio A' },
                SessionStatus: { StatusName: 'Scheduled' },
                SessionTeacher: [{ User: { FirstName: 'Ana', LastName: null } }],
              },
            },
          ],
        ];

        const result = await runController(getDashboard, { userId: 12, role: 'student' });

        assert.equal(result.res.statusCode, null);
        assert.deepEqual(result.res.payload, {
          upcomingSessions: 2,
          pendingValidations: 1,
          reviewRequests: 0,
          externalPaymentsInProgress: 0,
          notifications: [
            {
              id: 1,
              title: 'Session confirmed',
              message: 'Session confirmed',
              read: false,
              createdAt: new Date('2026-03-20T09:00:00Z'),
            },
          ],
          schedule: [
            {
              sessionId: 21,
              date: '2026-03-27',
              time: '18:30',
              teacher: 'Ana',
              studio: 'Studio A',
              status: 'Scheduled',
            },
          ],
        });
      });

      test('getUpcomingSchedule rejects non-student roles', async () => {
        resetMockState();

        const result = await runController(getUpcomingSchedule, { userId: 123, role: 'teacher' });

        assert.equal(result.res.statusCode, 403);
        assert.deepEqual(result.res.payload, { error: 'Forbidden' });
        assert.equal(result.nextCalled, false);
      });

      test('getUpcomingSchedule returns 404 when student profile is missing', async () => {
        resetMockState();

        // user.findFirst returns null → profile not found → 404
        mockState.user = null;

        const result = await runController(getUpcomingSchedule, { userId: 12, role: 'student' });

        assert.equal(result.res.statusCode, 404);
        assert.deepEqual(result.res.payload, { error: 'Student account not found' });
        assert.equal(result.nextCalled, false);
      });

      test('getUpcomingSchedule returns schedule with expected payload shape', async () => {
        resetMockState();

        mockState.user = makeUser();

        mockState.sessionStudentFindMany = [
          [
            {
              CoachingSession: {
                SessionID: 21,
                StartTime: new Date('2026-03-27T18:30:00Z'),
                Studio: { StudioName: 'Studio A' },
                SessionStatus: { StatusName: 'Scheduled' },
                SessionTeacher: [{ User: { FirstName: 'Ana', LastName: null } }],
              },
            },
            {
              CoachingSession: {
                SessionID: 22,
                StartTime: new Date('2026-03-28T19:00:00Z'),
                Studio: { StudioName: 'Studio B' },
                SessionStatus: { StatusName: 'Scheduled' },
                SessionTeacher: [{ User: { FirstName: 'João', LastName: null } }],
              },
            },
          ],
        ];

        const result = await runController(getUpcomingSchedule, { userId: 12, role: 'student' });

        assert.equal(result.res.statusCode, null);
        assert.ok(result.res.payload.schedule, 'Response should have schedule property');
        assert.ok(Array.isArray(result.res.payload.schedule), 'schedule should be an array');
        assert.equal(result.res.payload.schedule.length, 2, 'schedule should have 2 items');
        assert.deepEqual(result.res.payload.schedule[0], {
          sessionId: 21,
          date: '2026-03-27',
          time: '18:30',
          teacher: 'Ana',
          studio: 'Studio A',
          status: 'Scheduled',
        });
        assert.deepEqual(result.res.payload.schedule[1], {
          sessionId: 22,
          date: '2026-03-28',
          time: '19:00',
          teacher: 'João',
          studio: 'Studio B',
          status: 'Scheduled',
        });
      });
