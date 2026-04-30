const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
require('dotenv').config();

const shouldRun = process.env.RUN_DB_INTEGRATION_TESTS === 'true';
const missingEnv = ['DATABASE_URL', 'TEST_LOGIN_EMAIL', 'TEST_LOGIN_PASSWORD'].filter(
  (key) => !process.env[key]
);

if (!shouldRun) {
  test(
    'Teacher admission integration tests are skipped unless RUN_DB_INTEGRATION_TESTS=true',
    { skip: true },
    () => {}
  );
} else if (missingEnv.length > 0) {
  test(
    `Teacher admission integration tests are skipped due to missing env vars: ${missingEnv.join(', ')}`,
    { skip: true },
    () => {}
  );
} else {
  const app = require('../../src/app');
  const prisma = require('../../src/config/prisma');

  let server;
  let baseUrl = '';
  let accessToken = '';
  let teacherUserId = null;
  let teacherFlowReady = false;

  const createdJoinRequestIds = new Set();
  const createdNotificationIds = new Set();
  const createdStatusIds = new Set();

  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };

    if (accessToken && !headers.Authorization) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers,
    });

    return response;
  }

  async function findAvailableTeacherSession(userId) {
    const rows = await prisma.$queryRaw`
      SELECT TOP (1)
        cs.SessionID AS sessionId,
        cs.MaxParticipants AS maxParticipants,
        COUNT(DISTINCT sstd.StudentAccountID) AS enrolledCount
      FROM [SessionTeacher] AS st
      INNER JOIN [CoachingSession] AS cs ON cs.SessionID = st.SessionID
      LEFT JOIN [SessionStudent] AS sstd ON sstd.SessionID = cs.SessionID
      WHERE st.TeacherID = ${userId}
      GROUP BY cs.SessionID, cs.MaxParticipants
      HAVING cs.MaxParticipants IS NULL OR COUNT(DISTINCT sstd.StudentAccountID) < cs.MaxParticipants
      ORDER BY cs.SessionID ASC
    `;

    return rows[0]
      ? {
          sessionId: Number(rows[0].sessionId),
          maxParticipants: rows[0].maxParticipants == null ? null : Number(rows[0].maxParticipants),
          enrolledCount: Number(rows[0].enrolledCount),
        }
      : null;
  }

  async function getNotificationIds(userId, sessionId) {
    const notifications = await prisma.notification.findMany({
      where: {
        UserID: userId,
        SessionID: sessionId,
      },
      select: {
        NotificationID: true,
      },
      orderBy: {
        NotificationID: 'asc',
      },
    });

    return new Set(notifications.map((notification) => notification.NotificationID));
  }

  async function createAdmissionFixture() {
    if (!teacherFlowReady || !teacherUserId) {
      return null;
    }

    const session = await findAvailableTeacherSession(teacherUserId);
    if (!session) {
      return null;
    }

    const studentAccount = await prisma.studentAccount.findFirst({
      where: {
        User: {
          IsActive: true,
        },
      },
      orderBy: {
        StudentAccountID: 'asc',
      },
    });

    if (!studentAccount) {
      return null;
    }

    const pendingStatus = await prisma.coachingJoinRequestStatus.create({
      data: {
        StatusName: `Pending Admission Integration ${crypto.randomUUID()}`,
      },
    });

    createdStatusIds.add(pendingStatus.StatusID);

    const joinRequest = await prisma.coachingJoinRequest.create({
      data: {
        SessionID: session.sessionId,
        StudentAccountID: studentAccount.StudentAccountID,
        RequestedAt: new Date(),
        StatusID: pendingStatus.StatusID,
      },
    });

    createdJoinRequestIds.add(joinRequest.JoinRequestID);

    return {
      joinRequestId: joinRequest.JoinRequestID,
      sessionId: session.sessionId,
      studentAccountId: studentAccount.StudentAccountID,
      studentUserId: studentAccount.UserID,
    };
  }

  async function cleanupCreatedStatuses() {
    for (const statusId of createdStatusIds) {
      const remaining = await prisma.coachingJoinRequest.count({
        where: {
          StatusID: statusId,
        },
      });

      if (remaining === 0) {
        await prisma.coachingJoinRequestStatus.deleteMany({
          where: {
            StatusID: statusId,
          },
        });
      }
    }
  }

  test.before(async () => {
    server = app.listen(0);

    await new Promise((resolve) => {
      server.once('listening', resolve);
    });

    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;

    const loginResponse = await request('/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: process.env.TEST_LOGIN_EMAIL,
        password: process.env.TEST_LOGIN_PASSWORD,
      }),
    });

    assert.equal(loginResponse.status, 200, 'Falha no login de teste para admissions');
    const loginBody = await loginResponse.json();
    accessToken = loginBody?.accessToken || '';
    assert.ok(accessToken, 'Falha ao obter access token para admissions');

    const meResponse = await request('/auth/me');
    assert.equal(meResponse.status, 200, 'Falha ao obter contexto autenticado para admissions');

    const meBody = await meResponse.json();
    teacherUserId = meBody?.user?.userId ?? null;
    teacherFlowReady = String(meBody?.user?.role || '').trim().toLowerCase() === 'teacher' && Boolean(teacherUserId);

    if (!teacherFlowReady) {
      return;
    }

    const notificationType = await prisma.notificationType.findUnique({
      where: {
        TypeID: 1,
      },
    });

    teacherFlowReady = Boolean(notificationType);
  });

  test.after(async () => {
    if (createdNotificationIds.size > 0) {
      await prisma.notification.deleteMany({
        where: {
          NotificationID: {
            in: [...createdNotificationIds],
          },
        },
      });
    }

    if (createdJoinRequestIds.size > 0) {
      await prisma.coachingJoinRequest.deleteMany({
        where: {
          JoinRequestID: {
            in: [...createdJoinRequestIds],
          },
        },
      });
    }

    await cleanupCreatedStatuses();

    await prisma.$disconnect();

    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  });

  test('GET /teacher/admission-requests returns the pending request created by the teacher', async (t) => {
    if (!teacherFlowReady) {
      t.skip('Teacher integration prerequisites are not available');
      return;
    }

    const fixture = await createAdmissionFixture();
    if (!fixture) {
      t.skip('No available teacher session or student account was found for admissions testing');
      return;
    }

    const response = await request('/teacher/admission-requests');

    assert.equal(response.status, 200, 'GET /teacher/admission-requests should succeed');

    const body = await response.json();
    assert.ok(body?.summary, 'Response should include summary');
    assert.ok(Array.isArray(body.requests), 'Response should include requests array');
    assert.ok(body.summary.pendingRequests >= 1, 'Summary should count at least the fixture request');

    const requestRow = body.requests.find((item) => item.joinRequestId === fixture.joinRequestId);
    assert.ok(requestRow, 'Created join request should appear in the teacher queue');
    assert.equal(requestRow.studentUserId, fixture.studentUserId);
    assert.ok(String(requestRow.statusName || '').toLowerCase().includes('pend'));
  });

  test('PATCH /teacher/admission-requests/:joinRequestId/review approves a request and creates a notification', async (t) => {
    if (!teacherFlowReady) {
      t.skip('Teacher integration prerequisites are not available');
      return;
    }

    const fixture = await createAdmissionFixture();
    if (!fixture) {
      t.skip('No available teacher session or student account was found for admissions testing');
      return;
    }

    const targetStatusName = 'Awaiting Management Review';
    const targetStatusBefore = await prisma.coachingJoinRequestStatus.findFirst({
      where: {
        StatusName: targetStatusName,
      },
    });

    const beforeNotificationIds = await getNotificationIds(fixture.studentUserId, fixture.sessionId);

    const response = await request(`/teacher/admission-requests/${fixture.joinRequestId}/review`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        decision: 'approve',
      }),
    });

    assert.equal(response.status, 200, 'PATCH approve should succeed');

    const body = await response.json();
    assert.equal(body.request.joinRequestId, fixture.joinRequestId);
    assert.equal(body.request.statusName, targetStatusName);
    assert.equal(body.request.reviewedByUserId, teacherUserId);
    assert.ok(body.request.reviewedAt, 'Review timestamp should be returned');

    const dbRow = await prisma.coachingJoinRequest.findUnique({
      where: {
        JoinRequestID: fixture.joinRequestId,
      },
    });

    assert.ok(dbRow, 'Join request should still exist after review');
    assert.equal(dbRow.ReviewedByUserID, teacherUserId);
    assert.ok(dbRow.ReviewedAt, 'ReviewedAt should be stored in the database');

    const afterNotificationIds = await getNotificationIds(fixture.studentUserId, fixture.sessionId);
    const newNotificationIds = [...afterNotificationIds].filter((notificationId) => !beforeNotificationIds.has(notificationId));

    assert.equal(newNotificationIds.length, 1, 'Approval should create exactly one new notification');
    createdNotificationIds.add(newNotificationIds[0]);

    if (!targetStatusBefore) {
      const targetStatusAfter = await prisma.coachingJoinRequestStatus.findFirst({
        where: {
          StatusName: targetStatusName,
        },
      });

      if (targetStatusAfter) {
        createdStatusIds.add(targetStatusAfter.StatusID);
      }
    }
  });

  test('PATCH /teacher/admission-requests/:joinRequestId/review rejects a request and stores the teacher note', async (t) => {
    if (!teacherFlowReady) {
      t.skip('Teacher integration prerequisites are not available');
      return;
    }

    const fixture = await createAdmissionFixture();
    if (!fixture) {
      t.skip('No available teacher session or student account was found for admissions testing');
      return;
    }

    const targetStatusName = 'Teacher Rejected';
    const targetStatusBefore = await prisma.coachingJoinRequestStatus.findFirst({
      where: {
        StatusName: targetStatusName,
      },
    });

    const beforeNotificationIds = await getNotificationIds(fixture.studentUserId, fixture.sessionId);
    const reviewNotes = `Integration test rejection ${crypto.randomUUID()}`;

    const response = await request(`/teacher/admission-requests/${fixture.joinRequestId}/review`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        decision: 'reject',
        observations: reviewNotes,
      }),
    });

    assert.equal(response.status, 200, 'PATCH reject should succeed');

    const body = await response.json();
    assert.equal(body.request.joinRequestId, fixture.joinRequestId);
    assert.equal(body.request.statusName, targetStatusName);
    assert.equal(body.request.reviewedByUserId, teacherUserId);

    const dbRow = await prisma.coachingJoinRequest.findUnique({
      where: {
        JoinRequestID: fixture.joinRequestId,
      },
    });

    assert.ok(dbRow, 'Join request should still exist after rejection');
    assert.equal(dbRow.ReviewedByUserID, teacherUserId);
    assert.ok(dbRow.ReviewedAt, 'ReviewedAt should be stored in the database');

    const afterNotificationIds = await getNotificationIds(fixture.studentUserId, fixture.sessionId);
    const newNotificationIds = [...afterNotificationIds].filter((notificationId) => !beforeNotificationIds.has(notificationId));

    assert.equal(newNotificationIds.length, 1, 'Rejection should create exactly one new notification');
    createdNotificationIds.add(newNotificationIds[0]);

    if (!targetStatusBefore) {
      const targetStatusAfter = await prisma.coachingJoinRequestStatus.findFirst({
        where: {
          StatusName: targetStatusName,
        },
      });

      if (targetStatusAfter) {
        createdStatusIds.add(targetStatusAfter.StatusID);
      }
    }
  });
}
