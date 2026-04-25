const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const readline = require('node:readline');
const { createAuditService } = require('../../src/services/audit.service');

function makeEvent(overrides = {}) {
  return {
    category: 'audit',
    level: 'info',
    message: 'audit',
    auditTimestamp: '2026-04-22T10:00:00.000Z',
    userId: 1,
    userName: 'Admin',
    userRole: 'admin',
    action: 'FINANCE_EXPORT',
    module: 'finance',
    targetType: null,
    targetId: null,
    result: 'success',
    detail: 'Exported 3 entries',
    ...overrides,
  };
}

function patchFsWithEvents(t, events) {
  t.mock.method(fs, 'existsSync', () => true);
  t.mock.method(fs, 'createReadStream', () => new EventEmitter());
  t.mock.method(readline, 'createInterface', () => {
    const rl = new EventEmitter();
    setImmediate(() => {
      for (const e of events) rl.emit('line', JSON.stringify(e));
      rl.emit('close');
    });
    return rl;
  });
}

test('listEvents: returns all events when no filters', async (t) => {
  patchFsWithEvents(t, [makeEvent(), makeEvent({ action: 'SESSION_FINALIZED', module: 'coaching' })]);
  const svc = createAuditService();
  const result = await svc.listEvents({});
  assert.equal(result.total, 2);
  assert.equal(result.items.length, 2);
});

test('listEvents: filters by module', async (t) => {
  patchFsWithEvents(t, [makeEvent({ module: 'finance' }), makeEvent({ module: 'coaching' })]);
  const svc = createAuditService();
  const result = await svc.listEvents({ module: 'finance' });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].module, 'finance');
});

test('listEvents: filters by action', async (t) => {
  patchFsWithEvents(t, [makeEvent({ action: 'FINANCE_EXPORT' }), makeEvent({ action: 'SESSION_FINALIZED' })]);
  const svc = createAuditService();
  const result = await svc.listEvents({ action: 'FINANCE_EXPORT' });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].action, 'FINANCE_EXPORT');
});

test('listEvents: filters by periodStart', async (t) => {
  patchFsWithEvents(t, [
    makeEvent({ auditTimestamp: '2026-04-01T00:00:00.000Z' }),
    makeEvent({ auditTimestamp: '2026-04-22T10:00:00.000Z' }),
  ]);
  const svc = createAuditService();
  const result = await svc.listEvents({ periodStart: new Date('2026-04-10T00:00:00Z') });
  assert.equal(result.total, 1);
});

test('listEvents: paginates correctly', async (t) => {
  const events = Array.from({ length: 5 }, (_, i) => makeEvent({ action: `ACTION_${i}` }));
  patchFsWithEvents(t, events);
  const svc = createAuditService();
  const result = await svc.listEvents({ limit: 2, offset: 1 });
  assert.equal(result.total, 5);
  assert.equal(result.items.length, 2);
});

test('listEvents: items contain expected fields', async (t) => {
  patchFsWithEvents(t, [makeEvent()]);
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
  patchFsWithEvents(t, [
    { category: 'audit', action: 'FINANCE_EXPORT', module: 'finance', result: 'success', auditTimestamp: '2026-04-22T10:00:00.000Z', level: 'info', message: 'audit' },
    { category: 'system', action: 'BOOT', module: 'system', result: 'success', auditTimestamp: '2026-04-22T10:00:00.000Z', level: 'info', message: 'boot' },
  ]);
  const svc = createAuditService();
  const result = await svc.listEvents({});
  assert.equal(result.total, 1);
});

test('getSummary: counts by module and result', async (t) => {
  patchFsWithEvents(t, [
    makeEvent({ module: 'finance', result: 'success' }),
    makeEvent({ module: 'finance', result: 'failure' }),
    makeEvent({ module: 'coaching', result: 'success' }),
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
  patchFsWithEvents(t, []);
  const svc = createAuditService();
  const result = await svc.getSummary({});
  assert.equal(result.total, 0);
  assert.equal(result.byResult.success, 0);
  assert.equal(result.byResult.failure, 0);
});

test('getSummary: auditedActionsLast24h counts only recent events', async (t) => {
  const recentTs = new Date(Date.now() - 60_000).toISOString(); // 1 minute ago
  const oldTs = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 48 hours ago
  patchFsWithEvents(t, [
    makeEvent({ auditTimestamp: recentTs }),
    makeEvent({ auditTimestamp: oldTs }),
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

  patchFsWithEvents(t, [
    makeEvent({ auditTimestamp: withinTs }),
    makeEvent({ auditTimestamp: outsideTs }),
  ]);
  const svc = createAuditService();
  const result = await svc.getSummary({ periodEnd });
  assert.equal(result.total, 1);
  assert.equal(result.auditedActionsLast24h, 1);
});
