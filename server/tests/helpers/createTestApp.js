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
  notificationControllerMock,
} = {}) {
  jest.resetModules();

  jest.doMock('dotenv', () => ({
    config: jest.fn(() => ({})),
  }));

  jest.doMock('morgan', () => () => (_req, _res, next) => next());

  jest.doMock('connect-mssql-v2', () => {
    const { InMemorySessionStore } = require('./inMemorySessionStore');
    return InMemorySessionStore;
  });

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

  if (notificationControllerMock) {
    jest.doMock('../../../src/controllers/notification.controller', () => notificationControllerMock);
  }

  const app = require('../../../src/app');
  return { app, io };
}

module.exports = { createTestApp };
