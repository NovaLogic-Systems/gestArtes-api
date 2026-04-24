const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const mockState = {
  existingUser: null,
  listedUsers: [],
  roles: [
    { RoleID: 1, RoleName: 'Direção' },
    { RoleID: 2, RoleName: 'Professor' },
    { RoleID: 3, RoleName: 'Aluno' },
  ],
  userCreateData: null,
  userRoleCreateData: null,
  studentAccountCreateData: null,
};

const fakeBcrypt = {
  hash: async (value) => `hashed:${value}`,
};

const fakePrisma = {
  $transaction: async (callback) => callback(fakePrisma),
  role: {
    findMany: async () => mockState.roles,
  },
  user: {
    findUnique: async ({ where }) => {
      if (where?.Email) {
        return mockState.existingUser;
      }

      if (where?.UserID && mockState.userCreateData) {
        const linkedRole = mockState.roles.find((entry) => entry.RoleID === mockState.userRoleCreateData?.RoleID);

        return {
          UserID: where.UserID,
          FirstName: mockState.userCreateData.FirstName,
          LastName: mockState.userCreateData.LastName,
          Email: mockState.userCreateData.Email,
          PhoneNumber: mockState.userCreateData.PhoneNumber,
          CreatedAt: mockState.userCreateData.CreatedAt,
          IsActive: mockState.userCreateData.IsActive,
          UserRole: linkedRole ? [{ Role: linkedRole }] : [],
        };
      }

      return null;
    },
    findMany: async () => mockState.listedUsers,
    create: async ({ data }) => {
      mockState.userCreateData = data;
      return {
        UserID: 501,
      };
    },
    update: async () => ({}),
  },
  userRole: {
    create: async ({ data }) => {
      mockState.userRoleCreateData = data;
      return data;
    },
  },
  studentAccount: {
    create: async ({ data }) => {
      mockState.studentAccountCreateData = data;
      return data;
    },
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'bcrypt') {
    return fakeBcrypt;
  }

  if (request === '../config/prisma') {
    return fakePrisma;
  }

  return originalLoad.call(this, request, parent, isMain);
};

let createUser;
let listUsers;

try {
  ({ createUser, listUsers } = require('../../src/controllers/admin.controller'));
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
    send() {
      return this;
    },
  };
}

function resetMockState() {
  mockState.existingUser = null;
  mockState.listedUsers = [];
  mockState.userCreateData = null;
  mockState.userRoleCreateData = null;
  mockState.studentAccountCreateData = null;
}

test('createUser maps Direction to admin and creates a role assignment', async () => {
  resetMockState();

  const req = {
    body: {
      firstName: 'Ana',
      lastName: 'Silva',
      email: 'ana@example.com',
      phoneNumber: '999999999',
      password: 'Password1',
      role: 'Direction',
    },
  };
  const res = createResponse();

  await createUser(req, res, (error) => {
    throw error;
  });

  assert.equal(res.statusCode, 201);
  assert.equal(mockState.userRoleCreateData.RoleID, 1);
  assert.equal(mockState.studentAccountCreateData, null);
  assert.equal(res.payload.user.role, 'admin');
});

test('createUser requires birth date when creating a student user', async () => {
  resetMockState();

  const req = {
    body: {
      firstName: 'Rita',
      email: 'rita@example.com',
      password: 'Password1',
      role: 'student',
    },
  };
  const res = createResponse();
  let nextCalled = false;

  await createUser(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.payload, { error: 'Birth date is required for student users' });
  assert.equal(nextCalled, false);
});

test('listUsers normalizes stored business roles to app roles', async () => {
  resetMockState();

  mockState.listedUsers = [
    {
      UserID: 77,
      FirstName: 'Marta',
      LastName: 'Costa',
      Email: 'marta@example.com',
      PhoneNumber: '123',
      IsActive: true,
      CreatedAt: new Date('2026-04-23T10:00:00Z'),
      UserRole: [
        {
          Role: {
            RoleName: 'Direção',
          },
        },
      ],
    },
  ];

  const req = {};
  const res = createResponse();

  await listUsers(req, res, (error) => {
    throw error;
  });

  assert.equal(res.statusCode, null);
  assert.equal(res.payload.users.length, 1);
  assert.equal(res.payload.users[0].role, 'admin');
  assert.equal(res.payload.users[0].roleLabel, 'Direção');
});
