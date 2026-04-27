const request = require('supertest');

const { createTestApp } = require('./helpers/createTestApp');
const {
  AUTH_PASSWORD,
  HASHED_PASSWORD,
  buildLoginPayload,
  buildUser,
} = require('./fixtures/auth.fixtures');

function createAuthContext() {
  const studentUser = buildUser({
    userId: 101,
    email: 'student@example.com',
    role: 'student',
  });

  const usersByEmail = new Map([[studentUser.Email, studentUser]]);
  const usersById = new Map([[studentUser.UserID, studentUser]]);

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
    compare: jest.fn(async (rawPassword, hash) => {
      return rawPassword === AUTH_PASSWORD && hash === HASHED_PASSWORD;
    }),
  };

  const { app } = createTestApp({ prismaMock, bcryptMock });

  return {
    app,
    prismaMock,
    bcryptMock,
    studentUser,
  };
}

describe('Auth API (Jest + SuperTest)', () => {
  test('POST /auth/login authenticates a valid user and persists session for /auth/me', async () => {
    const { app, studentUser, bcryptMock } = createAuthContext();
    const agent = request.agent(app);

    const loginResponse = await agent
      .post('/auth/login')
      .send(buildLoginPayload(studentUser.Email));

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body).toMatchObject({
      role: 'student',
      user: {
        userId: studentUser.UserID,
        email: studentUser.Email,
        role: 'student',
      },
    });
    expect(loginResponse.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('connect.sid=')]),
    );
    expect(bcryptMock.compare).toHaveBeenCalledWith(AUTH_PASSWORD, HASHED_PASSWORD);

    const meResponse = await agent.get('/auth/me');

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.user.userId).toBe(studentUser.UserID);
    expect(meResponse.body.role).toBe('student');
  });

  test('POST /auth/login rejects invalid credentials', async () => {
    const { app, bcryptMock } = createAuthContext();
    bcryptMock.compare.mockResolvedValueOnce(false);

    const response = await request(app)
      .post('/auth/login')
      .send(buildLoginPayload('student@example.com'));

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid credentials' });
  });

  test('GET /auth/me requires an authenticated session', async () => {
    const { app } = createAuthContext();

    const response = await request(app).get('/auth/me');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Not authenticated' });
  });

  test('POST /auth/logout invalidates the current session', async () => {
    const { app, studentUser } = createAuthContext();
    const agent = request.agent(app);

    const loginResponse = await agent
      .post('/auth/login')
      .send(buildLoginPayload(studentUser.Email));

    expect(loginResponse.status).toBe(200);

    const logoutResponse = await agent.post('/auth/logout');

    expect(logoutResponse.status).toBe(204);

    const meResponse = await agent.get('/auth/me');

    expect(meResponse.status).toBe(401);
    expect(meResponse.body).toEqual({ error: 'Not authenticated' });
  });
});
