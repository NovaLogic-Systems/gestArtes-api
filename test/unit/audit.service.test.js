/**
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const state = {
  rows: [],
};

const fakePrisma = {
  auditLog: {
    findMany: async ({ where } = {}) => {
      const rows = state.rows.filter((row) => {
        if (where?.Module && row.Module !== where.Module) return false;
        if (where?.Action && row.Action !== where.Action) return false;
        if (where?.UserID !== undefined && row.UserID !== where.UserID) return false;
        if (where?.Result && row.Result !== where.Result) return false;

        const timestamp = new Date(row.AuditTimestamp);
        if (where?.AuditTimestamp?.gte && timestamp < new Date(where.AuditTimestamp.gte)) return false;
        if (where?.AuditTimestamp?.lte && timestamp > new Date(where.AuditTimestamp.lte)) return false;

        return true;
      });

      return rows;
    },
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '../config/prisma') {
    return fakePrisma;
  }
  return originalLoad.apply(this, arguments);
};

const { createAuditService } = require('../../src/services/audit.service');

function resetState(rows = []) {
  state.rows = rows;
}

function makeEvent(overrides = {}) {
  return {
    AuditLogID: 1,
    AuditTimestamp: '2026-04-22T10:00:00.000Z',
    UserID: 1,
    UserName: 'Admin',
    UserRole: 'admin',
    Action: 'FINANCE_EXPORT',
    Module: 'finance',
    TargetType: null,
    TargetID: null,
    Result: 'success',
    Detail: 'Exported 3 entries',
    ...overrides,
  };
}

test('listEvents: returns all events when no filters', async (t) => {
  resetState([makeEvent(), makeEvent({ Action: 'SESSION_FINALIZED', Module: 'coaching' })]);
  const svc = createAuditService();
  const result = await svc.listEvents({});
  assert.equal(result.total, 2);
  assert.equal(result.items.length, 2);
});

test('listEvents: filters by module', async (t) => {
  resetState([makeEvent({ Module: 'finance' }), makeEvent({ Module: 'coaching' })]);
  const svc = createAuditService();
  const result = await svc.listEvents({ module: 'finance' });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].module, 'finance');
});

test('listEvents: filters by action', async (t) => {
  resetState([makeEvent({ Action: 'FINANCE_EXPORT' }), makeEvent({ Action: 'SESSION_FINALIZED' })]);
  const svc = createAuditService();
  const result = await svc.listEvents({ action: 'FINANCE_EXPORT' });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].action, 'FINANCE_EXPORT');
});

test('listEvents: filters by periodStart', async (t) => {
  resetState([
    makeEvent({ AuditTimestamp: '2026-04-01T00:00:00.000Z' }),
    makeEvent({ AuditTimestamp: '2026-04-22T10:00:00.000Z' }),
  ]);
  const svc = createAuditService();
  const result = await svc.listEvents({ periodStart: new Date('2026-04-10T00:00:00Z') });
  assert.equal(result.total, 1);
});

test('listEvents: paginates correctly', async (t) => {
  const events = Array.from({ length: 5 }, (_, i) => makeEvent({ Action: `ACTION_${i}` }));
  resetState(events);
  const svc = createAuditService();
  const result = await svc.listEvents({ limit: 2, offset: 1 });
  assert.equal(result.total, 5);
  assert.equal(result.items.length, 2);
});

test('listEvents: items contain expected fields', async (t) => {
  resetState([makeEvent()]);
  const svc = createAuditService();
  const result = await svc.listEvents({});
  const item = result.items[0];
  assert.ok('timestamp' in item);
  assert.ok('userId' in item);
  assert.ok('action' in item);
  assert.ok('module' in item);
  assert.ok('result' in item);
});

test('listEvents: skips non-audit log lines', async (t) => {
  resetState([
    makeEvent({ Action: 'FINANCE_EXPORT', Module: 'finance' }),
    makeEvent({ AuditLogID: 2, Action: 'BOOT', Module: 'system', Result: 'success' }),
  ]);
  const svc = createAuditService();
  const result = await svc.listEvents({ module: 'finance' });
  assert.equal(result.total, 1);
});

test('getSummary: counts by module and result', async (t) => {
  resetState([
    makeEvent({ Module: 'finance', Result: 'success' }),
    makeEvent({ Module: 'finance', Result: 'failure' }),
    makeEvent({ Module: 'coaching', Result: 'success' }),
  ]);
  const svc = createAuditService();
  const result = await svc.getSummary({});
  assert.equal(result.total, 3);
  assert.equal(result.byModule.finance, 2);
  assert.equal(result.byModule.coaching, 1);
  assert.equal(result.byResult.success, 2);
  assert.equal(result.byResult.failure, 1);
});

test('getSummary: returns zero counts when no events', async (t) => {
  resetState([]);
  const svc = createAuditService();
  const result = await svc.getSummary({});
  assert.equal(result.total, 0);
  assert.equal(result.byResult.success, 0);
  assert.equal(result.byResult.failure, 0);
});

test('getSummary: auditedActionsLast24h counts only recent events', async (t) => {
  const recentTs = new Date(Date.now() - 60_000).toISOString(); // 1 minute ago
  const oldTs = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 48 hours ago
  resetState([
    makeEvent({ AuditTimestamp: recentTs }),
    makeEvent({ AuditTimestamp: oldTs }),
  ]);
  const svc = createAuditService();
  const result = await svc.getSummary({});
  assert.equal(result.auditedActionsLast24h, 1);
});

test('getSummary: auditedActionsLast24h is consistent with period filter', async (t) => {
  // Two events both within last 24h, but one is outside the supplied periodEnd.
  // After the fix, auditedActionsLast24h must exclude the out-of-period event.
  const withinTs = new Date(Date.now() - 60_000).toISOString();       // 1 min ago
  const outsideTs = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 min ago

  const periodEnd = new Date(Date.now() - 15 * 60 * 1000); // 15 min ago (cuts out 30-min event)

  resetState([
    makeEvent({ AuditTimestamp: withinTs }),
    makeEvent({ AuditTimestamp: outsideTs }),
  ]);
  const svc = createAuditService();
  const result = await svc.getSummary({ periodEnd });
  assert.equal(result.total, 1);
  assert.equal(result.auditedActionsLast24h, 1);
});
