/**
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function createState() {
  return {
    pendingStatus: { StatusID: 10 },
    pricingRateById: new Map([[77, { PricingRateID: 77 }]]),
    defaultPricingRate: { PricingRateID: 5 },
    adminRows: [],
    shouldThrowOnDefaultPricingRate: false,
    createSessionCalls: [],
    findFirstOrThrowCalls: 0,
  };
}

let state = createState();

const fakePrisma = {
  sessionStatus: {
    findFirst: async () => state.pendingStatus,
  },
  sessionPricingRate: {
    findUnique: async ({ where }) => state.pricingRateById.get(where.PricingRateID) || null,
    findFirstOrThrow: async () => {
      state.findFirstOrThrowCalls += 1;

      if (state.shouldThrowOnDefaultPricingRate) {
        throw new Error('No default pricing rate');
      }

      return state.defaultPricingRate;
    },
  },
  userRole: {
    findMany: async () => state.adminRows,
  },
};

const fakeSessionService = {
  createSessionWithBusinessRules: async (payload, userId) => {
    state.createSessionCalls.push({ payload, userId });
    return {
      SessionID: 901,
      StartTime: payload.startTime,
      EndTime: payload.endTime,
      PricingRateID: payload.pricingRateId,
      StatusID: payload.statusId,
    };
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '../config/prisma') {
    return fakePrisma;
  }

  if (request === './session.service') {
    return fakeSessionService;
  }

  return originalLoad.call(this, request, parent, isMain);
};

let coachingService;

try {
  coachingService = require('../../src/services/coaching.service');
} finally {
  Module._load = originalLoad;
}

function resetState(overrides = {}) {
  state = {
    ...createState(),
    ...overrides,
  };
}

function validPayload(overrides = {}) {
  return {
    date: '2099-12-01T10:00:00.000Z',
    studioId: 2,
    modalityId: 3,
    capacity: 8,
    isExternal: false,
    isOutsideStdHours: false,
    ...overrides,
  };
}

test('createSessionInitiative uses provided pricingRateId', async () => {
  resetState({
    pricingRateById: new Map([[77, { PricingRateID: 77 }]]),
  });

  const session = await coachingService.createSessionInitiative(validPayload({ pricingRateId: 77 }), 321);

  assert.equal(session.PricingRateID, 77);
  assert.equal(state.findFirstOrThrowCalls, 0);
  assert.equal(state.createSessionCalls.length, 1);
  assert.equal(state.createSessionCalls[0].payload.statusId, 10);
});

test('createSessionInitiative uses default pricing rate when pricingRateId is omitted', async () => {
  resetState({
    defaultPricingRate: { PricingRateID: 12 },
  });

  const session = await coachingService.createSessionInitiative(validPayload(), 654);

  assert.equal(session.PricingRateID, 12);
  assert.equal(state.findFirstOrThrowCalls, 1);
  assert.equal(state.createSessionCalls.length, 1);
});

test('createSessionInitiative returns 500 when pending status is not configured', async () => {
  resetState({
    pendingStatus: null,
  });

  await assert.rejects(
    () => coachingService.createSessionInitiative(validPayload(), 400),
    (error) => {
      assert.equal(error.status, 500);
      assert.match(error.message, /não configurado/i);
      return true;
    }
  );
});

test('createSessionInitiative returns 500 when no default pricing rate exists', async () => {
  resetState({
    shouldThrowOnDefaultPricingRate: true,
  });

  await assert.rejects(
    () => coachingService.createSessionInitiative(validPayload(), 500),
    (error) => {
      assert.equal(error.status, 500);
      assert.match(error.message, /tabela de preços/i);
      return true;
    }
  );
});

test('listAdminUserIds deduplicates and filters invalid IDs', async () => {
  resetState({
    adminRows: [{ UserID: 10 }, { UserID: 10 }, { UserID: -5 }, { UserID: 22 }, { UserID: null }],
  });

  const adminIds = await coachingService.listAdminUserIds();

  assert.deepEqual(adminIds, [10, 22]);
});
