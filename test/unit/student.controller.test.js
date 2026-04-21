const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const mockState = {
  queryRawResults: [],
  counts: {
    coachingJoinRequest: 0,
    inventoryTransaction: 0,
    marketplaceTransaction: 0,
  },
};

const fakePrisma = {
  $queryRaw: async () => mockState.queryRawResults.shift() ?? [],
  coachingJoinRequest: {
    count: async () => mockState.counts.coachingJoinRequest,
  },
  inventoryTransaction: {
    count: async () => mockState.counts.inventoryTransaction,
  },
  marketplaceTransaction: {
    count: async () => mockState.counts.marketplaceTransaction,
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '../config/prisma') {
    return fakePrisma;
  }

  return originalLoad.call(this, request, parent, isMain);
};

let getProfile;
let getDashboard;

try {
  ({ getProfile, getDashboard } = require('../../src/controllers/student.controller'));
} finally {
  Module._load = originalLoad;
}

function createResponse() {
  return {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    },
  };
}

function resetMockState() {
  mockState.queryRawResults = [];
  mockState.counts.coachingJoinRequest = 0;
  mockState.counts.inventoryTransaction = 0;
  mockState.counts.marketplaceTransaction = 0;
}

test('student dashboard rejects sessions without a student role', async () => {
  resetMockState();

  const req = {
    session: {
      userId: 123,
      role: 'teacher',
    },
  };
  const res = createResponse();
  let nextCalled = false;

  await getDashboard(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.payload, { error: 'Forbidden' });
  assert.equal(nextCalled, false);
});

test('student profile rejects sessions without a student role', async () => {
  resetMockState();

  const req = {
    session: {
      userId: 123,
    },
  };
  const res = createResponse();
  let nextCalled = false;

  await getProfile(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.payload, { error: 'Forbidden' });
  assert.equal(nextCalled, false);
});

test('student profile returns profile and statistics payloads', async () => {
  resetMockState();

  mockState.queryRawResults = [
    [
      {
        userId: 12,
        authUid: 'auth-12',
        firstName: 'Ana',
        lastName: 'Silva',
        email: 'ana@example.com',
        phoneNumber: '999',
        photoUrl: null,
        accountCreatedAt: new Date('2026-01-01T10:00:00Z'),
        accountUpdatedAt: new Date('2026-01-02T10:00:00Z'),
        studentAccountId: 7,
        birthDate: new Date('2005-03-04T00:00:00Z'),
        guardianName: 'Maria',
        guardianPhone: '123',
      },
    ],
    [{ totalSessionsEnrolled: 4, upcomingSessions: 2, completedSessions: 1 }],
    [{ statusName: 'attended', total: 2 }],
    [
      {
        sessionId: 99,
        startTime: new Date('2026-03-27T18:30:00Z'),
        endTime: new Date('2026-03-27T19:30:00Z'),
        modalityName: 'Ballet',
        studioName: 'Studio A',
        sessionStatus: 'Scheduled',
      },
    ],
    [{ modalityName: 'Ballet', sessions: 2 }],
  ];

  mockState.counts.coachingJoinRequest = 1;
  mockState.counts.inventoryTransaction = 2;
  mockState.counts.marketplaceTransaction = 3;

  const req = {
    session: {
      userId: 12,
      role: 'student',
    },
  };
  const res = createResponse();

  await getProfile(req, res, () => {
    throw new Error('next() should not be called for a successful profile request');
  });

  assert.equal(res.statusCode, null);
  assert.deepEqual(res.payload.profile.studentCode, 'ST-0007');
  assert.equal(res.payload.statistics.upcomingSessions, 2);
  assert.equal(res.payload.statistics.totalJoinRequests, 1);
  assert.equal(res.payload.statistics.totalInventoryRentals, 2);
  assert.equal(res.payload.statistics.totalMarketplacePurchases, 3);
});

test('student dashboard returns summary, notifications and schedule', async () => {
  resetMockState();

  mockState.queryRawResults = [
    [
      {
        userId: 12,
        authUid: 'auth-12',
        firstName: 'Ana',
        lastName: 'Silva',
        email: 'ana@example.com',
        phoneNumber: '999',
        photoUrl: null,
        accountCreatedAt: new Date('2026-01-01T10:00:00Z'),
        accountUpdatedAt: new Date('2026-01-02T10:00:00Z'),
        studentAccountId: 7,
        birthDate: new Date('2005-03-04T00:00:00Z'),
        guardianName: 'Maria',
        guardianPhone: '123',
      },
    ],
    [{ upcomingSessions: 2 }],
    [{ pendingValidations: 1 }],
    [{ reviewRequests: 0 }],
    [
      {
        notificationId: 1,
        title: 'Session confirmed',
        message: 'Session confirmed',
        isRead: false,
        createdAt: new Date('2026-03-20T09:00:00Z'),
      },
    ],
    [
      {
        sessionId: 21,
        sessionDate: '2026-03-27',
        sessionTime: '18:30',
        teacherName: 'Ana',
        studioName: 'Studio A',
        sessionStatus: 'Scheduled',
      },
    ],
  ];

  const req = {
    session: {
      userId: 12,
      role: 'student',
    },
  };
  const res = createResponse();

  await getDashboard(req, res, () => {
    throw new Error('next() should not be called for a successful dashboard request');
  });

  assert.equal(res.statusCode, null);
  assert.deepEqual(res.payload, {
    upcomingSessions: 2,
    pendingValidations: 1,
    reviewRequests: 0,
    notifications: [
      {
        id: 1,
        title: 'Session confirmed',
        message: 'Session confirmed',
        read: false,
        createdAt: new Date('2026-03-20T09:00:00Z'),
      },
    ],
    schedule: [
      {
        sessionId: 21,
        date: '2026-03-27',
        time: '18:30',
        teacher: 'Ana',
        studio: 'Studio A',
        status: 'Scheduled',
      },
    ],
  });
});