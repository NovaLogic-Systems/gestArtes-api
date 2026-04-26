const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function createState() {
  return {
    statuses: [
      { StatusID: 1, StatusName: 'Approved' },
      { StatusID: 2, StatusName: 'Rejected' },
    ],
    studios: [
      { StudioID: 1, StudioName: 'Sala A', Capacity: 20 },
      { StudioID: 2, StudioName: 'Sala B', Capacity: 12 },
    ],
    sessions: [],
    blocks: [],
    overrides: [],
    createdBlocks: [],
    createdOverrides: [],
    updateManyCalls: [],
  };
}

let state = createState();

const fakePrisma = {
  sessionStatus: {
    findMany: async () => state.statuses,
  },
  studio: {
    findMany: async () => state.studios,
    findUnique: async ({ where }) => state.studios.find((entry) => entry.StudioID === where.StudioID) || null,
  },
  coachingSession: {
    findMany: async ({ where }) => {
      const allowedStatusIds = where?.StatusID?.in || [];
      const rangeStart = where?.EndTime?.gt;
      const rangeEnd = where?.StartTime?.lt;

      return state.sessions
        .filter((entry) => allowedStatusIds.includes(entry.StatusID))
        .filter((entry) => entry.StartTime < rangeEnd && entry.EndTime > rangeStart)
        .map((entry) => ({ ...entry }));
    },
  },
  studioBlock: {
    findMany: async ({ where }) => {
      const rangeStart = where?.EndsAt?.gt;
      const rangeEnd = where?.StartsAt?.lt;

      return state.blocks
        .filter((entry) => entry.IsActive)
        .filter((entry) => entry.StartsAt < rangeEnd && entry.EndsAt > rangeStart)
        .map((entry) => ({ ...entry }));
    },
    create: async ({ data }) => {
      const created = {
        StudioBlockID: 1000 + state.createdBlocks.length,
        ...data,
      };
      state.createdBlocks.push(created);
      return created;
    },
  },
  studioStatusOverride: {
    findMany: async ({ where }) => {
      const rangeStart = where?.OR?.[1]?.EndsAt?.gt;
      const rangeEnd = where?.StartsAt?.lt;

      return state.overrides
        .filter((entry) => entry.IsActive)
        .filter((entry) => entry.StartsAt < rangeEnd && (!entry.EndsAt || entry.EndsAt > rangeStart))
        .map((entry) => ({ ...entry }));
    },
    updateMany: async ({ where, data }) => {
      state.updateManyCalls.push({ where, data });
      return { count: 1 };
    },
    create: async ({ data }) => {
      const created = {
        StudioStatusOverrideID: 2000 + state.createdOverrides.length,
        ...data,
      };
      state.createdOverrides.push(created);
      return created;
    },
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '../config/prisma') {
    return fakePrisma;
  }

  return originalLoad.call(this, request, parent, isMain);
};

let studioOccupancyService;

try {
  studioOccupancyService = require('../../src/services/studioOccupancy.service');
} finally {
  Module._load = originalLoad;
}

function resetState() {
  state = createState();
}

function buildSession(overrides = {}) {
  return {
    SessionID: 10,
    StudioID: 1,
    StatusID: 1,
    StartTime: new Date('2026-04-25T10:00:00.000Z'),
    EndTime: new Date('2026-04-25T11:00:00.000Z'),
    SessionTeacher: [
      {
        TeacherID: 7,
        User: {
          UserID: 7,
          FirstName: 'Alex',
          LastName: 'Silva',
        },
      },
    ],
    User_CoachingSession_RequestedByUserIDToUser: null,
    ...overrides,
  };
}

test('getStudioOccupancyRealTime reports double-booking alerts', async () => {
  resetState();

  state.sessions = [
    buildSession({ SessionID: 11 }),
    buildSession({
      SessionID: 12,
      StartTime: new Date('2026-04-25T10:15:00.000Z'),
      EndTime: new Date('2026-04-25T11:15:00.000Z'),
    }),
  ];

  const result = await studioOccupancyService.getStudioOccupancyRealTime({
    at: '2026-04-25T10:30:00.000Z',
  });

  assert.equal(result.summary.doubleBookingAlerts, 1);
  assert.equal(result.alerts.length, 1);
  assert.equal(result.alerts[0].type, 'DOUBLE_BOOKING');
  assert.equal(result.studios.find((item) => item.studioId === 1).status, 'double-booked');
});

test('getStudioOccupancyRealTime accepts DD-MM-YYYY input format', async () => {
  resetState();

  state.sessions = [
    buildSession({
      SessionID: 13,
      StartTime: new Date('2026-04-25T08:00:00.000Z'),
      EndTime: new Date('2026-04-25T12:00:00.000Z'),
    }),
  ];

  const result = await studioOccupancyService.getStudioOccupancyRealTime({
    at: '25-04-2026 10:00',
  });

  assert.equal(result.summary.totalStudios, 2);
  assert.equal(result.studios.find((item) => item.studioId === 1).status, 'occupied');
});

test('getStudioOccupancyForecast returns occupancy analytics per studio', async () => {
  resetState();

  state.sessions = [
    buildSession({
      SessionID: 21,
      StartTime: new Date('2026-04-25T09:00:00.000Z'),
      EndTime: new Date('2026-04-25T10:00:00.000Z'),
    }),
    buildSession({
      SessionID: 22,
      StartTime: new Date('2026-04-25T09:30:00.000Z'),
      EndTime: new Date('2026-04-25T10:30:00.000Z'),
    }),
  ];

  const result = await studioOccupancyService.getStudioOccupancyForecast({
    from: '2026-04-25T09:00:00.000Z',
    to: '2026-04-25T11:00:00.000Z',
  });

  const studioA = result.studios.find((entry) => entry.studioId === 1);

  assert.equal(result.summary.totalDoubleBookingConflicts, 1);
  assert.equal(studioA.doubleBookingConflicts, 1);
  assert.equal(studioA.scheduledMinutes, 90);
  assert.equal(studioA.occupiedMinutes, 90);
  assert.equal(studioA.idleMinutes, 30);
});

test('blockStudio creates a global block and reports session conflicts', async () => {
  resetState();

  state.sessions = [
    buildSession({
      SessionID: 31,
      StartTime: new Date('2026-04-25T14:00:00.000Z'),
      EndTime: new Date('2026-04-25T15:00:00.000Z'),
    }),
  ];

  const result = await studioOccupancyService.blockStudio({
    studioId: 1,
    startsAt: '2026-04-25T14:30:00.000Z',
    endsAt: '2026-04-25T16:00:00.000Z',
    reason: 'Maintenance',
    blockType: 'maintenance',
    userId: 99,
  });

  assert.equal(state.createdBlocks.length, 1);
  assert.equal(result.alerts.length, 1);
  assert.equal(result.alerts[0].type, 'BLOCK_CONFLICT');
  assert.deepEqual(result.alerts[0].conflictingSessionIds, [31]);
});

test('updateStudioStatus clears active overrides when setting available', async () => {
  resetState();

  const result = await studioOccupancyService.updateStudioStatus({
    studioId: 1,
    status: 'available',
    reason: null,
    startsAt: '2026-04-25T08:00:00.000Z',
    endsAt: null,
    userId: 99,
  });

  assert.equal(state.updateManyCalls.length, 1);
  assert.equal(state.createdOverrides.length, 0);
  assert.equal(result.statusOverride, null);
});
