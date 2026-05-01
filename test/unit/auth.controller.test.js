/**
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

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
    cookies: [],
    status(code) { this.statusCode = code; return this; },
    json(body) { this.payload = body; return this; },
    send() { return this; },
    cookie(name, value, options) {
      this.cookies.push({ name, value, options });
      return this;
    },
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

function buildApp(overrides = {}) {
  const store = new Map();
  store.set('refreshCookieName', 'gestartes.refresh_token');
  store.set('refreshCookieOptions', { httpOnly: true, sameSite: 'strict', path: '/' });
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

  const req = {
    body: { email: 'ana@test.com', password: 'correct' },
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
  assert.equal(typeof res.payload.accessToken, 'string');
  assert.equal(res.payload.tokenType, 'Bearer');
  assert.equal(res.cookies.length, 1);
  assert.equal(res.cookies[0].name, 'gestartes.refresh_token');
});

test('login: logs a security success entry on success', async () => {
  resetState();
  mockState.userByEmail = buildUser();
  mockState.bcryptResult = true;

  const req = {
    body: { email: 'ana@test.com', password: 'correct' },
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

test('me: returns 401 when request has no authenticated user', async () => {
  resetState();

  const req = {};
  const res = createResponse();
  await authController.me(req, res, (err) => { assert.fail(`unexpected next: ${err}`); });

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.payload, { error: 'Not authenticated' });
});

test('me: returns 401 when authenticated user no longer exists in DB', async () => {
  resetState();
  mockState.userById = null;

  const req = {
    auth: {
      userId: 99,
      role: 'student',
    },
  };
  const res = createResponse();
  await authController.me(req, res, () => {});

  assert.equal(res.statusCode, 401);
});

test('me: returns 401 when authenticated user is inactive', async () => {
  resetState();
  mockState.userById = buildUser({ IsActive: false });

  const req = {
    auth: {
      userId: 1,
      role: 'student',
    },
  };
  const res = createResponse();
  await authController.me(req, res, () => {});

  assert.equal(res.statusCode, 401);
});

test('me: returns serialized user when auth context is valid', async () => {
  resetState();
  const user = buildUser();
  mockState.userById = user;

  const req = {
    auth: {
      userId: 1,
      role: 'student',
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

test('logout: returns 204 without session dependency', () => {
  const req = {};
  const res = createResponse();
  authController.logout(req, res, (err) => { assert.fail(`unexpected next: ${err}`); });

  assert.equal(res.statusCode, 204);
});

test('logout: returns 204 with request metadata present', () => {
  const req = {
    auth: {
      userId: 1,
      role: 'student',
    },
    app: buildApp(),
    ip: '127.0.0.1',
    headers: {},
    get: () => 'ua',
  };
  const res = createResponse();

  authController.logout(req, res, (err) => { assert.fail(`unexpected next: ${err}`); });

  assert.equal(res.statusCode, 204);
});
