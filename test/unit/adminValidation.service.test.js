const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

// ---------------------------------------------------------------------------
// mapQueueRow is tested indirectly via listPostSessionValidations by controlling
// the $queryRaw response. finalizeSessionValidation is tested via the exported
// function with a fully mocked prisma + pricingService.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Fake pricing service (injected via the module cache trick on pricing.service)
// ---------------------------------------------------------------------------

const fakePricingState = {
  entryToReturn: { EntryID: 99, Amount: 36 },
  shouldThrow: false,
};

const fakePricingService = {
  createPricingService: () => ({
    generateFinancialEntryOnFinalization: async () => {
      if (fakePricingState.shouldThrow) throw new Error('pricing failure');
      return fakePricingState.entryToReturn;
    },
  }),
};

// ---------------------------------------------------------------------------
// Fake prisma state
// ---------------------------------------------------------------------------

function buildState() {
  return {
    session: {
      SessionID: 10,
      StartTime: new Date('2026-04-18T10:00:00Z'),
      EndTime: new Date('2026-04-18T11:00:00Z'),
    },
    validations: [],
    validationSteps: [
      { StepID: 1, StepName: 'Management Finalization' },
      { StepID: 2, StepName: 'Teacher Confirmation' },
    ],
    createdValidation: null,
    queryRawRows: [],
  };
}

let state = buildState();

const fakePrisma = {
  $queryRaw: async () => state.queryRawRows,
  $transaction: async (fn, _opts) => fn(fakePrisma),
  coachingSession: {
    findUnique: async ({ where }) => {
      if (!state.session || state.session.SessionID !== where.SessionID) return null;
      return state.session;
    },
  },
  sessionValidation: {
    findMany: async () => state.validations,
    create: async ({ data }) => {
      state.createdValidation = data;
      return data;
    },
  },
  validationStep: {
    findMany: async () => state.validationSteps,
  },
};

// ---------------------------------------------------------------------------
// Module patching
// ---------------------------------------------------------------------------

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '../config/prisma') return fakePrisma;
  if (request === './pricing.service') return fakePricingService;
  return originalLoad.call(this, request, parent, isMain);
};

let adminValidationService;
try {
  adminValidationService = require('../../src/services/adminValidation.service');
} finally {
  Module._load = originalLoad;
}

function resetState(overrides = {}) {
  state = { ...buildState(), ...overrides };
  fakePricingState.shouldThrow = false;
  fakePricingState.entryToReturn = { EntryID: 99, Amount: 36 };
}

// ---------------------------------------------------------------------------
// listPostSessionValidations
// ---------------------------------------------------------------------------

test('listPostSessionValidations: returns empty array when query returns no rows', async () => {
  resetState();
  state.queryRawRows = [];

  const result = await adminValidationService.listPostSessionValidations();
  assert.deepEqual(result, []);
});

test('listPostSessionValidations: maps raw rows to expected shape', async () => {
  resetState();
  state.queryRawRows = [
    {
      sessionId: 5,
      startTime: new Date('2026-04-18T10:00:00Z'),
      endTime: new Date('2026-04-18T11:00:00Z'),
      isExternal: 0,
      isOutsideStdHours: 1,
      finalPrice: 54,
      hourlyRate: 36,
      teacherName: 'Maria Costa',
      studentName: 'João Alves',
      teacherConfirmed: 1,
      studentConfirmed: 1,
      confirmationCount: 2,
    },
  ];

  const result = await adminValidationService.listPostSessionValidations();
  assert.equal(result.length, 1);
  const item = result[0];
  assert.equal(item.sessionId, 5);
  assert.equal(item.sessionReference, '#5');
  assert.equal(item.teacherName, 'Maria Costa');
  assert.equal(item.studentName, 'João Alves');
  assert.equal(item.hourlyRate, 36);
  assert.equal(item.isOutsideStdHours, true);
  assert.equal(item.isExternal, false);
  assert.equal(item.confirmationCount, 2);
  assert.equal(item.teacherConfirmed, true);
  assert.equal(item.studentConfirmed, true);
});

test('listPostSessionValidations: falls back to em dash when teacherName is blank', async () => {
  resetState();
  state.queryRawRows = [
    {
      sessionId: 7,
      startTime: new Date(),
      endTime: new Date(),
      isExternal: 0,
      isOutsideStdHours: 0,
      finalPrice: null,
      hourlyRate: 0,
      teacherName: '',
      studentName: '',
      teacherConfirmed: 1,
      studentConfirmed: 1,
      confirmationCount: 2,
    },
  ];

  const result = await adminValidationService.listPostSessionValidations();
  assert.equal(result[0].teacherName, '—');
  assert.equal(result[0].studentName, '—');
});

// ---------------------------------------------------------------------------
// finalizeSessionValidation
// ---------------------------------------------------------------------------

test('finalizeSessionValidation: throws 404 when session does not exist', async () => {
  resetState();
  state.session = null;

  await assert.rejects(
    () => adminValidationService.finalizeSessionValidation(999, 1),
    (err) => {
      assert.equal(err.status, 404);
      return true;
    },
  );
});

test('finalizeSessionValidation: throws 409 when session has no teacher confirmation', async () => {
  resetState();
  // validations only from student — no teacher role
  state.validations = [
    {
      ValidatedByUserID: 20,
      ValidationStep: { StepName: 'Student Confirmation' },
      User: { UserRole: [{ Role: { RoleName: 'student' } }] },
    },
  ];

  await assert.rejects(
    () => adminValidationService.finalizeSessionValidation(10, 1),
    (err) => {
      assert.equal(err.status, 409);
      assert.match(err.message, /pronta/);
      return true;
    },
  );
});

test('finalizeSessionValidation: throws 409 when session has no student confirmation', async () => {
  resetState();
  state.validations = [
    {
      ValidatedByUserID: 10,
      ValidationStep: { StepName: 'Teacher Confirmation' },
      User: { UserRole: [{ Role: { RoleName: 'teacher' } }] },
    },
  ];

  await assert.rejects(
    () => adminValidationService.finalizeSessionValidation(10, 1),
    (err) => {
      assert.equal(err.status, 409);
      return true;
    },
  );
});

test('finalizeSessionValidation: throws 409 when session is already finalized', async () => {
  resetState();
  state.validations = [
    {
      ValidatedByUserID: 10,
      ValidationStep: { StepName: 'Teacher Confirmation' },
      User: { UserRole: [{ Role: { RoleName: 'teacher' } }] },
    },
    {
      ValidatedByUserID: 20,
      ValidationStep: { StepName: 'Student Confirmation' },
      User: { UserRole: [{ Role: { RoleName: 'student' } }] },
    },
    {
      ValidatedByUserID: 1,
      ValidationStep: { StepName: 'Management Finalization' },
      User: { UserRole: [{ Role: { RoleName: 'admin' } }] },
    },
  ];

  await assert.rejects(
    () => adminValidationService.finalizeSessionValidation(10, 1),
    (err) => {
      assert.equal(err.status, 409);
      assert.match(err.message, /finalizada/);
      return true;
    },
  );
});

test('finalizeSessionValidation: throws 500 when finalization step is not configured', async () => {
  resetState();
  state.validations = [
    {
      ValidatedByUserID: 10,
      ValidationStep: { StepName: 'Teacher Confirmation' },
      User: { UserRole: [{ Role: { RoleName: 'teacher' } }] },
    },
    {
      ValidatedByUserID: 20,
      ValidationStep: { StepName: 'Student Confirmation' },
      User: { UserRole: [{ Role: { RoleName: 'student' } }] },
    },
  ];
  // Remove the finalization step so the lookup fails
  state.validationSteps = [{ StepID: 2, StepName: 'Teacher Confirmation' }];

  await assert.rejects(
    () => adminValidationService.finalizeSessionValidation(10, 1),
    (err) => {
      assert.equal(err.status, 500);
      return true;
    },
  );
});

test('finalizeSessionValidation: succeeds and returns session + financialEntry', async () => {
  resetState();
  state.validations = [
    {
      ValidatedByUserID: 10,
      ValidationStep: { StepName: 'Teacher Confirmation' },
      User: { UserRole: [{ Role: { RoleName: 'teacher' } }] },
    },
    {
      ValidatedByUserID: 20,
      ValidationStep: { StepName: 'Student Confirmation' },
      User: { UserRole: [{ Role: { RoleName: 'student' } }] },
    },
  ];

  const result = await adminValidationService.finalizeSessionValidation(10, 1);

  assert.ok(result.session);
  assert.equal(result.session.SessionID, 10);
  assert.ok(result.financialEntry);
  assert.equal(result.financialEntry.EntryID, 99);
  // the finalization validation record should have been created
  assert.ok(state.createdValidation);
  assert.equal(state.createdValidation.SessionID, 10);
  assert.equal(state.createdValidation.ValidatedByUserID, 1);
  assert.equal(state.createdValidation.ValidationStepID, 1); // Management Finalization StepID
});
