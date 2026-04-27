function createIoMock() {
  const io = {
    emit: jest.fn(),
    on: jest.fn(),
    sockets: {
      adapter: {
        rooms: new Map(),
      },
    },
    to: jest.fn(() => io),
  };

  return io;
}

function createTestApp({
  prismaMock,
  bcryptMock,
  joinRequestServiceMock,
  coachingServiceMock,
  notificationControllerMock,
  pricingServiceMock,
  useRealAuthMiddleware = false,
  useRealValidationMiddleware = false,
} = {}) {
  jest.resetModules();

  process.env.CSRF_ALLOW_NO_ORIGIN = 'true';

  jest.doMock('dotenv', () => ({
    config: jest.fn(() => ({})),
  }));

  jest.doMock('morgan', () => () => (_req, _res, next) => next());

  jest.doMock('connect-mssql-v2', () => {
    const { InMemorySessionStore } = require('./inMemorySessionStore');
    return InMemorySessionStore;
  });

  jest.doMock('../../../src/middlewares/csrf.middleware', () => ({
    createCsrfProtection: jest.fn(() => (_req, _res, next) => next()),
  }));

  if (!useRealValidationMiddleware) {
    jest.doMock('../../../src/middlewares/validate.middleware', () => {
      const validateRequest = (_req, _res, next) => next();
      return Object.assign(validateRequest, { validateRequest });
    });
  }

  if (!useRealAuthMiddleware) {
    jest.doMock('../../../src/middlewares/auth.middleware', () => ({
      APP_ROLES: {
        ADMIN: 'ADMIN',
        STUDENT: 'STUDENT',
        TEACHER: 'TEACHER',
      },
      APP_PERMISSIONS: {
        SESSION_ACCESS: 'SESSION_ACCESS',
        ADMIN_PORTAL_ACCESS: 'ADMIN_PORTAL_ACCESS',
      },
      requireAuth: (_req, _res, next) => next(),
      requireSessionAuth: (_req, _res, next) => next(),
      requireRole: () => (_req, _res, next) => next(),
      requireRoles: () => (_req, _res, next) => next(),
      requirePermission: () => (_req, _res, next) => next(),
      requirePermissions: () => (_req, _res, next) => next(),
      requireAllPermissions: () => (_req, _res, next) => next(),
      requireAdminRole: (_req, _res, next) => next(),
      requireInternalToken: (_req, _res, next) => next(),
    }));
  }

  const io = createIoMock();

  jest.doMock('../../../src/socket', () => ({
    initSocket: jest.fn(() => io),
  }));

  jest.doMock('../../../src/utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
  }));

  if (prismaMock) {
    jest.doMock('../../../src/config/prisma', () => prismaMock);
  }

  if (bcryptMock) {
    jest.doMock('bcrypt', () => bcryptMock);
  }

  if (joinRequestServiceMock) {
    jest.doMock('../../../src/services/joinRequest.service', () => joinRequestServiceMock);
  }

  if (coachingServiceMock) {
    jest.doMock('../../../src/services/coaching.service', () => coachingServiceMock);
  }

  if (notificationControllerMock) {
    jest.doMock('../../../src/controllers/notification.controller', () => notificationControllerMock);
  }

  if (pricingServiceMock) {
    jest.doMock('../../../src/services/pricing.service', () => pricingServiceMock);
  }

  const app = require('../../../src/app');
  return { app, io };
}

module.exports = { createTestApp };
