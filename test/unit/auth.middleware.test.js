const test = require('node:test');
const assert = require('node:assert/strict');

const {
  requireRole,
} = require('../../src/middlewares/auth.middleware');

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

test('requireRole returns 401 when the request is not authenticated', () => {
  const middleware = requireRole(['STUDENT']);
  const req = {
    session: null,
  };
  const res = createResponse();
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.payload, { error: 'Unauthorized' });
  assert.equal(nextCalled, false);
});

test('requireRole returns 403 when session user role is missing', () => {
  const middleware = requireRole(['STUDENT']);
  const req = {
    session: {
      userId: 44,
      user: {},
    },
  };
  const res = createResponse();
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.payload, { error: 'Forbidden' });
  assert.equal(nextCalled, false);
});

test('requireRole allows requests whose session user role is explicitly permitted', () => {
  const middleware = requireRole(['TEACHER', 'ADMIN']);
  const req = {
    session: {
      userId: 55,
      user: {
        role: 'teacher',
      },
    },
  };
  const res = createResponse();
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, null);
  assert.equal(res.payload, null);
  assert.equal(nextCalled, true);
});
