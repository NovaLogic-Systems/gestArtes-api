const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const fakePrisma = {
  $queryRaw: async () => {
    throw new Error('Unexpected database access');
  },
  coachingJoinRequest: {
    count: async () => {
      throw new Error('Unexpected database access');
    },
  },
  inventoryTransaction: {
    count: async () => {
      throw new Error('Unexpected database access');
    },
  },
  marketplaceTransaction: {
    count: async () => {
      throw new Error('Unexpected database access');
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

let getProfile;

try {
  ({ getProfile } = require('../../src/controllers/student.controller'));
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

test('student profile rejects sessions without a student role', async () => {
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