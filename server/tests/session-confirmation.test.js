/**
 * Session Confirmation Tracking — Integration Tests (BR-14 / BR-16)
 *
 * Covers:
 *   GET  /teacher/sessions/pending
 *   PATCH /teacher/sessions/:id/confirm-completion
 *   POST  /teacher/sessions/:id/no-show
 */

const request = require('supertest');

const { createTestApp } = require('./helpers/createTestApp');
const { buildLoginPayload, buildUser } = require('./fixtures/auth.fixtures');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PAST_TIME = new Date('2026-04-20T10:00:00.000Z');
const FUTURE_TIME = new Date('2099-01-01T12:00:00.000Z');

/** Builds a CoachingSession row as Prisma would return it from findFirst/findMany */
function buildSession({
  sessionId = 1,
  statusName = 'Scheduled',
  endTime = PAST_TIME,
  validations = [],
  students = [],
  reviewNotes = null,
} = {}) {
  return {
    SessionID: sessionId,
    StartTime: new Date(endTime.getTime() - 3_600_000),
    EndTime: endTime,
    ReviewNotes: reviewNotes,
    StatusID: 1,
    SessionStatus: { StatusID: 1, StatusName: statusName },
    Studio: { StudioName: 'Sala A' },
    Modality: { ModalityName: 'Ballet' },
    SessionValidation: validations,
    SessionStudent: students,
    ValidationRequestedAt: null,
  };
}

function buildEnrollment({
  studentAccountId = 10,
  userId = 20,
  firstName = 'Ana',
  lastName = 'Silva',
  email = 'ana@example.com',
  attendanceStatus = 'Pending',
} = {}) {
  return {
    StudentAccountID: studentAccountId,
    AttendanceStatusID: 1,
    AttendanceStatus: { StatusName: attendanceStatus },
    StudentAccount: {
      User: { UserID: userId, FirstName: firstName, LastName: lastName, Email: email },
    },
  };
}

// ---------------------------------------------------------------------------
// Context factory — one per test (jest.resetModules inside createTestApp)
// ---------------------------------------------------------------------------

function createContext() {
  const teacherUser = buildUser({ userId: 5, email: 'teacher@example.com', role: 'teacher' });
  const studentUser = buildUser({ userId: 20, email: 'student@example.com', role: 'student' });
  const adminUser   = buildUser({ userId: 99, email: 'admin@example.com',   role: 'admin'   });

  const usersByEmail = new Map([teacherUser, studentUser, adminUser].map((u) => [u.Email, u]));
  const usersById    = new Map([teacherUser, studentUser, adminUser].map((u) => [u.UserID, u]));

  // Mutable per-test state
  const db = {
    // coachingSession.findMany  (getPendingSessions)
    sessionRows: [],
    // coachingSession.findFirst (confirmCompletion / registerNoShow)
    sessionRow: null,
    // sessionStatus.findMany
    sessionStatuses: [{ StatusID: 7, StatusName: 'FINALIZATION_VALIDATION_PENDING' }],
    // attendanceStatus.findMany
    attendanceStatuses: [{ AttendanceStatusID: 3, StatusName: 'NO_SHOW' }],
    // validationStep.findMany
    validationSteps: [
      { StepID: 2, StepName: 'TeacherConfirmation' },
      { StepID: 3, StepName: 'NoShowRecorded'      },
    ],
    // userRole.findMany — admins for notifications
    adminUserRoleRows: [{ UserID: adminUser.UserID }],
    // financialEntry.findFirst — return null to trigger penalty creation
    existingPenalty: null,
    // captured calls
    sessionUpdates:           [],
    validationCreated:        null,
    attendanceUpdate:         null,
    notificationsCreated:     [],
    noShowPenaltyApplied:     false,
  };

  const prismaMock = {
    user: {
      findUnique: jest.fn(async ({ where }) => {
        if (where?.Email)  return usersByEmail.get(String(where.Email).toLowerCase()) ?? null;
        if (where?.UserID) return usersById.get(Number(where.UserID)) ?? null;
        return null;
      }),
    },

    // getPendingSessions queries coachingSession.findMany directly
    coachingSession: {
      findMany: jest.fn(async () => db.sessionRows),
      findFirst: jest.fn(async () => db.sessionRow),
      update: jest.fn(async ({ data }) => {
        db.sessionUpdates.push(data);
        return {};
      }),
    },

    // resolveOrCreateSessionStatusId uses findMany
    sessionStatus: {
      findMany: jest.fn(async () => db.sessionStatuses),
      create: jest.fn(async ({ data }) => ({ StatusID: 99, ...data })),
    },

    // resolveOrCreateAttendanceStatusId uses findMany
    attendanceStatus: {
      findMany: jest.fn(async () => db.attendanceStatuses),
      create: jest.fn(async ({ data }) => ({ AttendanceStatusID: 98, ...data })),
    },

    // getOrCreateValidationStep uses findMany with select
    validationStep: {
      findMany: jest.fn(async () => db.validationSteps),
      create: jest.fn(async ({ data }) => ({ StepID: 97, ...data })),
    },

    sessionValidation: {
      create: jest.fn(async ({ data }) => {
        db.validationCreated = data;
        return { ValidationID: 500, ValidatedAt: new Date(), ...data };
      }),
    },

    sessionStudent: {
      update: jest.fn(async ({ data }) => {
        db.attendanceUpdate = data;
        return {};
      }),
    },

    // listAdminUserIds uses userRole.findMany with role filter
    userRole: {
      findMany: jest.fn(async () => db.adminUserRoleRows),
    },

    notification: {
      create: jest.fn(async ({ data }) => {
        db.notificationsCreated.push(data);
        return { NotificationID: Math.random(), ...data };
      }),
      createMany: jest.fn(async ({ data }) => {
        (Array.isArray(data) ? data : [data]).forEach((n) => db.notificationsCreated.push(n));
        return { count: Array.isArray(data) ? data.length : 1 };
      }),
    },

    financialEntry: {
      findFirst: jest.fn(async () => db.existingPenalty),
    },

    $transaction: jest.fn(async (fn) => fn(prismaMock)),
  };

  const bcryptMock = { compare: jest.fn(async () => true) };

  const notificationControllerMock = {
    getAll:              jest.fn((_req, res) => res.status(501).end()),
    getById:             jest.fn((_req, res) => res.status(501).end()),
    markAsRead:          jest.fn((_req, res) => res.status(501).end()),
    remove:              jest.fn((_req, res) => res.status(501).end()),
    create:              jest.fn((_req, res) => res.status(501).end()),
    broadcastNotification: jest.fn((_req, res) => res.status(501).end()),
    sendNotification:    jest.fn(async () => ({ notificationId: 1 })),
  };

  // pricingService is instantiated at controller load time via createPricingService(prisma)
  const pricingServiceMock = {
    createPricingService: jest.fn(() => ({
      applyNoShowPenalty: jest.fn(async () => {
        db.noShowPenaltyApplied = true;
        return { EntryID: 900 };
      }),
    })),
  };

  const { app } = createTestApp({
    prismaMock,
    bcryptMock,
    notificationControllerMock,
    pricingServiceMock,
  });

  return { app, teacherUser, studentUser, db, prismaMock };
}

async function loginAs(agent, user) {
  const res = await agent.post('/auth/login').send(buildLoginPayload(user.Email));
  expect(res.status).toBe(200);
}

// ---------------------------------------------------------------------------
// GET /teacher/sessions/pending
// ---------------------------------------------------------------------------

describe('GET /teacher/sessions/pending', () => {
  test('returns 401 when unauthenticated', async () => {
    const { app } = createContext();
    const res = await request(app).get('/teacher/sessions/pending');
    expect(res.status).toBe(401);
  });

  test('returns 403 for student role', async () => {
    const { app, studentUser } = createContext();
    const agent = request.agent(app);
    await loginAs(agent, studentUser);

    const res = await agent.get('/teacher/sessions/pending');
    expect(res.status).toBe(403);
  });

  test('returns empty list when no sessions exist', async () => {
    const { app, teacherUser, db } = createContext();
    db.sessionRows = [];

    const agent = request.agent(app);
    await loginAs(agent, teacherUser);

    const res = await agent.get('/teacher/sessions/pending');
    expect(res.status).toBe(200);
    expect(res.body.sessions).toEqual([]);
    expect(res.body.summary.pendingCount).toBe(0);
  });

  test('returns pending sessions with mapped student list', async () => {
    const { app, teacherUser, db } = createContext();
    db.sessionRows = [
      buildSession({
        sessionId: 42,
        students: [buildEnrollment({ studentAccountId: 10, userId: 20, firstName: 'Ana', lastName: 'Silva' })],
      }),
    ];

    const agent = request.agent(app);
    await loginAs(agent, teacherUser);

    const res = await agent.get('/teacher/sessions/pending');
    expect(res.status).toBe(200);
    expect(res.body.summary.pendingCount).toBe(1);

    const session = res.body.sessions[0];
    expect(session.sessionId).toBe(42);
    expect(session.studioName).toBe('Sala A');
    expect(session.modalityName).toBe('Ballet');
    expect(session.students).toHaveLength(1);
    expect(session.students[0].studentName).toBe('Ana Silva');
    expect(session.students[0].studentEmail).toBe('ana@example.com');
    expect(session.students[0].canRegisterNoShow).toBe(true);
  });

  test('excludes sessions with terminal status (cancelled)', async () => {
    const { app, teacherUser, db } = createContext();
    db.sessionRows = [buildSession({ sessionId: 1, statusName: 'Cancelled' })];

    const agent = request.agent(app);
    await loginAs(agent, teacherUser);

    const res = await agent.get('/teacher/sessions/pending');
    expect(res.status).toBe(200);
    expect(res.body.sessions).toHaveLength(0);
  });

  test('marks teacherConfirmed=true when teacher already confirmed', async () => {
    const { app, teacherUser, db } = createContext();
    db.sessionRows = [
      buildSession({
        sessionId: 1,
        validations: [
          {
            ValidatedByUserID: teacherUser.UserID,
            ValidationStep: { StepName: 'TeacherConfirmation' },
          },
        ],
      }),
    ];

    const agent = request.agent(app);
    await loginAs(agent, teacherUser);

    const res = await agent.get('/teacher/sessions/pending');
    expect(res.status).toBe(200);
    // Session still appears (not filtered out) but teacherConfirmed=true, canConfirmCompletion=false
    expect(res.body.sessions[0].teacherConfirmed).toBe(true);
    expect(res.body.sessions[0].canConfirmCompletion).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PATCH /teacher/sessions/:id/confirm-completion
// ---------------------------------------------------------------------------

describe('PATCH /teacher/sessions/:id/confirm-completion', () => {
  test('returns 401 when unauthenticated', async () => {
    const { app } = createContext();
    const res = await request(app).patch('/teacher/sessions/1/confirm-completion');
    expect(res.status).toBe(401);
  });

  test('returns 403 for student role', async () => {
    const { app, studentUser } = createContext();
    const agent = request.agent(app);
    await loginAs(agent, studentUser);

    const res = await agent.patch('/teacher/sessions/1/confirm-completion');
    expect(res.status).toBe(403);
  });

  test('returns 400 for non-numeric session id', async () => {
    const { app, teacherUser } = createContext();
    const agent = request.agent(app);
    await loginAs(agent, teacherUser);

    const res = await agent.patch('/teacher/sessions/abc/confirm-completion');
    expect(res.status).toBe(400);
  });

  test('returns 404 when session not found or teacher not assigned', async () => {
    const { app, teacherUser, db } = createContext();
    db.sessionRow = null;
    const agent = request.agent(app);
    await loginAs(agent, teacherUser);

    const res = await agent.patch('/teacher/sessions/99/confirm-completion');
    expect(res.status).toBe(404);
  });

  test('returns 409 when session has not ended yet', async () => {
    const { app, teacherUser, db } = createContext();
    db.sessionRow = buildSession({ sessionId: 1, endTime: FUTURE_TIME });
    const agent = request.agent(app);
    await loginAs(agent, teacherUser);

    const res = await agent.patch('/teacher/sessions/1/confirm-completion');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/has not ended yet/i);
  });

  test('returns 409 when session is in a terminal state', async () => {
    const { app, teacherUser, db } = createContext();
    db.sessionRow = buildSession({ sessionId: 1, statusName: 'Cancelled', endTime: PAST_TIME });
    const agent = request.agent(app);
    await loginAs(agent, teacherUser);

    const res = await agent.patch('/teacher/sessions/1/confirm-completion');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/not eligible/i);
  });

  test('returns 409 when teacher already confirmed this session', async () => {
    const { app, teacherUser, db } = createContext();
    db.sessionRow = buildSession({
      sessionId: 1,
      endTime: PAST_TIME,
      validations: [
        {
          ValidatedByUserID: teacherUser.UserID,
          ValidationStep: { StepName: 'TeacherConfirmation' },
        },
      ],
    });
    const agent = request.agent(app);
    await loginAs(agent, teacherUser);

    const res = await agent.patch('/teacher/sessions/1/confirm-completion');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already confirmed/i);
  });

  test('records TeacherConfirmation and updates session status — BR-14', async () => {
    const { app, teacherUser, db, prismaMock } = createContext();
    db.sessionRow = buildSession({ sessionId: 1, endTime: PAST_TIME });

    const agent = request.agent(app);
    await loginAs(agent, teacherUser);

    const res = await agent.patch('/teacher/sessions/1/confirm-completion');
    expect(res.status).toBe(201);
    expect(res.body.sessionId).toBe(1);
    expect(res.body.validationId).toBeDefined();
    expect(res.body.validatedAt).toBeDefined();

    // Validation record created with teacher's user id
    expect(db.validationCreated).toMatchObject({
      SessionID: 1,
      ValidatedByUserID: teacherUser.UserID,
    });

    // Session status updated to FINALIZATION_VALIDATION_PENDING (StatusID 7)
    expect(prismaMock.coachingSession.update).toHaveBeenCalled();
    const statusUpdate = db.sessionUpdates.find((u) => u.StatusID === 7);
    expect(statusUpdate).toBeDefined();

    // Admin notification sent
    expect(db.notificationsCreated.length).toBeGreaterThan(0);
    expect(db.notificationsCreated[0].UserID).toBe(99); // adminUser.UserID
    expect(db.notificationsCreated[0].SessionID).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// POST /teacher/sessions/:id/no-show
// ---------------------------------------------------------------------------

describe('POST /teacher/sessions/:id/no-show (BR-16)', () => {
  const validBody = { studentAccountId: 10, remarks: 'Aluno não apareceu nem avisou.' };

  test('returns 401 when unauthenticated', async () => {
    const { app } = createContext();
    const res = await request(app).post('/teacher/sessions/1/no-show').send(validBody);
    expect(res.status).toBe(401);
  });

  test('returns 403 for student role', async () => {
    const { app, studentUser } = createContext();
    const agent = request.agent(app);
    await loginAs(agent, studentUser);

    const res = await agent.post('/teacher/sessions/1/no-show').send(validBody);
    expect(res.status).toBe(403);
  });

  test('returns 400 when studentAccountId is missing', async () => {
    const { app, teacherUser, db } = createContext();
    db.sessionRow = buildSession({ sessionId: 1, endTime: PAST_TIME });
    const agent = request.agent(app);
    await loginAs(agent, teacherUser);

    const res = await agent.post('/teacher/sessions/1/no-show').send({ remarks: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/studentAccountId/i);
  });

  test('returns 400 when remarks are empty — BR-16 requires justification', async () => {
    const { app, teacherUser, db } = createContext();
    db.sessionRow = buildSession({ sessionId: 1, endTime: PAST_TIME });
    const agent = request.agent(app);
    await loginAs(agent, teacherUser);

    const res = await agent.post('/teacher/sessions/1/no-show').send({ studentAccountId: 10, remarks: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/remarks/i);
  });

  test('returns 404 when session not found', async () => {
    const { app, teacherUser, db } = createContext();
    db.sessionRow = null;
    const agent = request.agent(app);
    await loginAs(agent, teacherUser);

    const res = await agent.post('/teacher/sessions/99/no-show').send(validBody);
    expect(res.status).toBe(404);
  });

  test('returns 409 when session has not ended yet', async () => {
    const { app, teacherUser, db } = createContext();
    db.sessionRow = buildSession({
      sessionId: 1,
      endTime: FUTURE_TIME,
      students: [buildEnrollment({ studentAccountId: 10 })],
    });
    const agent = request.agent(app);
    await loginAs(agent, teacherUser);

    const res = await agent.post('/teacher/sessions/1/no-show').send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/before session end/i);
  });

  test('returns 404 when student not enrolled', async () => {
    const { app, teacherUser, db } = createContext();
    db.sessionRow = buildSession({ sessionId: 1, endTime: PAST_TIME, students: [] });
    const agent = request.agent(app);
    await loginAs(agent, teacherUser);

    const res = await agent.post('/teacher/sessions/1/no-show').send(validBody);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/enrollment not found/i);
  });

  test('returns 409 when no-show already registered', async () => {
    const { app, teacherUser, db } = createContext();
    db.sessionRow = buildSession({
      sessionId: 1,
      endTime: PAST_TIME,
      students: [buildEnrollment({ studentAccountId: 10, attendanceStatus: 'NO_SHOW' })],
    });
    const agent = request.agent(app);
    await loginAs(agent, teacherUser);

    const res = await agent.post('/teacher/sessions/1/no-show').send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already registered/i);
  });

  test('registers no-show, updates attendance, notifies student and admins, applies BR-16 penalty', async () => {
    const { app, teacherUser, db, prismaMock } = createContext();
    db.sessionRow = buildSession({
      sessionId: 1,
      endTime: PAST_TIME,
      students: [buildEnrollment({ studentAccountId: 10, userId: 20, attendanceStatus: 'Pending' })],
    });

    const agent = request.agent(app);
    await loginAs(agent, teacherUser);

    const res = await agent.post('/teacher/sessions/1/no-show').send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.sessionId).toBe(1);
    expect(res.body.studentAccountId).toBe(10);
    expect(res.body.attendanceStatus).toBe('NO_SHOW');

    // Attendance updated to NO_SHOW (AttendanceStatusID 3)
    expect(prismaMock.sessionStudent.update).toHaveBeenCalled();
    expect(db.attendanceUpdate).toMatchObject({ AttendanceStatusID: 3 });

    // Session status updated
    expect(db.sessionUpdates.length).toBeGreaterThan(0);

    // Notification to student (userId 20)
    const studentNotif = db.notificationsCreated.find((n) => n.UserID === 20);
    expect(studentNotif).toBeDefined();
    expect(studentNotif.SessionID).toBe(1);

    // Notification to admin (userId 99)
    const adminNotif = db.notificationsCreated.find((n) => n.UserID === 99);
    expect(adminNotif).toBeDefined();

    // BR-16 penalty triggered (pricingService called because financialEntry.findFirst returned null)
    expect(db.noShowPenaltyApplied).toBe(true);
  });

  test('skips penalty if financial entry already exists', async () => {
    const { app, teacherUser, db } = createContext();
    db.sessionRow = buildSession({
      sessionId: 1,
      endTime: PAST_TIME,
      students: [buildEnrollment({ studentAccountId: 10, attendanceStatus: 'Pending' })],
    });
    db.existingPenalty = { EntryID: 42 }; // already has a penalty

    const agent = request.agent(app);
    await loginAs(agent, teacherUser);

    const res = await agent.post('/teacher/sessions/1/no-show').send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.penaltyEntryId).toBe(42);
    expect(db.noShowPenaltyApplied).toBe(false); // not called again
  });
});
