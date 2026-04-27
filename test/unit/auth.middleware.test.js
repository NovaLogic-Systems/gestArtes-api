const test = require('node:test');
const assert = require('node:assert/strict');

const {
  APP_PERMISSIONS,
  getSessionPermissions,
  requireAdminRole,
  requireAllPermissions,
  requirePermission,
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

test('getSessionPermissions maps functional management role names to admin permissions', () => {
  const permissions = getSessionPermissions({
    userId: 123,
    role: 'Direction / Management',
  });

  assert.equal(permissions.includes(APP_PERMISSIONS.ADMIN_PORTAL_ACCESS), true);
  assert.equal(permissions.includes(APP_PERMISSIONS.TEACHER_PORTAL_ACCESS), false);
});

test('requirePermission returns 401 when the request is not authenticated', () => {
  const middleware = requirePermission(APP_PERMISSIONS.MARKETPLACE_ACCESS);
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

test('requirePermission returns 403 when role permissions do not include the required permission', () => {
  const middleware = requirePermission(APP_PERMISSIONS.ADMIN_PORTAL_ACCESS);
  const req = {
    session: {
      userId: 77,
      role: 'student',
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

test('requirePermission allows requests when role has the expected permission', () => {
  const middleware = requirePermission(APP_PERMISSIONS.ADMIN_PORTAL_ACCESS);
  const req = {
    session: {
      userId: 78,
      role: 'Direção',
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

test('requireAllPermissions returns 403 when at least one permission is missing', () => {
  const middleware = requireAllPermissions(
    APP_PERMISSIONS.SESSION_ACCESS,
    APP_PERMISSIONS.ADMIN_PORTAL_ACCESS
  );
  const req = {
    session: {
      userId: 79,
      role: 'teacher',
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

test('requireAllPermissions allows requests only when all permissions are present', () => {
  const middleware = requireAllPermissions(
    APP_PERMISSIONS.SESSION_ACCESS,
    APP_PERMISSIONS.STUDENT_PORTAL_ACCESS,
    APP_PERMISSIONS.INVENTORY_ACCESS
  );
  const req = {
    session: {
      userId: 80,
      role: 'student',
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

test('requireAdminRole accepts functional management labels mapped to admin', () => {
  const req = {
    session: {
      userId: 81,
      role: 'Direction',
    },
  };
  const res = createResponse();
  let nextCalled = false;

  requireAdminRole(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, null);
  assert.equal(res.payload, null);
  assert.equal(nextCalled, true);
});

test('requireAdminRole rejects non-admin roles', () => {
  const req = {
    session: {
      userId: 82,
      role: 'teacher',
    },
  };
  const res = createResponse();
  let nextCalled = false;

  requireAdminRole(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.payload, { error: 'Forbidden' });
  assert.equal(nextCalled, false);
});
