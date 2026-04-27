/**
 * Session Confirmation Tracking — Integration Tests (BR-14 / BR-16)
 *
 * Covers:
 *   GET  /teacher/sessions/pending
 *   PATCH /teacher/sessions/:sessionId/confirm-completion
 *   POST  /teacher/sessions/:sessionId/no-show
 */

const request = require('supertest');

const { createTestApp } = require('./helpers/createTestApp');
const { buildLoginPayload, buildUser } = require('./fixtures/auth.fixtures');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PAST_TIME = new Date('2026-04-20T10:00:00.000Z');
const FUTURE_TIME = new Date('2099-01-01T12:00:00.000Z');

function buildSession({
  sessionId = 1,
  statusName = 'Scheduled',
  endTime = PAST_TIME,
  validations = [],
  students = [],
} = {}) {
  return {
    SessionID: sessionId,
    StartTime: new Date(endTime.getTime() - 3600 * 1000),
    EndTime: endTime,
    ReviewNotes: null,
    SessionStatus: { StatusName: statusName },
    Studio: { StudioName: 'Sala A' },
    Modality: { ModalityName: 'Ballet' },
    SessionValidation: validations,
    SessionStudent: students,
  };
}

function buildStudentEnrollment({
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
// Context factory
// ---------------------------------------------------------------------------

function createContext() {
  const teacherUser = buildUser({ userId: 5, email: 'teacher@example.com', role: 'teacher' });
  const studentUser = buildUser({ userId: 20, email: 'student@example.com', role: 'student' });
  const adminUser = buildUser({ userId: 99, email: 'admin@example.com', role: 'admin' });

  const usersByEmail = new Map(
    [teacherUser, studentUser, adminUser].map((u) => [u.Email, u]),
  );
  const usersById = new Map(
    [teacherUser, studentUser, adminUser].map((u) => [u.UserID, u]),
  );

  // Mutable state — tests override per-case
  const db = {
    // sessionTeacher.findMany — returns rows used by getPendingSessions
    sessionTeacherRows: [
      {
        CoachingSession: buildSession({
          sessionId: 1,
          students: [buildStudentEnrollment()],
        }),
      },
    ],

    // coachingSession.findFirst — returned by confirmCompletion / registerNoShow
    sessionRow: null,

    // Resolved status / step IDs
    sessionStatusRow: { StatusID: 7, StatusName: 'FINALIZATION_VALIDATION_PENDING' },
    attendanceStatusRow: { AttendanceStatusID: 3, StatusName: 'NO_SHOW' },
    validationStepRows: [
      { StepID: 2, StepName: 'TeacherConfirmation' },
      { StepID: 3, StepName: 'NoShowRecorded' },
    ],

    // Admin user IDs for notifications
    adminUserRoleRows: [{ UserID: adminUser.UserID }],

    // Captured calls
    sessionUpdates: [],
    sessionValidationCreated: null,
    studentAttendanceUpdate: null,
    notificationsCreated: [],

    // Pricing service mock — captures calls
    noShowPenaltyApplied: false,
  };

  const prismaMock = {
    user: {
      findUnique: jest.fn(async ({ where }) => {
        if (where?.Email) return usersByEmail.get(String(where.Email).toLowerCase()) ?? null;
        if (where?.UserID) return usersById.get(Number(where.UserID)) ?? null;
        return null;
      }),
    },

    sessionTeacher: {
      findMany: jest.fn(async () => db.sessionTeacherRows),
    },

    coachingSession: {
      findFirst: jest.fn(async () => db.sessionRow),
      update: jest.fn(async ({ data }) => {
        db.sessionUpdates.push(data);
        return {};
      }),
    },

    sessionStatus: {
      findFirst: jest.fn(async ({ where } = {}) => {
        const containsValue =
          typeof where?.StatusName === 'object'
            ? where.StatusName.contains
            : (where?.StatusName ?? '');
        if (containsValue && db.sessionStatusRow.StatusName.includes(containsValue)) {
          return db.sessionStatusRow;
        }
        return null;
      }),
      create: jest.fn(async ({ data }) => ({ StatusID: 99, ...data })),
    },

    attendanceStatus: {
      findFirst: jest.fn(async () => db.attendanceStatusRow),
      create: jest.fn(async ({ data }) => ({ StatusID: 98, ...data })),
    },

    validationStep: {
      findMany: jest.fn(async () => db.validationStepRows),
      create: jest.fn(async ({ data }) => ({ StepID: 97, ...data })),
    },

    sessionValidation: {
      create: jest.fn(async ({ data }) => {
        db.sessionValidationCreated = data;
        return { ValidationID: 500, ...data };
      }),
    },

    sessionStudent: {
      update: jest.fn(async ({ data }) => {
        db.studentAttendanceUpdate = data;
        return {};
      }),
    },

    userRole: {
      findMany: jest.fn(async () => db.adminUserRoleRows),
    },

    notification: {
      create: jest.fn(async ({ data }) => {
        db.notificationsCreated.push(data);
        return { NotificationID: Math.random(), ...data };
      }),
    },

    $transaction: jest.fn(async (fn) => fn(prismaMock)),
  };

  const bcryptMock = { compare: jest.fn(async () => true) };

  const notificationControllerMock = {
    getAll: jest.fn((_req, res) => res.status(501).end()),
    getById: jest.fn((_req, res) => res.status(501).end()),
    markAsRead: jest.fn((_req, res) => res.status(501).end()),
    remove: jest.fn((_req, res) => res.status(501).end()),
    create: jest.fn((_req, res) => res.status(501).end()),
    broadcastNotification: jest.fn((_req, res) => res.status(501).end()),
    sendNotification: jest.fn(async () => ({ notificationId: 1 })),
  };

  const pricingServiceMock = {
    createPricingService: jest.fn(() => ({
      applyNoShowPenalty: jest.fn(async () => {
        db.noShowPenaltyApplied = true;
      }),
    })),
  };

  const { app } = createTestApp({ prismaMock, bcryptMock, notificationControllerMock, pricingServiceMock });

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

  test('returns 403 for non-teacher role (student)', async () => {
    const { app, studentUser } = createContext();
    const agent = request.agent(app);
    await loginAs(agent, studentUser);

    const res = await agent.get('/teacher/sessions/pending');
    expect(res.status).toBe(403);
  });

  test('returns empty list when no sessions need confirmation', async () => {
    const { app, teacherUser, db } = createContext();
    db.sessionTeacherRows = [];

    const agent = request.agent(app);
    await loginAs(agent, teacherUser);

    const res = await agent.get('/teacher/sessions/pending');
    expect(res.status).toBe(200);
    expect(res.body.sessions).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  test('returns pending sessions with mapped student list', async () => {
    const { app, teacherUser, db } = createContext();
    db.sessionTeacherRows = [
      {
        CoachingSession: buildSession({
          sessionId: 42,
          students: [buildStudentEnrollment({ studentAccountId: 10, userId: 20, firstName: 'Ana', lastName: 'Silva' })],
        }),
      },
    ];

    const agent = request.agent(app);
    await loginAs(agent, teacherUser);

    const res = await agent.get('/teacher/sessions/pending');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);

    const session = res.body.sessions[0];
    expect(session.sessionId).toBe(42);
    expect(session.studioName).toBe('Sala A');
    expect(session.modalityName).toBe('Ballet');
    expect(session.students).toHaveLength(1);
    expect(session.students[0].studentName).toBe('Ana Silva');
    expect(session.students[0].studentAccountId).toBe(10);
  });

  test('excludes sessions with terminal status (Cancelled)', async () => {
    const { app, teacherUser, db } = createContext();
    db.sessionTeacherRows = [
      { CoachingSession: buildSession({ sessionId: 1, statusName: 'Cancelled' }) },
    ];

    const agent = request.agent(app);
    await loginAs(agent, teacherUser);

    const res = await agent.get('/teacher/sessions/pending');
    expect(res.status).toBe(200);
    expect(res.body.sessions).toEqual([]);
  });

  test('excludes sessions already confirmed by this teacher (TeacherConfirmation step)', async () => {
    const { app, teacherUser, db } = createContext();
    db.sessionTeacherRows = [
      {
        CoachingSession: buildSession({
          sessionId: 1,
          validations: [
            {
              ValidatedByUserID: teacherUser.UserID,
              ValidationStep: { StepName: 'TeacherConfirmation' },
            },
          ],
        }),
      },
    ];

    const agent = request.agent(app);
    await loginAs(agent, teacherUser);

    const res = await agent.get('/teacher/sessions/pending');
    expect(res.status).toBe(200);
    expect(res.body.sessions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// PATCH /teacher/sessions/:sessionId/confirm-completion
// ---------------------------------------------------------------------------

describe('PATCH /teacher/sessions/:sessionId/confirm-completion', () => {
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

  test('returns 400 for non-numeric sessionId', async () => {
    const { app, teacherUser, db } = createContext();
    db.sessionRow = null;
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
    expect(res.body.error).toMatch(/ainda não terminou/i);
  });

  test('returns 409 when session is already in a terminal state', async () => {
    const { app, teacherUser, db } = createContext();
    db.sessionRow = buildSession({ sessionId: 1, statusName: 'cancelled', endTime: PAST_TIME });
    const agent = request.agent(app);
    await loginAs(agent, teacherUser);

    const res = await agent.patch('/teacher/sessions/1/confirm-completion');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/terminal/i);
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
    expect(res.body.error).toMatch(/já confirmou/i);
  });

  test('records TeacherConfirmation validation and updates session status (BR-14)', async () => {
    const { app, teacherUser, db, prismaMock } = createContext();
    db.sessionRow = buildSession({ sessionId: 1, endTime: PAST_TIME });
    db.sessionStatusRow = { StatusID: 7, StatusName: 'FINALIZATION_VALIDATION_PENDING' };

    const agent = request.agent(app);
    await loginAs(agent, teacherUser);

    const res = await agent.patch('/teacher/sessions/1/confirm-completion');
    expect(res.status).toBe(201);
    expect(res.body.sessionId).toBe(1);
    expect(res.body.validationId).toBeDefined();

    // Session status was updated to the pending-validation status
    expect(prismaMock.coachingSession.update).toHaveBeenCalled();
    const statusUpdate = db.sessionUpdates.find((u) => u.StatusID === 7);
    expect(statusUpdate).toBeDefined();

    // Validation record was created
    expect(db.sessionValidationCreated).toMatchObject({
      SessionID: 1,
      ValidatedByUserID: teacherUser.UserID,
    });

    // Admin notification was sent
    expect(db.notificationsCreated.length).toBeGreaterThan(0);
    const adminNotif = db.notificationsCreated[0];
    expect(adminNotif.UserID).toBe(99); // admin user id
    expect(adminNotif.SessionID).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// POST /teacher/sessions/:sessionId/no-show
// ---------------------------------------------------------------------------

describe('POST /teacher/sessions/:sessionId/no-show (BR-16)', () => {
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

  test('returns 400 when remarks are empty (BR-16 requires justification)', async () => {
    const { app, teacherUser, db } = createContext();
    db.sessionRow = buildSession({ sessionId: 1, endTime: PAST_TIME });
    const agent = request.agent(app);
    await loginAs(agent, teacherUser);

    const res = await agent.post('/teacher/sessions/1/no-show').send({ studentAccountId: 10, remarks: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/observa[çc][aã]o/i);
  });

  test('returns 404 when session is not found', async () => {
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
      students: [buildStudentEnrollment({ studentAccountId: 10 })],
    });
    const agent = request.agent(app);
    await loginAs(agent, teacherUser);

    const res = await agent.post('/teacher/sessions/1/no-show').send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/ainda não terminou/i);
  });

  test('returns 404 when student is not enrolled in the session', async () => {
    const { app, teacherUser, db } = createContext();
    db.sessionRow = buildSession({ sessionId: 1, endTime: PAST_TIME, students: [] });
    const agent = request.agent(app);
    await loginAs(agent, teacherUser);

    const res = await agent.post('/teacher/sessions/1/no-show').send(validBody);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/aluno não inscrito/i);
  });

  test('returns 409 when no-show was already registered for this student', async () => {
    const { app, teacherUser, db } = createContext();
    db.sessionRow = buildSession({
      sessionId: 1,
      endTime: PAST_TIME,
      students: [buildStudentEnrollment({ studentAccountId: 10, attendanceStatus: 'NO_SHOW' })],
    });
    const agent = request.agent(app);
    await loginAs(agent, teacherUser);

    const res = await agent.post('/teacher/sessions/1/no-show').send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/já registada/i);
  });

  test('registers no-show, updates attendance, notifies student and admins, applies BR-16 penalty', async () => {
    const { app, teacherUser, db, prismaMock } = createContext();
    db.sessionRow = buildSession({
      sessionId: 1,
      endTime: PAST_TIME,
      students: [buildStudentEnrollment({ studentAccountId: 10, userId: 20, attendanceStatus: 'Pending' })],
    });

    const agent = request.agent(app);
    await loginAs(agent, teacherUser);

    const res = await agent.post('/teacher/sessions/1/no-show').send(validBody);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ sessionId: 1, studentAccountId: 10, status: 'no_show_registered' });

    // Attendance status updated to NO_SHOW
    expect(prismaMock.sessionStudent.update).toHaveBeenCalled();
    expect(db.studentAttendanceUpdate).toMatchObject({ AttendanceStatusID: 3 }); // db.attendanceStatusRow.StatusID

    // Session status updated
    expect(db.sessionUpdates.length).toBeGreaterThan(0);

    // Notifications: one to student (userId 20), at least one to admin (userId 99)
    const studentNotif = db.notificationsCreated.find((n) => n.UserID === 20);
    expect(studentNotif).toBeDefined();
    expect(studentNotif.SessionID).toBe(1);

    const adminNotif = db.notificationsCreated.find((n) => n.UserID === 99);
    expect(adminNotif).toBeDefined();

    // BR-16 penalty applied
    expect(db.noShowPenaltyApplied).toBe(true);
  });
});
