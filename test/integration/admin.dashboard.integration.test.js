const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Module = require('node:module');

function createState() {
  return {
    pendingJoinRequestCount: 4,
    pendingValidationCount: 6,
    pendingSubmissionCount: 3,
    totalClassesHeld: 42,
    monthlyRevenue: 4812.5,
    notices: [
      {
        NotificationID: 9001,
        Title: 'Financeiro',
        Message: 'Exportacao de fevereiro concluida.',
        CreatedAt: new Date('2026-04-20T08:00:00.000Z'),
      },
    ],
  };
}

let state = createState();

const fakePrisma = {
  coachingJoinRequestStatus: {
    findMany: async () => [
      { StatusID: 1, StatusName: 'PendingTeacher' },
      { StatusID: 2, StatusName: 'PendingAdmin' },
      { StatusID: 3, StatusName: 'Approved' },
    ],
  },
  teacherAvailabilityStatus: {
    findMany: async () => [
      { StatusID: 11, StatusName: 'Pending' },
      { StatusID: 12, StatusName: 'Approved' },
    ],
  },
  coachingJoinRequest: {
    count: async () => state.pendingJoinRequestCount,
  },
  coachingSession: {
    count: async ({ where }) => {
      if (where?.ValidationRequestedAt) {
        return state.pendingValidationCount;
      }

      return state.totalClassesHeld;
    },
    findMany: async () => [
      {
        StudioID: 1,
        _count: {
          SessionStudent: 14,
        },
      },
    ],
  },
  teacherAvailability: {
    count: async () => state.pendingSubmissionCount,
  },
  financialEntry: {
    aggregate: async () => ({
      _sum: {
        Amount: state.monthlyRevenue,
      },
    }),
  },
  studio: {
    findMany: async () => [
      {
        StudioID: 1,
        StudioName: 'E1',
        Capacity: 16,
        StudioModality: [{ Modality: { ModalityName: 'Jazz' } }],
      },
      {
        StudioID: 2,
        StudioName: 'E2',
        Capacity: 20,
        StudioModality: [{ Modality: { ModalityName: 'Ballet' } }],
      },
    ],
  },
  notification: {
    findMany: async () => state.notices,
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '../config/prisma') {
    return fakePrisma;
  }

  if (request === '@prisma/client') {
    return {
      Prisma: {
        TransactionIsolationLevel: {
          Serializable: 'Serializable',
        },
      },
    };
  }

  return originalLoad.call(this, request, parent, isMain);
};

let adminRoutes;

try {
  adminRoutes = require('../../src/routes/admin.routes');
} finally {
  Module._load = originalLoad;
}

function resetState() {
  state = createState();
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = {
      userId: 500,
      role: 'admin',
    };
    next();
  });

  app.use('/admin', adminRoutes);
  app.use((error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }

    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  });

  return app;
}

async function startServer() {
  const app = createApp();
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
  };
}

test('GET /admin/dashboard returns dashboard KPIs, occupancy heatmap and notices', async () => {
  resetState();
  const server = await startServer();

  try {
    const response = await fetch(`${server.baseUrl}/admin/dashboard`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.kpis.pendingRequests, 4);
    assert.equal(body.kpis.pendingValidations, 6);
    assert.equal(body.kpis.pendingSubmissions, 3);
    assert.equal(body.kpis.monthlyRevenue, 4812.5);
    assert.equal(body.kpis.totalClassesHeld, 42);
    assert.equal(Array.isArray(body.studioOccupancyHeatmap), true);
    assert.equal(body.studioOccupancyHeatmap.length, 2);
    assert.equal(body.studioOccupancyHeatmap[0].studioName, 'E1');
    assert.equal(body.managementNotices.length, 1);
    assert.equal(body.managementNotices[0].notificationId, 9001);
    assert.equal(typeof body.generatedAt, 'string');
  } finally {
    await server.close();
  }
});
