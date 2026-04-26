const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Module = require('node:module');

function createState() {
  return {
    studioExists: true,
    studioCapacity: 20,
    studioSupportsModality: true,
    studioOverlapCount: 0,
    teacherConflicts: [],
    absentTeacherIds: new Set(),
    availabilityByTeacherId: new Map([[101, { punctual: true, recurring: false }]]),
    validStatusIds: new Set([1]),
    validPricingRateIds: new Set([1]),
    validAssignmentRoleIds: new Set([1]),
    validTeacherIds: new Set([101]),
    nextSessionId: 700,
  };
}

let state = createState();

const fakePrisma = {
  $transaction: async (callback) => callback(fakePrisma),
  studio: {
    findUnique: async () => {
      if (!state.studioExists) {
        return null;
      }

      return {
        StudioID: 1,
        Capacity: state.studioCapacity,
      };
    },
  },
  studioModality: {
    findUnique: async () => (state.studioSupportsModality ? { StudioID: 1, ModalityID: 2 } : null),
  },
  coachingSession: {
    count: async () => state.studioOverlapCount,
    create: async ({ data }) => ({
      SessionID: state.nextSessionId++,
      ...data,
    }),
  },
  sessionTeacher: {
    findMany: async () => state.teacherConflicts.map((TeacherID) => ({ TeacherID })),
    createMany: async ({ data }) => ({ count: data.length }),
  },
  teacherAbsence: {
    count: async ({ where }) => (state.absentTeacherIds.has(where.TeacherID) ? 1 : 0),
  },
  teacherAvailability: {
    count: async ({ where }) => {
      const availability = state.availabilityByTeacherId.get(where.TeacherID) || {
        punctual: false,
        recurring: false,
      };

      if (where.TeacherAvailabilityPunctual) {
        return availability.punctual ? 1 : 0;
      }

      if (where.TeacherAvailabilityRecurring) {
        return availability.recurring ? 1 : 0;
      }

      return 0;
    },
  },
  sessionStatus: {
    findUnique: async ({ where }) => (state.validStatusIds.has(where.StatusID) ? { StatusID: where.StatusID } : null),
  },
  sessionPricingRate: {
    findUnique: async ({ where }) => (
      state.validPricingRateIds.has(where.PricingRateID) ? { PricingRateID: where.PricingRateID } : null
    ),
  },
  teacherAssignmentRole: {
    findUnique: async ({ where }) => (
      state.validAssignmentRoleIds.has(where.AssignmentRoleID) ? { AssignmentRoleID: where.AssignmentRoleID } : null
    ),
  },
  user: {
    findMany: async ({ where }) => {
      const ids = where?.UserID?.in || [];
      return ids
        .filter((id) => state.validTeacherIds.has(id))
        .map((id) => ({ UserID: id }));
    },
    findUnique: async () => ({ UserID: 1, IsActive: true, DeletedAt: null }),
    update: async () => ({}),
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
      userId: 900,
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
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
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

async function postSession(baseUrl, payloadOverrides = {}) {
  const payload = {
    studioId: 1,
    startTime: '2026-05-15T10:00:00.000Z',
    endTime: '2026-05-15T11:00:00.000Z',
    modalityId: 2,
    pricingRateId: 1,
    statusId: 1,
    teacherIds: [101],
    assignmentRoleId: 1,
    maxParticipants: 10,
    isExternal: false,
    isOutsideStdHours: false,
    ...payloadOverrides,
  };

  const response = await fetch(`${baseUrl}/admin/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return {
    status: response.status,
    body,
  };
}

test('POST /admin/sessions returns 201 for valid payload', async () => {
  resetState();
  const server = await startServer();

  try {
    const response = await postSession(server.baseUrl);
    assert.equal(response.status, 201);
    assert.equal(response.body.message, 'Sessão criada com sucesso');
    assert.equal(typeof response.body.sessionId, 'number');
  } finally {
    await server.close();
  }
});

test('POST /admin/sessions returns 409 for studio schedule conflict', async () => {
  resetState();
  state.studioOverlapCount = 1;
  const server = await startServer();

  try {
    const response = await postSession(server.baseUrl);
    assert.equal(response.status, 409);
    assert.equal(response.body.error, 'Conflito de horario no estudio');
  } finally {
    await server.close();
  }
});

test('POST /admin/sessions returns 409 for teacher double booking', async () => {
  resetState();
  state.teacherConflicts = [101];
  const server = await startServer();

  try {
    const response = await postSession(server.baseUrl);
    assert.equal(response.status, 409);
    assert.equal(response.body.error, 'Professor ja tem sessao nesse horario');
    assert.deepEqual(response.body.details, { teacherIds: [101] });
  } finally {
    await server.close();
  }
});

test('POST /admin/sessions returns 409 when teacher is absent', async () => {
  resetState();
  state.absentTeacherIds.add(101);
  const server = await startServer();

  try {
    const response = await postSession(server.baseUrl);
    assert.equal(response.status, 409);
    assert.equal(response.body.error, 'Professor indisponivel por ausencia');
    assert.deepEqual(response.body.details, { teacherId: 101 });
  } finally {
    await server.close();
  }
});