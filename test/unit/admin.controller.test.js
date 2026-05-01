/**
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const mockState = {
  existingUser: null,
  existingAuthUidUser: null,
  listedUsers: [],
  userById: {},
  roles: [
    { RoleID: 1, RoleName: 'Direção' },
    { RoleID: 2, RoleName: 'Professor' },
    { RoleID: 3, RoleName: 'Aluno' },
  ],
  userCreateData: null,
  userUpdateData: null,
  userRoleCreateData: null,
  userRoleCreateManyData: null,
  userRoleDeleteWhere: null,
  studentAccountCreateData: null,
  studentAccountUpdateData: null,
  postSessionValidations: [],
  finalizationResult: {
    sessionId: 901,
    financialEntryId: 777,
    finalPrice: 82.5,
  },
  finalizationArgs: null,
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

      if (where?.AuthUID) {
        return mockState.existingAuthUidUser;
      }

      if (where?.UserID && mockState.userCreateData) {
        const linkedRole = mockState.roles.find((entry) => entry.RoleID === mockState.userRoleCreateData?.RoleID);

        return {
          UserID: where.UserID,
          FirstName: mockState.userCreateData.FirstName,
          LastName: mockState.userCreateData.LastName,
          Email: mockState.userCreateData.Email,
          PhoneNumber: mockState.userCreateData.PhoneNumber,
          AuthUID: mockState.userCreateData.AuthUID,
          CreatedAt: mockState.userCreateData.CreatedAt,
          IsActive: mockState.userCreateData.IsActive,
          DeletedAt: null,
          UserRole: linkedRole ? [{ Role: linkedRole }] : [],
          StudentAccount: mockState.studentAccountCreateData
            ? {
                BirthDate: mockState.studentAccountCreateData.BirthDate,
                GuardianName: mockState.studentAccountCreateData.GuardianName,
                GuardianPhone: mockState.studentAccountCreateData.GuardianPhone,
              }
            : null,
        };
      }

      if (where?.UserID && mockState.userById[where.UserID]) {
        return mockState.userById[where.UserID];
      }

      return null;
    },
    findMany: async () => mockState.listedUsers,
    create: async ({ data }) => {
      mockState.userCreateData = data;
      mockState.userById[501] = {
        UserID: 501,
        FirstName: data.FirstName,
        LastName: data.LastName,
        Email: data.Email,
        PhoneNumber: data.PhoneNumber,
        AuthUID: data.AuthUID,
        CreatedAt: data.CreatedAt,
        UpdatedAt: data.UpdatedAt,
        IsActive: data.IsActive,
        DeletedAt: null,
        UserRole: [],
        StudentAccount: null,
      };
      return {
        UserID: 501,
      };
    },
    update: async ({ where, data }) => {
      mockState.userUpdateData = { where, data };
      const current = mockState.userById[where.UserID] || { UserID: where.UserID };
      mockState.userById[where.UserID] = {
        ...current,
        FirstName: data.FirstName ?? current.FirstName,
        LastName: Object.prototype.hasOwnProperty.call(data, 'LastName') ? data.LastName : current.LastName,
        Email: data.Email ?? current.Email,
        PhoneNumber: Object.prototype.hasOwnProperty.call(data, 'PhoneNumber') ? data.PhoneNumber : current.PhoneNumber,
        AuthUID: data.AuthUID ?? current.AuthUID,
        IsActive: Object.prototype.hasOwnProperty.call(data, 'IsActive') ? data.IsActive : current.IsActive,
        UpdatedAt: data.UpdatedAt ?? current.UpdatedAt,
        DeletedAt: data.DeletedAt ?? current.DeletedAt,
      };
      return mockState.userById[where.UserID];
    },
  },
  userRole: {
    create: async ({ data }) => {
      mockState.userRoleCreateData = data;
      const linkedRole = mockState.roles.find((entry) => entry.RoleID === data.RoleID);
      const user = mockState.userById[data.UserID];
      if (user && linkedRole) {
        user.UserRole = [{ Role: linkedRole }];
      }
      return data;
    },
    deleteMany: async ({ where }) => {
      mockState.userRoleDeleteWhere = where;
      return { count: 1 };
    },
    createMany: async ({ data }) => {
      mockState.userRoleCreateManyData = data;
      const userId = data[0]?.UserID;
      const user = userId ? mockState.userById[userId] : null;
      if (user) {
        user.UserRole = data
          .map((entry) => mockState.roles.find((role) => role.RoleID === entry.RoleID))
          .filter(Boolean)
          .map((role) => ({ Role: role }));
      }
      return { count: data.length };
    },
  },
  studentAccount: {
    create: async ({ data }) => {
      mockState.studentAccountCreateData = data;
      const current = mockState.userById[data.UserID];
      if (current) {
        current.StudentAccount = {
          BirthDate: data.BirthDate,
          GuardianName: data.GuardianName,
          GuardianPhone: data.GuardianPhone,
        };
      }
      return data;
    },
    update: async ({ data }) => {
      mockState.studentAccountUpdateData = data;
      return data;
    },
  },
};

const fakeAdminService = {
  listPostSessionValidationQueue: async () => mockState.postSessionValidations,
  finalizeSessionValidation: async ({ sessionId, adminUserId }) => {
    mockState.finalizationArgs = { sessionId, adminUserId };
    return mockState.finalizationResult;
  },
  getStudioOccupancy: async () => ({ studios: [] }),
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'bcrypt') {
    return fakeBcrypt;
  }

  if (request === '../config/prisma') {
    return fakePrisma;
  }

  if (request === '../services/admin.service') {
    return fakeAdminService;
  }

  if (request === '../services/adminValidation.service') {
    return { listPostSessionValidations: async () => [], finalizeSessionValidation: async () => ({}) };
  }

  return originalLoad.call(this, request, parent, isMain);
};

let createUser;
let deleteUser;
let finalizeSessionValidation;
let getPostSessionValidations;
let listUsers;
let updateUser;
let updateUserRoles;

try {
  ({
    createUser,
    deleteUser,
    finalizeSessionValidation,
    getPostSessionValidations,
    listUsers,
    updateUser,
    updateUserRoles,
  } = require('../../src/controllers/admin.controller'));
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
  mockState.existingAuthUidUser = null;
  mockState.listedUsers = [];
  mockState.userById = {};
  mockState.userCreateData = null;
  mockState.userUpdateData = null;
  mockState.userRoleCreateData = null;
  mockState.userRoleCreateManyData = null;
  mockState.userRoleDeleteWhere = null;
  mockState.studentAccountCreateData = null;
  mockState.studentAccountUpdateData = null;
  mockState.postSessionValidations = [];
  mockState.finalizationResult = {
    sessionId: 901,
    financialEntryId: 777,
    finalPrice: 82.5,
  };
  mockState.finalizationArgs = null;
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

test('createUser requires student number when creating a student user', async () => {
  resetMockState();

  const req = {
    body: {
      firstName: 'Joao',
      email: 'joao@example.com',
      password: 'Password1',
      role: 'student',
      birthDate: '2006-05-10',
    },
  };
  const res = createResponse();

  await createUser(req, res, (error) => {
    throw error;
  });

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.payload, { error: 'Student number is required for student users' });
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
      AuthUID: 'ST-0001',
      IsActive: true,
      CreatedAt: new Date('2026-04-23T10:00:00Z'),
      UserRole: [
        {
          Role: {
            RoleName: 'Direção',
          },
        },
      ],
      StudentAccount: {
        BirthDate: new Date('2008-01-01T00:00:00Z'),
        GuardianName: 'Mae',
        GuardianPhone: '999999999',
      },
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

test('updateUser updates student number for student users', async () => {
  resetMockState();

  mockState.userById[44] = {
    UserID: 44,
    FirstName: 'Marta',
    LastName: 'Costa',
    Email: 'marta@example.com',
    PhoneNumber: '123',
    AuthUID: 'ST-0001',
    IsActive: true,
    DeletedAt: null,
    UserRole: [{ Role: { RoleName: 'Aluno' } }],
    StudentAccount: {
      BirthDate: new Date('2008-01-01T00:00:00Z'),
      GuardianName: 'Mae',
      GuardianPhone: '999999999',
    },
  };

  const req = {
    params: { id: '44' },
    body: {
      studentNumber: 'ST-0999',
    },
  };
  const res = createResponse();

  await updateUser(req, res, (error) => {
    throw error;
  });

  assert.equal(res.statusCode, null);
  assert.equal(mockState.userUpdateData.data.AuthUID, 'ST-0999');
  assert.equal(res.payload.user.studentNumber, 'ST-0999');
});

test('updateUserRoles replaces role assignments and creates student profile when needed', async () => {
  resetMockState();

  mockState.userById[55] = {
    UserID: 55,
    FirstName: 'Tiago',
    LastName: 'Lopes',
    Email: 'tiago@example.com',
    PhoneNumber: null,
    AuthUID: 'local-uuid',
    IsActive: true,
    DeletedAt: null,
    UserRole: [{ Role: { RoleName: 'Professor' } }],
    StudentAccount: null,
  };

  const req = {
    params: { id: '55' },
    body: {
      roles: ['student', 'teacher'],
      studentNumber: 'ST-0123',
      birthDate: '2007-09-08',
      guardianName: 'Pai',
      guardianPhone: '911111111',
    },
  };
  const res = createResponse();

  await updateUserRoles(req, res, (error) => {
    throw error;
  });

  assert.equal(res.statusCode, null);
  assert.deepEqual(mockState.userRoleDeleteWhere, { UserID: 55 });
  assert.equal(mockState.userRoleCreateManyData.length, 2);
  assert.equal(mockState.studentAccountCreateData.UserID, 55);
  assert.equal(mockState.userUpdateData.data.AuthUID, 'ST-0123');
  assert.equal(res.payload.user.roles.includes('student'), true);
});

test('deleteUser performs a soft delete', async () => {
  resetMockState();

  mockState.userById[90] = {
    UserID: 90,
    DeletedAt: null,
  };

  const req = {
    params: { id: '90' },
  };
  const res = createResponse();

  await deleteUser(req, res, (error) => {
    throw error;
  });

  assert.equal(res.statusCode, 204);
  assert.equal(Boolean(mockState.userUpdateData.data.DeletedAt), true);
  assert.equal(mockState.userUpdateData.data.IsActive, false);
});

test('getPostSessionValidations returns the validation queue payload', async () => {
  resetMockState();

  mockState.postSessionValidations = [
    {
      sessionId: 321,
      sessionReference: '#321',
      title: 'Coaching session',
    },
  ];

  const req = {};
  const res = createResponse();

  await getPostSessionValidations(req, res, (error) => {
    throw error;
  });

  assert.deepEqual(res.payload, { sessions: mockState.postSessionValidations });
});

test('finalizeValidation validates the session id and forwards the admin user id', async () => {
  resetMockState();

  const req = {
    params: { id: '321' },
    auth: { userId: 44, role: 'admin' },
  };
  const res = createResponse();

  await finalizeSessionValidation(req, res, (error) => {
    throw error;
  });

  assert.equal(mockState.finalizationArgs.sessionId, 321);
  assert.equal(mockState.finalizationArgs.adminUserId, 44);
  assert.deepEqual(res.payload, {
    sessionId: 901,
    financialEntryId: 777,
    finalPrice: 82.5,
  });
});
