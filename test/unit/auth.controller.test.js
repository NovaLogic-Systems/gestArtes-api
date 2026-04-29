const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

// ---------------------------------------------------------------------------
// Estado falso partilhado
// ---------------------------------------------------------------------------

const mockState = {
  userByEmail: null,
  userById: null,
  bcryptResult: true,
  sessionSaveError: null,
  sessionRegenerateError: null,
  sessionDestroyError: null,
  loggedMessages: [],
};

// ---------------------------------------------------------------------------
// Dependências falsas
// ---------------------------------------------------------------------------

const fakePrisma = {
  user: {
    findUnique: async ({ where }) => {
      if (where?.Email !== undefined) return mockState.userByEmail;
      if (where?.UserID !== undefined) return mockState.userById;
      return null;
    },
  },
};

const fakeBcrypt = {
  compare: async () => mockState.bcryptResult,
};

const fakeLogger = {
  log: (entry) => mockState.loggedMessages.push(entry),
  info: (msg, meta) => mockState.loggedMessages.push({ msg, ...meta }),
};

// ---------------------------------------------------------------------------
// Substituição de módulos
// ---------------------------------------------------------------------------

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '../config/prisma') return fakePrisma;
  if (request === 'bcrypt') return fakeBcrypt;
  if (request === '../utils/logger') return fakeLogger;
  return originalLoad.call(this, request, parent, isMain);
};

let authController;
try {
  authController = require('../../src/controllers/auth.controller');
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
    send() { return this; },
    clearCookie() { return this; },
  };
}

function buildUser(overrides = {}) {
  return {
    UserID: 1,
    AuthUID: 'ST-0001',
    FirstName: 'Ana',
    LastName: 'Silva',
    Email: 'ana@test.com',
    PasswordHash: 'hashed',
    IsActive: true,
    DeletedAt: null,
    UserRole: [
      { Role: { RoleName: 'student' } },
    ],
    ...overrides,
  };
}

function buildSession(overrides = {}) {
  let saveError = null;
  let regenerateError = null;
  let destroyError = null;

  const session = {
    userId: null,
    role: null,
    user: null,
    cookie: { maxAge: 3600000 },
    save(cb) { cb(saveError); },
    regenerate(cb) { cb(regenerateError); },
    destroy(cb) { cb(destroyError); },
    _setSaveError(e) { saveError = e; },
    _setRegenerateError(e) { regenerateError = e; },
    _setDestroyError(e) { destroyError = e; },
    ...overrides,
  };

  return session;
}

function buildApp(overrides = {}) {
  const store = new Map();
  store.set('sessionCookieName', 'connect.sid');
  store.set('sessionCookieOptions', { httpOnly: true, sameSite: 'strict' });
  Object.entries(overrides).forEach(([k, v]) => store.set(k, v));
  return { get: (key) => store.get(key) };
}

function resetState() {
  mockState.userByEmail = null;
  mockState.userById = null;
  mockState.bcryptResult = true;
  mockState.loggedMessages = [];
}

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------

test('login: returns 401 when user does not exist', async () => {
  resetState();
  mockState.userByEmail = null;

  const req = {
    body: { email: 'nope@test.com', password: 'secret' },
    session: buildSession(),
    app: buildApp(),
    ip: '127.0.0.1',
    headers: {},
    get: () => 'test-agent',
  };
  const res = createResponse();
  let nextError = null;
  await authController.login(req, res, (err) => { nextError = err; });

  assert.equal(nextError, null);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.payload, { error: 'Invalid credentials' });
});

test('login: returns 401 when user is inactive', async () => {
  resetState();
  mockState.userByEmail = buildUser({ IsActive: false });

  const req = {
    body: { email: 'ana@test.com', password: 'secret' },
    session: buildSession(),
    app: buildApp(),
    ip: '127.0.0.1',
    headers: {},
    get: () => 'test-agent',
  };
  const res = createResponse();
  let nextError = null;
  await authController.login(req, res, (err) => { nextError = err; });

  assert.equal(nextError, null);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.payload, { error: 'Invalid credentials' });
});

test('login: returns 401 when password is wrong', async () => {
  resetState();
  mockState.userByEmail = buildUser();
  mockState.bcryptResult = false;

  const req = {
    body: { email: 'ana@test.com', password: 'wrong' },
    session: buildSession(),
    app: buildApp(),
    ip: '127.0.0.1',
    headers: {},
    get: () => 'test-agent',
  };
  const res = createResponse();
  let nextError = null;
  await authController.login(req, res, (err) => { nextError = err; });

  assert.equal(nextError, null);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.payload, { error: 'Invalid credentials' });
});

test('login: succeeds and returns user + role', async () => {
  resetState();
  const user = buildUser();
  mockState.userByEmail = user;
  mockState.bcryptResult = true;

  const session = buildSession();
  const req = {
    body: { email: 'ana@test.com', password: 'correct' },
    session,
    app: buildApp(),
    ip: '127.0.0.1',
    headers: {},
    get: () => 'test-agent',
  };
  const res = createResponse();
  let nextError = null;
  await authController.login(req, res, (err) => { nextError = err; });

  assert.equal(nextError, null);
  assert.equal(res.statusCode, null, 'should not call res.status()');
  assert.ok(res.payload?.user, 'should return user object');
  assert.equal(res.payload.user.userId, 1);
  assert.equal(res.payload.user.email, 'ana@test.com');
  assert.ok(['student', 'teacher', 'admin'].includes(res.payload.role));
  assert.equal(session.userId, 1);
});

test('login: logs a security success entry on success', async () => {
  resetState();
  mockState.userByEmail = buildUser();
  mockState.bcryptResult = true;

  const req = {
    body: { email: 'ana@test.com', password: 'correct' },
    session: buildSession(),
    app: buildApp(),
    ip: '10.0.0.1',
    headers: {},
    get: () => 'ua',
  };
  await authController.login(req, createResponse(), () => {});

  const successLog = mockState.loggedMessages.find((m) => m.success === true);
  assert.ok(successLog, 'expected a success audit log entry');
});

test('login: logs a security failure entry on bad password', async () => {
  resetState();
  mockState.userByEmail = buildUser();
  mockState.bcryptResult = false;

  const req = {
    body: { email: 'ana@test.com', password: 'bad' },
    session: buildSession(),
    app: buildApp(),
    ip: '10.0.0.1',
    headers: {},
    get: () => 'ua',
  };
  await authController.login(req, createResponse(), () => {});

  const failLog = mockState.loggedMessages.find((m) => m.success === false);
  assert.ok(failLog, 'expected a failure audit log entry');
});

// ---------------------------------------------------------------------------
// me
// ---------------------------------------------------------------------------

test('me: returns 401 when session has no userId', async () => {
  resetState();

  const req = {
    session: { userId: null },
  };
  const res = createResponse();
  await authController.me(req, res, (err) => { assert.fail(`unexpected next: ${err}`); });

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.payload, { error: 'Not authenticated' });
});

test('me: returns 401 and destroys session when user no longer exists in DB', async () => {
  resetState();
  mockState.userById = null;

  let sessionDestroyed = false;
  const req = {
    session: {
      userId: 99,
      destroy(cb) { sessionDestroyed = true; if (cb) cb(); },
    },
  };
  const res = createResponse();
  await authController.me(req, res, () => {});

  assert.ok(sessionDestroyed);
  assert.equal(res.statusCode, 401);
});

test('me: returns 401 and destroys session when user is inactive', async () => {
  resetState();
  mockState.userById = buildUser({ IsActive: false });

  let sessionDestroyed = false;
  const req = {
    session: {
      userId: 1,
      destroy(cb) { sessionDestroyed = true; if (cb) cb(); },
    },
  };
  const res = createResponse();
  await authController.me(req, res, () => {});

  assert.ok(sessionDestroyed);
  assert.equal(res.statusCode, 401);
});

test('me: returns serialized user when session is valid', async () => {
  resetState();
  const user = buildUser();
  mockState.userById = user;

  const req = {
    session: {
      userId: 1,
      role: 'student',
      user: null,
    },
  };
  const res = createResponse();
  await authController.me(req, res, (err) => { assert.fail(`unexpected next: ${err}`); });

  assert.equal(res.statusCode, null);
  assert.ok(res.payload?.user);
  assert.equal(res.payload.user.userId, 1);
  assert.equal(res.payload.user.email, 'ana@test.com');
});

// ---------------------------------------------------------------------------
// logout
// ---------------------------------------------------------------------------

test('logout: returns 204 immediately when session is null', () => {
  const req = { session: null };
  const res = createResponse();
  authController.logout(req, res, (err) => { assert.fail(`unexpected next: ${err}`); });

  assert.equal(res.statusCode, 204);
});

test('logout: destroys session and returns 204', (t, done) => {
  resetState();
  let destroyed = false;

  const req = {
    session: {
      userId: 1,
      destroy(cb) { destroyed = true; cb(null); },
    },
    app: buildApp(),
    ip: '127.0.0.1',
    headers: {},
    get: () => 'ua',
  };
  const res = {
    statusCode: null,
    status(code) { this.statusCode = code; return this; },
    send() {
      assert.ok(destroyed);
      assert.equal(this.statusCode, 204);
      done();
      return this;
    },
    clearCookie() { return this; },
  };

  authController.logout(req, res, (err) => { assert.fail(`unexpected next: ${err}`); });
});

test('logout: calls next with error when session.destroy fails', (t, done) => {
  const destroyError = new Error('destroy failed');
  const req = {
    session: {
      userId: 1,
      destroy(cb) { cb(destroyError); },
    },
    app: buildApp(),
    ip: '127.0.0.1',
    headers: {},
    get: () => 'ua',
  };
  const res = createResponse();

  authController.logout(req, res, (err) => {
    assert.equal(err, destroyError);
    done();
  });
});
