const test = require('node:test');
const assert = require('node:assert/strict');

const { createAdminSessionUseCases } = require('../../src/application/use-cases/admin-sessions');

function buildSession(statusName = 'Pending_Approval') {
  return {
    SessionID: 44,
    SessionStatus: { StatusName: statusName },
    SessionTeacher: [{ User: { UserID: 12 } }],
    SessionStudent: [{ StudentAccount: { User: { UserID: 20 } } }],
  };
}

function buildPrisma({ sessionStatusName = 'Pending_Approval', statusRows = [] } = {}) {
  const state = {
    session: buildSession(sessionStatusName),
    statusRows: statusRows.length
      ? statusRows
      : [
          { StatusID: 1, StatusName: 'Pending_Approval' },
          { StatusID: 2, StatusName: 'Scheduled' },
          { StatusID: 3, StatusName: 'Cancelled_Rejected' },
        ],
    update: null,
  };

  const prisma = {
    $transaction: async (fn) => fn(prisma),
    coachingSession: {
      findUnique: async () => state.session,
      update: async ({ where, data }) => {
        state.update = { where, data };
        return { ...state.session, ...data };
      },
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
  };

  return { prisma, state };
}

test('approveSession moves Pending_Approval sessions to Scheduled', async () => {
  const { prisma, state } = buildPrisma();
  const useCases = createAdminSessionUseCases({ prisma });

  const result = await useCases.approveSession.execute({
    adminUserId: 7,
    payload: { sessionId: 44 },
  });

  assert.equal(result.statusId, 2);
  assert.equal(state.update.data.StatusID, 2);
  assert.equal(state.update.data.ReviewedByUserID, 7);
  assert.ok(state.update.data.ReviewedAt instanceof Date);
  assert.deepEqual(result.userIdsToNotify, [12, 20]);
});

test('approveSession does not treat completion-confirmation pending as management approval', async () => {
  const { prisma } = buildPrisma({ sessionStatusName: 'Completion_Confirmation_Pending' });
  const useCases = createAdminSessionUseCases({ prisma });

  await assert.rejects(
    () => useCases.approveSession.execute({ adminUserId: 7, payload: { sessionId: 44 } }),
    (error) => {
      assert.equal(error.status, 409);
      assert.match(error.message, /management approval/i);
      return true;
    },
  );
});

test('rejectSession moves Pending_Approval sessions to Cancelled_Rejected', async () => {
  const { prisma, state } = buildPrisma();
  const useCases = createAdminSessionUseCases({ prisma });

  const result = await useCases.rejectSession.execute({
    adminUserId: 7,
    payload: { sessionId: 44, reviewNotes: 'Sem sala disponivel' },
  });

  assert.equal(result.sessionId, 44);
  assert.equal(state.update.data.StatusID, 3);
  assert.equal(state.update.data.ReviewedByUserID, 7);
  assert.equal(state.update.data.ReviewNotes, 'Sem sala disponivel');
  assert.deepEqual(result.userIdsToNotify, [12, 20]);
});
