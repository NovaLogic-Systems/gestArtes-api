const request = require('supertest');

const { createTestApp } = require('./helpers/createTestApp');
const { buildUser, buildLoginPayload } = require('./fixtures/auth.fixtures');
const { buildJoinRequest } = require('./fixtures/coaching.fixtures');

function createCoachingContext() {
  const studentUser = buildUser({
    userId: 201,
    email: 'student@example.com',
    role: 'student',
  });
  const teacherUser = buildUser({
    userId: 202,
    email: 'teacher@example.com',
    role: 'teacher',
  });
  const adminUser = buildUser({
    userId: 203,
    email: 'admin@example.com',
    role: 'admin',
  });

  const users = [studentUser, teacherUser, adminUser];
  const usersByEmail = new Map(users.map((user) => [user.Email, user]));
  const usersById = new Map(users.map((user) => [user.UserID, user]));

  const prismaMock = {
    user: {
      findUnique: jest.fn(async ({ where }) => {
        if (where?.Email) {
          return usersByEmail.get(String(where.Email).toLowerCase()) || null;
        }

        if (where?.UserID) {
          return usersById.get(Number(where.UserID)) || null;
        }

        return null;
      }),
    },
  };

  const bcryptMock = {
    compare: jest.fn(async () => true),
  };

  const joinRequestServiceMock = {
    createJoinRequest: jest.fn(async () => ({
      joinRequest: buildJoinRequest({ status: 'PendingTeacher' }),
      teacherUserIds: [teacherUser.UserID],
    })),
      listJoinRequestsBySession: jest.fn(async () => [buildJoinRequest()]),
      listTeacherPendingRequests: jest.fn(async () => [buildJoinRequest()]),

    teacherApprove: jest.fn(async () => ({
      joinRequest: buildJoinRequest({ status: 'PendingAdmin', reviewedByUserId: teacherUser.UserID }),
      adminUserIds: [adminUser.UserID],
    })),
    teacherReject: jest.fn(async () => ({
      joinRequest: buildJoinRequest({ status: 'Rejected', reviewedByUserId: teacherUser.UserID }),
      studentUserId: studentUser.UserID,
    })),
    listAdminPendingRequests: jest.fn(async () => [buildJoinRequest({ status: 'PendingAdmin' })]),
    adminApprove: jest.fn(async () => ({
      joinRequest: buildJoinRequest({ status: 'Approved', reviewedByUserId: adminUser.UserID }),
      studentUserId: studentUser.UserID,
    })),
    adminReject: jest.fn(async () => ({
      joinRequest: buildJoinRequest({ status: 'Rejected', reviewedByUserId: adminUser.UserID }),
      studentUserId: studentUser.UserID,
    })),
    listStudentRequests: jest.fn(async () => [buildJoinRequest()]),
  };

  const coachingServiceMock = {
    getAvailableSlots: jest.fn(async () => ({ weeks: [] })),
    getCompatibleStudios: jest.fn(async () => []),
    createBooking: jest.fn(async () => ({ SessionID: 999 })),
    cancelBooking: jest.fn(async () => ({ cancelledSessionCount: 1 })),
    confirmCompletion: jest.fn(async () => ({ success: true })),
    getSessionHistory: jest.fn(async () => []),
  };

  const noopHandler = (_req, res) => res.status(501).json({ error: 'Not used in coaching tests' });

  const notificationControllerMock = {
    getAll: jest.fn(noopHandler),
    getById: jest.fn(noopHandler),
    markAsRead: jest.fn(noopHandler),
    remove: jest.fn(noopHandler),
    create: jest.fn(noopHandler),
    broadcastNotification: jest.fn(noopHandler),
    sendNotification: jest.fn(async () => ({ notificationId: 1 })),
  };

  const { app } = createTestApp({
    prismaMock,
    bcryptMock,
    joinRequestServiceMock,
    coachingServiceMock,
    notificationControllerMock,
  });

  return {
    app,
    studentUser,
    teacherUser,
    adminUser,
    joinRequestServiceMock,
    coachingServiceMock,
    notificationControllerMock,
  };
}

async function loginAs(agent, user) {
  const response = await agent.post('/auth/login').send(buildLoginPayload(user.Email));
  expect(response.status).toBe(200);
}

describe('Coaching API (Jest + SuperTest)', () => {
  test('POST /coaching/sessions/:id/join-requests requires authentication', async () => {
    const { app, joinRequestServiceMock } = createCoachingContext();

    const response = await request(app).post('/coaching/sessions/42/join-requests');

    expect(response.status).toBe(401);
    expect(joinRequestServiceMock.createJoinRequest).not.toHaveBeenCalled();
  });

  test('POST /coaching/bookings rejects invalid booking payload', async () => {
    const { app, studentUser, coachingServiceMock } = createCoachingContext();
    const agent = request.agent(app);

    await loginAs(agent, studentUser);

    const response = await agent.post('/coaching/bookings').send({
      teacherId: 10,
      studioId: 20,
      modalityId: 30,
      startTime: '2026-04-27T10:00:00.000Z',
      endTime: '2026-04-27T09:30:00.000Z',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
    expect(response.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: expect.arrayContaining(['endTime']),
        }),
      ]),
    );
    expect(coachingServiceMock.createBooking).not.toHaveBeenCalled();
  });

  test('POST /coaching/sessions/:id/join-requests creates a booking request for students', async () => {
    const {
      app,
      studentUser,
      teacherUser,
      joinRequestServiceMock,
      notificationControllerMock,
    } = createCoachingContext();

    const agent = request.agent(app);
    await loginAs(agent, studentUser);

    const response = await agent.post('/coaching/sessions/42/join-requests');

    expect(response.status).toBe(201);
    expect(joinRequestServiceMock.createJoinRequest).toHaveBeenCalledWith({
      sessionId: 42,
      requesterUserId: studentUser.UserID,
    });
    expect(notificationControllerMock.sendNotification).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        userId: teacherUser.UserID,
        type: 'join_request',
      }),
    );
  });

  test('GET /coaching/sessions/:id/join-requests returns requests for teachers', async () => {
    const { app, teacherUser, joinRequestServiceMock } = createCoachingContext();
    const agent = request.agent(app);

    await loginAs(agent, teacherUser);

    const response = await agent.get('/coaching/sessions/42/join-requests');

    expect(response.status).toBe(200);
    expect(response.body.requests).toHaveLength(1);
    expect(joinRequestServiceMock.listJoinRequestsBySession).toHaveBeenCalledWith({
      sessionId: 42,
      requesterUserId: teacherUser.UserID,
      requesterRole: 'teacher',
    });
  });

  test('GET /coaching/join-requests/teacher-pending returns pending requests', async () => {
    const { app, teacherUser, joinRequestServiceMock } = createCoachingContext();
    const agent = request.agent(app);

    await loginAs(agent, teacherUser);

    const response = await agent.get('/coaching/join-requests/teacher-pending');

    expect(response.status).toBe(200);
    expect(joinRequestServiceMock.listTeacherPendingRequests).toHaveBeenCalledWith({
      teacherUserId: teacherUser.UserID,
    });
  });

  test('PATCH /coaching/join-requests/:id/teacher-approve moves booking to management queue', async () => {
    const {
      app,
      teacherUser,
      adminUser,
      joinRequestServiceMock,
      notificationControllerMock,
    } = createCoachingContext();
    const agent = request.agent(app);

    await loginAs(agent, teacherUser);

    const response = await agent.patch('/coaching/join-requests/500/teacher-approve');

    expect(response.status).toBe(200);
    expect(joinRequestServiceMock.teacherApprove).toHaveBeenCalledWith({
      joinRequestId: 500,
      teacherUserId: teacherUser.UserID,
    });
    expect(notificationControllerMock.sendNotification).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        userId: adminUser.UserID,
        type: 'join_request',
      }),
    );
  });

  test('PATCH /coaching/join-requests/:id/teacher-reject cancels booking and notifies student', async () => {
    const {
      app,
      teacherUser,
      studentUser,
      joinRequestServiceMock,
      notificationControllerMock,
    } = createCoachingContext();
    const agent = request.agent(app);

    await loginAs(agent, teacherUser);

    const response = await agent.patch('/coaching/join-requests/500/teacher-reject');

    expect(response.status).toBe(200);
    expect(joinRequestServiceMock.teacherReject).toHaveBeenCalledWith({
      joinRequestId: 500,
      teacherUserId: teacherUser.UserID,
    });
    expect(notificationControllerMock.sendNotification).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        userId: studentUser.UserID,
        type: 'join_request',
      }),
    );
  });

  test('GET /admin/coaching/join-requests/pending returns admin validation queue', async () => {
    const { app, adminUser, joinRequestServiceMock } = createCoachingContext();
    const agent = request.agent(app);

    await loginAs(agent, adminUser);

    const response = await agent.get('/admin/coaching/join-requests/pending');

    expect(response.status).toBe(200);
    expect(joinRequestServiceMock.listAdminPendingRequests).toHaveBeenCalledTimes(1);
  });

  test('PATCH /admin/coaching/join-requests/:id/approve confirms booking', async () => {
    const {
      app,
      adminUser,
      studentUser,
      joinRequestServiceMock,
      notificationControllerMock,
    } = createCoachingContext();
    const agent = request.agent(app);

    await loginAs(agent, adminUser);

    const response = await agent.patch('/admin/coaching/join-requests/500/approve');

    expect(response.status).toBe(200);
    expect(joinRequestServiceMock.adminApprove).toHaveBeenCalledWith({
      joinRequestId: 500,
      adminUserId: adminUser.UserID,
    });
    expect(notificationControllerMock.sendNotification).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        userId: studentUser.UserID,
        type: 'join_request',
      }),
    );
  });

  test('PATCH /admin/coaching/join-requests/:id/reject cancels booking at management step', async () => {
    const {
      app,
      adminUser,
      studentUser,
      joinRequestServiceMock,
      notificationControllerMock,
    } = createCoachingContext();
    const agent = request.agent(app);

    await loginAs(agent, adminUser);

    const response = await agent.patch('/admin/coaching/join-requests/500/reject');

    expect(response.status).toBe(200);
    expect(joinRequestServiceMock.adminReject).toHaveBeenCalledWith({
      joinRequestId: 500,
      adminUserId: adminUser.UserID,
    });
    expect(notificationControllerMock.sendNotification).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        userId: studentUser.UserID,
        type: 'join_request',
      }),
    );
  });

  test('GET /coaching/join-requests/my returns the authenticated student bookings', async () => {
    const { app, studentUser, joinRequestServiceMock } = createCoachingContext();
    const agent = request.agent(app);

    await loginAs(agent, studentUser);

    const response = await agent.get('/coaching/join-requests/my');

    expect(response.status).toBe(200);
    expect(joinRequestServiceMock.listStudentRequests).toHaveBeenCalledWith({
      studentUserId: studentUser.UserID,
    });
  });

  test('PATCH /coaching/join-requests/:id/teacher-reject validates join request id', async () => {
    const { app, teacherUser, joinRequestServiceMock } = createCoachingContext();
    const agent = request.agent(app);

    await loginAs(agent, teacherUser);

    const response = await agent.patch('/coaching/join-requests/invalid-id/teacher-reject');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'ID de pedido de adesão inválido' });
    expect(joinRequestServiceMock.teacherReject).not.toHaveBeenCalled();
  });
});
