const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

// ---------------------------------------------------------------------------
// Fábrica de estado
// ---------------------------------------------------------------------------

function buildState() {
  return {
    // resultados de coachingJoinRequest.findMany / findFirst
    joinRequests: [],
    // coachingJoinRequest.findUnique (para getAdmissionRequestForTeacher)
    joinRequestById: null,
    // coachingJoinRequestStatus.findFirst
    statusRows: [
      { StatusID: 10, StatusName: 'TEACHER_APPROVED' },
      { StatusID: 11, StatusName: 'TEACHER_REJECTED' },
    ],
    // contadores devolvidos por prisma.sessionTeacher.count, etc.
    classesToday: 3,
    pendingConfirmations: 1,
    admissionRequests: 2,
    noShows: 0,
    // sessionTeacher.findMany para o horário de hoje
    sessionTeacherRows: [],
    // valores capturados de coachingJoinRequest.update
    updatedJoinRequestData: null,
    // captura de notification.create
    createdNotification: null,
  };
}

let state = buildState();

// ---------------------------------------------------------------------------
// Prisma falso
// ---------------------------------------------------------------------------

const fakePrisma = {
  $transaction: async (fn) => fn(fakePrisma),

  coachingJoinRequestStatus: {
    findFirst: async ({ where }) => {
      return state.statusRows.find((s) => s.StatusName === where.StatusName) || null;
    },
    create: async ({ data }) => {
      const created = { StatusID: 99, ...data };
      state.statusRows.push(created);
      return created;
    },
  },

  coachingJoinRequest: {
    findFirst: async () => state.joinRequestById,
    findMany: async () => state.joinRequests,
    update: async ({ data }) => {
      state.updatedJoinRequestData = data;
      return {
        JoinRequestID: state.joinRequestById?.JoinRequestID || 1,
        ...state.joinRequestById,
        ...data,
        CoachingJoinRequestStatus: {
          StatusID: data.StatusID,
          StatusName: state.statusRows.find((s) => s.StatusID === data.StatusID)?.StatusName || 'Unknown',
        },
        StudentAccount: {
          UserID: 20,
          User: {
            UserID: 20,
            FirstName: 'João',
            LastName: 'Alves',
            Email: 'j@a.com',
          },
        },
      };
    },
    count: async () => state.admissionRequests,
  },

  sessionTeacher: {
    count: async ({ where }) => {
      if (where?.CoachingSession?.StartTime) return state.classesToday;
      return state.pendingConfirmations;
    },
    findMany: async () => state.sessionTeacherRows,
  },

  sessionStudent: {
    count: async () => state.noShows,
  },

  notification: {
    create: async ({ data }) => {
      state.createdNotification = data;
      return { NotificationID: 500, ...data };
    },
  },
};

// ---------------------------------------------------------------------------
// Substituição de módulos
// ---------------------------------------------------------------------------

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '../config/prisma') return fakePrisma;
  return originalLoad.call(this, request, parent, isMain);
};

let teacherController;
try {
  teacherController = require('../../src/controllers/teacher.controller');
} finally {
  Module._load = originalLoad;
}

// ---------------------------------------------------------------------------
// Funções auxiliares
// ---------------------------------------------------------------------------

function createResponse() {
  return {
    statusCode: null,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.payload = body; return this; },
  };
}

function buildSession({ userId = 1, role = 'teacher' } = {}) {
  return { userId, role };
}

function resetState(overrides = {}) {
  state = { ...buildState(), ...overrides };
}

function buildJoinRequest(overrides = {}) {
  return {
    JoinRequestID: 1,
    SessionID: 20,
    StudentAccountID: 55,
    ReviewedAt: null,
    ReviewedByUserID: null,
    CoachingJoinRequestStatus: { StatusName: 'PendingTeacher' },
    StudentAccount: {
      GuardianName: null,
      User: {
        UserID: 20,
        FirstName: 'João',
        LastName: 'Alves',
        Email: 'j@a.com',
      },
    },
    CoachingSession: {
      SessionID: 20,
      StartTime: new Date('2026-04-18T10:00:00Z'),
      EndTime: new Date('2026-04-18T11:00:00Z'),
      MaxParticipants: 5,
      Studio: { StudioName: 'Sala A' },
      Modality: { ModalityName: 'Ballet' },
      _count: { SessionStudent: 2 },
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getAuthenticatedTeacherUserId (testado indiretamente através de getDashboard)
// ---------------------------------------------------------------------------

test('getDashboard: returns 401 when session has no userId', async () => {
  resetState();
  const req = { session: { userId: null, role: 'teacher' } };
  const res = createResponse();
  await teacherController.getDashboard(req, res, (err) => { assert.fail(`unexpected next: ${err}`); });

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.payload, { error: 'Not authenticated' });
});

test('getDashboard: returns 403 when role is not teacher', async () => {
  resetState();
  const req = { session: { userId: 1, role: 'student' } };
  const res = createResponse();
  await teacherController.getDashboard(req, res, (err) => { assert.fail(`unexpected next: ${err}`); });

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.payload, { error: 'Forbidden' });
});

test('getDashboard: returns KPI counts for authenticated teacher', async () => {
  resetState({ classesToday: 2, pendingConfirmations: 1, admissionRequests: 3, noShows: 0 });

  const req = { session: buildSession() };
  const res = createResponse();
  await teacherController.getDashboard(req, res, (err) => { assert.fail(`unexpected next: ${err}`); });

  assert.equal(res.statusCode, null);
  assert.ok(typeof res.payload.classesToday === 'number');
  assert.ok(typeof res.payload.admissionRequests === 'number');
  assert.ok(typeof res.payload.noShows === 'number');
});

// ---------------------------------------------------------------------------
// getAdmissionRequests / getPendingAdmissions
// ---------------------------------------------------------------------------

test('getPendingAdmissions: returns 401 when not authenticated', async () => {
  resetState();
  const req = { session: { userId: null, role: 'teacher' } };
  const res = createResponse();
  await teacherController.getPendingAdmissions(req, res, () => {});

  assert.equal(res.statusCode, 401);
});

test('getPendingAdmissions: returns empty requests array when no pending admissions', async () => {
  resetState({ joinRequests: [] });

  const req = { session: buildSession() };
  const res = createResponse();
  await teacherController.getPendingAdmissions(req, res, (err) => { assert.fail(`unexpected next: ${err}`); });

  assert.equal(res.statusCode, null);
  assert.ok(Array.isArray(res.payload.requests));
  assert.equal(res.payload.requests.length, 0);
  assert.equal(res.payload.summary.pendingRequests, 0);
});

test('getPendingAdmissions: returns mapped admission requests', async () => {
  resetState();
  // prisma.coachingJoinRequest.findMany devolve um array que o controlador mapeia
  state.joinRequests = [
    {
      JoinRequestID: 1,
      SessionID: 20,
      StudentAccountID: 55,
      ReviewedAt: null,
      ReviewedByUserID: null,
      CoachingJoinRequestStatus: { StatusName: 'PendingTeacher' },
      StudentAccount: {
        GuardianName: 'Guardian',
        User: { UserID: 20, FirstName: 'João', LastName: 'Alves', Email: 'j@a.com' },
      },
      CoachingSession: {
        SessionID: 20,
        StartTime: new Date('2026-04-18T10:00:00Z'),
        EndTime: new Date('2026-04-18T11:00:00Z'),
        MaxParticipants: 5,
        Studio: { StudioName: 'Sala A' },
        Modality: { ModalityName: 'Ballet' },
        _count: { SessionStudent: 2 },
      },
    },
  ];

  const req = { session: buildSession() };
  const res = createResponse();
  await teacherController.getPendingAdmissions(req, res, (err) => { assert.fail(`unexpected next: ${err}`); });

  assert.equal(res.statusCode, null);
  assert.equal(res.payload.requests.length, 1);
  assert.equal(res.payload.summary.pendingRequests, 1);
  const r = res.payload.requests[0];
  assert.equal(r.joinRequestId, 1);
  assert.equal(r.studentName, 'João Alves');
  assert.equal(r.studioName, 'Sala A');
});

// ---------------------------------------------------------------------------
// reviewAdmissionRequest / applyAdmissionDecision
// ---------------------------------------------------------------------------

test('reviewAdmissionRequest: returns 401 when not authenticated', async () => {
  resetState();
  const req = {
    session: { userId: null, role: 'teacher' },
    params: { joinRequestId: '1' },
    body: { decision: 'approve' },
  };
  const res = createResponse();
  await teacherController.reviewAdmissionRequest(req, res, () => {});

  assert.equal(res.statusCode, 401);
});

test('reviewAdmissionRequest: returns 400 for invalid joinRequestId', async () => {
  resetState();
  const req = {
    session: buildSession(),
    params: { joinRequestId: 'abc' },
    body: { decision: 'approve' },
  };
  const res = createResponse();
  await teacherController.reviewAdmissionRequest(req, res, () => {});

  assert.equal(res.statusCode, 400);
  assert.match(res.payload.error, /joinRequestId/i);
});

test('reviewAdmissionRequest: returns 400 for invalid decision', async () => {
  resetState();
  const req = {
    session: buildSession(),
    params: { joinRequestId: '1' },
    body: { decision: 'maybe' },
  };
  const res = createResponse();
  await teacherController.reviewAdmissionRequest(req, res, () => {});

  assert.equal(res.statusCode, 400);
  assert.match(res.payload.error, /decision/i);
});

test('reviewAdmissionRequest: returns 400 when rejecting without observations', async () => {
  resetState({ joinRequestById: buildJoinRequest() });

  const req = {
    session: buildSession(),
    params: { joinRequestId: '1' },
    body: { decision: 'reject', observations: '' },
  };
  const res = createResponse();
  await teacherController.reviewAdmissionRequest(req, res, () => {});

  assert.equal(res.statusCode, 400);
  assert.match(res.payload.error, /observations/i);
});

test('reviewAdmissionRequest: returns 404 when join request not found for this teacher', async () => {
  resetState({ joinRequestById: null });

  const req = {
    session: buildSession(),
    params: { joinRequestId: '1' },
    body: { decision: 'approve' },
  };
  const res = createResponse();
  await teacherController.reviewAdmissionRequest(req, res, () => {});

  assert.equal(res.statusCode, 404);
});

test('reviewAdmissionRequest: returns 409 when request was already reviewed', async () => {
  resetState({
    joinRequestById: buildJoinRequest({
      ReviewedAt: new Date('2026-04-10T10:00:00Z'),
      ReviewedByUserID: 1,
    }),
  });

  const req = {
    session: buildSession(),
    params: { joinRequestId: '1' },
    body: { decision: 'approve' },
  };
  const res = createResponse();
  await teacherController.reviewAdmissionRequest(req, res, () => {});

  assert.equal(res.statusCode, 409);
});

test('reviewAdmissionRequest: approve succeeds and returns updated request', async () => {
  resetState({ joinRequestById: buildJoinRequest() });

  const req = {
    session: buildSession(),
    params: { joinRequestId: '1' },
    body: { decision: 'approve', observations: '' },
  };
  const res = createResponse();
  await teacherController.reviewAdmissionRequest(req, res, (err) => { assert.fail(`unexpected next: ${err}`); });

  assert.equal(res.statusCode, null);
  assert.ok(res.payload?.request);
  assert.ok(state.createdNotification, 'should create a notification');
});

test('reviewAdmissionRequest: reject succeeds with observations', async () => {
  resetState({ joinRequestById: buildJoinRequest() });

  const req = {
    session: buildSession(),
    params: { joinRequestId: '1' },
    body: { decision: 'reject', observations: 'Capacidade esgotada.' },
  };
  const res = createResponse();
  await teacherController.reviewAdmissionRequest(req, res, (err) => { assert.fail(`unexpected next: ${err}`); });

  assert.equal(res.statusCode, null);
  assert.ok(res.payload?.request);
  assert.ok(state.createdNotification);
});

// ---------------------------------------------------------------------------
// approveJoinRequest / rejectJoinRequest (handlers de atalho)
// ---------------------------------------------------------------------------

test('approveJoinRequest: forces decision=approve regardless of body', async () => {
  resetState({ joinRequestById: buildJoinRequest() });

  const req = {
    session: buildSession(),
    params: { joinRequestId: '1' },
    body: {}, // sem decisão no corpo — imposta pelo handler
  };
  const res = createResponse();
  await teacherController.approveJoinRequest(req, res, (err) => { assert.fail(`unexpected next: ${err}`); });

  assert.equal(res.statusCode, null);
  assert.ok(res.payload?.request);
});

test('rejectJoinRequest: forces decision=reject, returns 400 without observations', async () => {
  resetState({ joinRequestById: buildJoinRequest() });

  const req = {
    session: buildSession(),
    params: { joinRequestId: '1' },
    body: { observations: '' },
  };
  const res = createResponse();
  await teacherController.rejectJoinRequest(req, res, () => {});

  assert.equal(res.statusCode, 400);
});

// ---------------------------------------------------------------------------
// getTodaySchedule
// ---------------------------------------------------------------------------

test('getTodaySchedule: returns 401 when not authenticated', async () => {
  resetState();
  const req = { session: { userId: null, role: 'teacher' } };
  const res = createResponse();
  await teacherController.getTodaySchedule(req, res, () => {});

  assert.equal(res.statusCode, 401);
});

test('getTodaySchedule: returns empty schedule array when no sessions today', async () => {
  resetState({ sessionTeacherRows: [] });

  const req = { session: buildSession() };
  const res = createResponse();
  await teacherController.getTodaySchedule(req, res, (err) => { assert.fail(`unexpected next: ${err}`); });

  assert.equal(res.statusCode, null);
  assert.ok(Array.isArray(res.payload.schedule));
  assert.equal(res.payload.schedule.length, 0);
});

test('getTodaySchedule: maps session rows to expected shape', async () => {
  resetState({
    sessionTeacherRows: [
      {
        SessionID: 20,
        CoachingSession: {
          SessionID: 20,
          StartTime: new Date('2026-04-26T09:00:00Z'),
          EndTime: new Date('2026-04-26T10:00:00Z'),
          Studio: { StudioName: 'Sala A' },
          SessionStatus: { StatusName: 'Confirmed' },
          _count: { SessionStudent: 3 },
        },
      },
    ],
  });

  const req = { session: buildSession() };
  const res = createResponse();
  await teacherController.getTodaySchedule(req, res, (err) => { assert.fail(`unexpected next: ${err}`); });

  assert.equal(res.statusCode, null);
  assert.equal(res.payload.schedule.length, 1);
  const entry = res.payload.schedule[0];
  assert.equal(entry.sessionId, 20);
  assert.equal(entry.studio, 'Sala A');
  assert.equal(entry.status, 'Confirmed');
  assert.equal(entry.studentCount, 3);
});
