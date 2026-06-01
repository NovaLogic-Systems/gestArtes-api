const test = require('node:test');
const assert = require('node:assert/strict');
const { withPatchedModules } = require('./helpers/moduleLoader');

const pricingState = {
  clientReceived: null,
  shouldThrow: false,
};

const fakePricingService = {
  createPricingService: () => ({
    generateFinancialEntryOnFinalization: async (_sessionId, _adminUserId, client) => {
      pricingState.clientReceived = client;
      if (pricingState.shouldThrow) {
        throw new Error('pricing failed');
      }
      return { EntryID: 808 };
    },
  }),
};

function buildState() {
  return {
    session: { SessionID: 10 },
    validations: [],
    validationSteps: [
      { StepID: 1, StepName: 'AdminFinalValidation' },
      { StepID: 2, StepName: 'TeacherConfirmation' },
      { StepID: 3, StepName: 'StudentConfirmation' },
    ],
    createdValidationStep: null,
    statusRows: [{ StatusID: 9, StatusName: 'Finalized' }],
    existingFinancialEntry: null,
    createdValidation: null,
    sessionUpdate: null,
    queryRows: [],
  };
}

let state = buildState();

const fakePrisma = {
  $queryRaw: async () => state.queryRows,
  $transaction: async (fn) => fn(fakePrisma),
  coachingSession: {
    findUnique: async ({ where }) => {
      if (!state.session || state.session.SessionID !== where.SessionID) {
        return null;
      }
      return state.session;
    },
    update: async ({ where, data }) => {
      state.sessionUpdate = { where, data };
      return { ...state.session, ...data };
    },
  },
  financialEntry: {
    findFirst: async () => state.existingFinancialEntry,
  },
  sessionStatus: {
    findMany: async () => state.statusRows,
    create: async ({ data }) => {
      const created = {
        StatusID: state.statusRows.length + 1,
        StatusName: data.StatusName,
      };
      state.statusRows.push(created);
      return created;
    },
  },
  sessionValidation: {
    findMany: async () => state.validations,
    create: async ({ data }) => {
      state.createdValidation = data;
      return { ValidationID: 77 };
    },
  },
  validationStep: {
    findMany: async () => state.validationSteps,
    create: async ({ data }) => {
      const created = {
        StepID: state.validationSteps.length + 1,
        StepName: data.StepName,
      };
      state.validationSteps.push(created);
      state.createdValidationStep = created;
      return created;
    },
  },
};

const adminService = withPatchedModules(
  {
    '../config/prisma': fakePrisma,
    './pricing.service': fakePricingService,
  },
  () => require('../../src/services/admin.service')
);

function resetState(overrides = {}) {
  state = { ...buildState(), ...overrides };
  pricingState.clientReceived = null;
  pricingState.shouldThrow = false;
}

function validation({ roleName, stepName, userId = 50 }) {
  return {
    ValidatedByUserID: userId,
    ValidationStep: { StepName: stepName },
    User: { UserRole: [{ Role: { RoleName: roleName } }] },
  };
}

test('finalizeSessionValidation accepts one actor confirmation plus admin final validation', async () => {
  resetState({
    validations: [
      validation({ roleName: 'teacher', stepName: 'TeacherConfirmation', userId: 12 }),
    ],
  });

  const result = await adminService.finalizeSessionValidation({
    sessionId: 10,
    adminUserId: 1,
  });

  assert.equal(result.sessionId, 10);
  assert.equal(result.validationId, 77);
  assert.equal(result.financialEntryId, 808);
  assert.equal(state.createdValidation.ValidationStepID, 1);
  assert.equal(state.createdValidation.ValidatedByUserID, 1);
  assert.equal(state.sessionUpdate.data.StatusID, 9);
  assert.equal(pricingState.clientReceived, fakePrisma);
});

test('finalizeSessionValidation creates the admin final step when it is missing', async () => {
  resetState({
    validationSteps: [],
    validations: [
      validation({ roleName: 'student', stepName: 'StudentConfirmation', userId: 20 }),
      validation({ roleName: 'teacher', stepName: 'TeacherConfirmation', userId: 12 }),
    ],
  });

  const result = await adminService.finalizeSessionValidation({
    sessionId: 10,
    adminUserId: 1,
  });

  assert.equal(result.sessionId, 10);
  assert.equal(state.createdValidationStep.StepName, 'AdminFinalValidation');
  assert.equal(state.createdValidation.ValidationStepID, state.createdValidationStep.StepID);
  assert.equal(state.validationSteps.length, 1);
});

test('finalizeSessionValidation does not treat unrelated teacher validations as completion confirmation', async () => {
  resetState({
    validations: [
      validation({ roleName: 'teacher', stepName: 'NoShowRecorded', userId: 12 }),
    ],
  });

  await assert.rejects(
    () => adminService.finalizeSessionValidation({ sessionId: 10, adminUserId: 1 }),
    (error) => {
      assert.equal(error.status, 409);
      assert.match(error.message, /pronta/);
      return true;
    },
  );
});

test('finalizeSessionValidation rejects sessions already finalized by admin', async () => {
  resetState({
    validations: [
      validation({ roleName: 'student', stepName: 'StudentConfirmation', userId: 20 }),
      validation({ roleName: 'admin', stepName: 'AdminFinalValidation', userId: 1 }),
    ],
  });

  await assert.rejects(
    () => adminService.finalizeSessionValidation({ sessionId: 10, adminUserId: 1 }),
    (error) => {
      assert.equal(error.status, 409);
      assert.match(error.message, /administra/);
      return true;
    },
  );
});
