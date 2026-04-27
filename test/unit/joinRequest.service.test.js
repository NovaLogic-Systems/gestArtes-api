const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

// ---------------------------------------------------------------------------
// State factory
// ---------------------------------------------------------------------------

function buildState() {
  return {
    // Status rows returned by coachingJoinRequestStatus.findMany
    statusRows: [
      { StatusID: 1, StatusName: 'PendingTeacher' },
      { StatusID: 2, StatusName: 'PendingAdmin' },
      { StatusID: 3, StatusName: 'Approved' },
      { StatusID: 4, StatusName: 'Rejected' },
    ],
    // studentAccount.findUnique result
    studentAccount: {
      StudentAccountID: 55,
      User: { UserID: 10, IsActive: true, DeletedAt: null },
    },
    // coachingSession.findUnique result
    session: {
      SessionID: 20,
      MaxParticipants: 5,
    },
    // How many students are already enrolled
    enrolledCount: 0,
    // sessionStudent.findUnique result (used by both createJoinRequest and adminApprove)
    sessionStudentUnique: null,
    // coachingJoinRequest.findFirst (existing open request)
    existingOpenRequest: null,
    // coachingJoinRequest.findUnique (for teacherApprove / teacherReject)
    joinRequest: null,
    // sessionTeacher.findFirst (teacher owns session)
    teacherOwnsSession: { SessionID: 20 },
    // Created/updated records captured
    createdJoinRequest: null,
    updatedJoinRequest: null,
    // attendance statuses
    attendanceStatuses: [{ AttendanceStatusID: 1, StatusName: 'Pending' }],
    // sessionStudent.create captured
    createdSessionStudent: null,
    // notifications created
    createdNotification: null,
    // userRole rows for admin lookup
    adminUserRoleRows: [],
  };
}

let state = buildState();

// ---------------------------------------------------------------------------
// Fake prisma
// ---------------------------------------------------------------------------

const fakePrisma = {
  $transaction: async (fn) => fn(fakePrisma),

  coachingJoinRequestStatus: {
    findMany: async () => state.statusRows,
    findFirst: async ({ where }) => {
      const found = state.statusRows.find(
        (row) => row.StatusName === where.StatusName
      );
      return found || null;
    },
    create: async ({ data }) => {
      const created = { StatusID: 99, ...data };
      state.statusRows.push(created);
      return created;
    },
  },

  studentAccount: {
    findUnique: async () => state.studentAccount,
  },

  coachingSession: {
    findUnique: async () => state.session,
  },

  sessionStudent: {
    count: async () => state.enrolledCount,
    findUnique: async () => state.sessionStudentUnique,
    create: async ({ data }) => {
      state.createdSessionStudent = data;
      return data;
    },
  },

  coachingJoinRequest: {
    findFirst: async () => state.existingOpenRequest,
    findUnique: async () => state.joinRequest,
    create: async ({ data }) => {
      state.createdJoinRequest = data;
      return {
        JoinRequestID: 300,
        ...data,
        CoachingJoinRequestStatus: { StatusID: data.StatusID, StatusName: 'PendingTeacher' },
        StudentAccount: state.studentAccount
          ? {
              ...state.studentAccount,
              User: state.studentAccount.User,
            }
          : null,
      };
    },
    update: async ({ data }) => {
      state.updatedJoinRequest = data;
      return {
        JoinRequestID: state.joinRequest?.JoinRequestID || 300,
        ...state.joinRequest,
        ...data,
        CoachingJoinRequestStatus: {
          StatusID: data.StatusID,
          StatusName: state.statusRows.find((s) => s.StatusID === data.StatusID)?.StatusName || 'Unknown',
        },
        StudentAccount: {
          ...state.studentAccount,
          User: state.studentAccount?.User,
        },
      };
    },
    findMany: async () => [],
  },

  sessionTeacher: {
    findFirst: async () => state.teacherOwnsSession,
    findMany: async () => [],
  },

  attendanceStatus: {
    findMany: async () => state.attendanceStatuses,
  },

  userRole: {
    findMany: async () => state.adminUserRoleRows,
  },

  notification: {
    create: async ({ data }) => {
      state.createdNotification = data;
      return { NotificationID: 500, ...data };
    },
  },
};

// ---------------------------------------------------------------------------
// Module patching
// ---------------------------------------------------------------------------

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '../config/prisma') return fakePrisma;
  return originalLoad.call(this, request, parent, isMain);
};

let joinRequestService;
try {
  joinRequestService = require('../../src/services/joinRequest.service');
} finally {
  Module._load = originalLoad;
}

function resetState(overrides = {}) {
  state = { ...buildState(), ...overrides };
}

// ---------------------------------------------------------------------------
// createJoinRequest
// ---------------------------------------------------------------------------

test('createJoinRequest: throws 404 when student account does not exist', async () => {
  resetState({ studentAccount: null });

  await assert.rejects(
    () => joinRequestService.createJoinRequest({ sessionId: 20, requesterUserId: 10 }),
    (err) => { assert.equal(err.status, 404); return true; },
  );
});

test('createJoinRequest: throws 409 when session is full', async () => {
  resetState({ enrolledCount: 5 });

  await assert.rejects(
    () => joinRequestService.createJoinRequest({ sessionId: 20, requesterUserId: 10 }),
    (err) => { assert.equal(err.status, 409); assert.match(err.message, /vagas/); return true; },
  );
});

test('createJoinRequest: throws 409 when student is already enrolled', async () => {
  resetState({ sessionStudentUnique: { SessionID: 20 } });

  await assert.rejects(
    () => joinRequestService.createJoinRequest({ sessionId: 20, requesterUserId: 10 }),
    (err) => { assert.equal(err.status, 409); assert.match(err.message, /inscrito/); return true; },
  );
});

test('createJoinRequest: throws 409 when a pending request already exists', async () => {
  resetState({ existingOpenRequest: { JoinRequestID: 1 } });

  await assert.rejects(
    () => joinRequestService.createJoinRequest({ sessionId: 20, requesterUserId: 10 }),
    (err) => { assert.equal(err.status, 409); assert.match(err.message, /pendente/); return true; },
  );
});

test('createJoinRequest: succeeds and returns joinRequest with teacherUserIds', async () => {
  resetState();

  const result = await joinRequestService.createJoinRequest({ sessionId: 20, requesterUserId: 10 });

  assert.ok(result.joinRequest);
  assert.equal(result.joinRequest.joinRequestId, 300);
  assert.ok(Array.isArray(result.teacherUserIds));
  assert.ok(state.createdJoinRequest);
  assert.equal(state.createdJoinRequest.SessionID, 20);
  assert.equal(state.createdJoinRequest.StudentAccountID, 55);
});

// ---------------------------------------------------------------------------
// teacherApprove
// ---------------------------------------------------------------------------

test('teacherApprove: throws 404 when join request does not exist', async () => {
  resetState({ joinRequest: null });

  await assert.rejects(
    () => joinRequestService.teacherApprove({ joinRequestId: 999, teacherUserId: 1 }),
    (err) => { assert.equal(err.status, 404); return true; },
  );
});

test('teacherApprove: throws 409 when request is not in PendingTeacher status', async () => {
  resetState({
    joinRequest: {
      JoinRequestID: 1,
      SessionID: 20,
      StudentAccountID: 55,
      StatusID: 2, // PendingAdmin, not PendingTeacher
      CoachingSession: { SessionID: 20, MaxParticipants: 5 },
      CoachingJoinRequestStatus: { StatusName: 'PendingAdmin' },
      StudentAccount: { User: { UserID: 10 } },
    },
  });

  await assert.rejects(
    () => joinRequestService.teacherApprove({ joinRequestId: 1, teacherUserId: 1 }),
    (err) => { assert.equal(err.status, 409); return true; },
  );
});

test('teacherApprove: throws 403 when teacher does not own the session', async () => {
  resetState({
    joinRequest: {
      JoinRequestID: 1,
      SessionID: 20,
      StudentAccountID: 55,
      StatusID: 1, // PendingTeacher
      CoachingSession: { SessionID: 20, MaxParticipants: 5 },
      CoachingJoinRequestStatus: { StatusName: 'PendingTeacher' },
      StudentAccount: { User: { UserID: 10 } },
    },
    teacherOwnsSession: null,
  });

  await assert.rejects(
    () => joinRequestService.teacherApprove({ joinRequestId: 1, teacherUserId: 99 }),
    (err) => { assert.equal(err.status, 403); return true; },
  );
});

test('teacherApprove: succeeds and moves request to PendingAdmin', async () => {
  resetState({
    joinRequest: {
      JoinRequestID: 1,
      SessionID: 20,
      StudentAccountID: 55,
      StatusID: 1, // PendingTeacher
      CoachingSession: { SessionID: 20, MaxParticipants: 5 },
      CoachingJoinRequestStatus: { StatusName: 'PendingTeacher' },
      StudentAccount: { User: { UserID: 10, FirstName: 'João', LastName: 'Alves', Email: 'j@a.com', IsActive: true, DeletedAt: null } },
    },
  });

  const result = await joinRequestService.teacherApprove({ joinRequestId: 1, teacherUserId: 1 });

  assert.ok(result.joinRequest);
  // Status should have been updated to PendingAdmin (StatusID 2)
  assert.equal(state.updatedJoinRequest.StatusID, 2);
  assert.ok(Array.isArray(result.adminUserIds));
});

// ---------------------------------------------------------------------------
// teacherReject
// ---------------------------------------------------------------------------

test('teacherReject: throws 404 when join request does not exist', async () => {
  resetState({ joinRequest: null });

  await assert.rejects(
    () => joinRequestService.teacherReject({ joinRequestId: 999, teacherUserId: 1 }),
    (err) => { assert.equal(err.status, 404); return true; },
  );
});

test('teacherReject: throws 409 when request is not in PendingTeacher status', async () => {
  resetState({
    joinRequest: {
      JoinRequestID: 1,
      SessionID: 20,
      StudentAccountID: 55,
      StatusID: 2, // PendingAdmin
      CoachingJoinRequestStatus: { StatusName: 'PendingAdmin' },
      StudentAccount: { User: { UserID: 10, IsActive: true, DeletedAt: null } },
    },
    teacherOwnsSession: { SessionID: 20 },
  });

  await assert.rejects(
    () => joinRequestService.teacherReject({ joinRequestId: 1, teacherUserId: 1 }),
    (err) => { assert.equal(err.status, 409); return true; },
  );
});

test('teacherReject: throws 403 when teacher does not own the session', async () => {
  resetState({
    joinRequest: {
      JoinRequestID: 1,
      SessionID: 20,
      StudentAccountID: 55,
      StatusID: 1,
      CoachingJoinRequestStatus: { StatusName: 'PendingTeacher' },
      StudentAccount: { User: { UserID: 10, IsActive: true, DeletedAt: null } },
    },
    teacherOwnsSession: null,
  });

  await assert.rejects(
    () => joinRequestService.teacherReject({ joinRequestId: 1, teacherUserId: 99 }),
    (err) => { assert.equal(err.status, 403); return true; },
  );
});

test('teacherReject: succeeds and moves request to Rejected', async () => {
  resetState({
    joinRequest: {
      JoinRequestID: 1,
      SessionID: 20,
      StudentAccountID: 55,
      StatusID: 1, // PendingTeacher
      CoachingJoinRequestStatus: { StatusName: 'PendingTeacher' },
      StudentAccount: { User: { UserID: 10, FirstName: 'João', LastName: 'Alves', Email: 'j@a.com', IsActive: true, DeletedAt: null } },
    },
    teacherOwnsSession: { SessionID: 20 },
  });

  const result = await joinRequestService.teacherReject({ joinRequestId: 1, teacherUserId: 1 });

  assert.ok(result.joinRequest);
  assert.equal(state.updatedJoinRequest.StatusID, 4); // Rejected
});

// ---------------------------------------------------------------------------
// adminApprove
// ---------------------------------------------------------------------------

test('adminApprove: throws 404 when join request does not exist', async () => {
  resetState({ joinRequest: null });

  await assert.rejects(
    () => joinRequestService.adminApprove({ joinRequestId: 999, adminUserId: 1 }),
    (err) => { assert.equal(err.status, 404); return true; },
  );
});

test('adminApprove: throws 409 when request is not in PendingAdmin status', async () => {
  resetState({
    joinRequest: {
      JoinRequestID: 1,
      SessionID: 20,
      StudentAccountID: 55,
      StatusID: 1, // PendingTeacher
      CoachingSession: { SessionID: 20, MaxParticipants: 5 },
      CoachingJoinRequestStatus: { StatusName: 'PendingTeacher' },
      StudentAccount: { User: { UserID: 10, IsActive: true, DeletedAt: null } },
    },
  });

  await assert.rejects(
    () => joinRequestService.adminApprove({ joinRequestId: 1, adminUserId: 1 }),
    (err) => { assert.equal(err.status, 409); return true; },
  );
});

test('adminApprove: throws 409 when session is already full', async () => {
  resetState({
    joinRequest: {
      JoinRequestID: 1,
      SessionID: 20,
      StudentAccountID: 55,
      StatusID: 2, // PendingAdmin
      CoachingSession: { SessionID: 20, MaxParticipants: 2 },
      CoachingJoinRequestStatus: { StatusName: 'PendingAdmin' },
      StudentAccount: { User: { UserID: 10, IsActive: true, DeletedAt: null } },
    },
    enrolledCount: 2,
  });

  await assert.rejects(
    () => joinRequestService.adminApprove({ joinRequestId: 1, adminUserId: 1 }),
    (err) => { assert.equal(err.status, 409); return true; },
  );
});

test('adminApprove: throws 409 when student is already enrolled', async () => {
  resetState({
    joinRequest: {
      JoinRequestID: 1,
      SessionID: 20,
      StudentAccountID: 55,
      StatusID: 2,
      CoachingSession: { SessionID: 20, MaxParticipants: 5 },
      CoachingJoinRequestStatus: { StatusName: 'PendingAdmin' },
      StudentAccount: { User: { UserID: 10, IsActive: true, DeletedAt: null } },
    },
    sessionStudentUnique: { SessionID: 20 },
  });

  await assert.rejects(
    () => joinRequestService.adminApprove({ joinRequestId: 1, adminUserId: 1 }),
    (err) => { assert.equal(err.status, 409); assert.match(err.message, /inscrito/); return true; },
  );
});

test('adminApprove: succeeds, creates sessionStudent, and updates request to Approved', async () => {
  resetState({
    joinRequest: {
      JoinRequestID: 1,
      SessionID: 20,
      StudentAccountID: 55,
      StatusID: 2, // PendingAdmin
      CoachingSession: { SessionID: 20, MaxParticipants: 5 },
      CoachingJoinRequestStatus: { StatusName: 'PendingAdmin' },
      StudentAccount: { User: { UserID: 10, FirstName: 'João', LastName: 'Alves', Email: 'j@a.com', IsActive: true, DeletedAt: null } },
    },
  });

  const result = await joinRequestService.adminApprove({ joinRequestId: 1, adminUserId: 1 });

  assert.ok(result.joinRequest);
  assert.ok(state.createdSessionStudent, 'should have created a sessionStudent record');
  assert.equal(state.createdSessionStudent.SessionID, 20);
  assert.equal(state.updatedJoinRequest.StatusID, 3); // Approved
});

// ---------------------------------------------------------------------------
// adminReject
// ---------------------------------------------------------------------------

test('adminReject: throws 404 when join request does not exist', async () => {
  resetState({ joinRequest: null });

  await assert.rejects(
    () => joinRequestService.adminReject({ joinRequestId: 999, adminUserId: 1 }),
    (err) => { assert.equal(err.status, 404); return true; },
  );
});

test('adminReject: throws 409 when request is not in PendingAdmin status', async () => {
  resetState({
    joinRequest: {
      JoinRequestID: 1,
      SessionID: 20,
      StudentAccountID: 55,
      StatusID: 1, // PendingTeacher — wrong
      CoachingJoinRequestStatus: { StatusName: 'PendingTeacher' },
      StudentAccount: { User: { UserID: 10, IsActive: true, DeletedAt: null } },
    },
  });

  await assert.rejects(
    () => joinRequestService.adminReject({ joinRequestId: 1, adminUserId: 1 }),
    (err) => { assert.equal(err.status, 409); return true; },
  );
});

test('adminReject: succeeds and moves request to Rejected', async () => {
  resetState({
    joinRequest: {
      JoinRequestID: 1,
      SessionID: 20,
      StudentAccountID: 55,
      StatusID: 2, // PendingAdmin
      CoachingJoinRequestStatus: { StatusName: 'PendingAdmin' },
      StudentAccount: { User: { UserID: 10, FirstName: 'João', LastName: 'Alves', Email: 'j@a.com', IsActive: true, DeletedAt: null } },
    },
  });

  const result = await joinRequestService.adminReject({ joinRequestId: 1, adminUserId: 1 });

  assert.ok(result.joinRequest);
  assert.equal(state.updatedJoinRequest.StatusID, 4); // Rejected
});
