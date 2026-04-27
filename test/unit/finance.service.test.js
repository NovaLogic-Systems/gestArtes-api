const test = require('node:test');
const assert = require('node:assert/strict');
const { createFinanceService } = require('../../src/services/finance.service');

const FAKE_ENTRY_TYPE = { EntryTypeID: 1, TypeName: 'session_revenue' };
const FAKE_USER = { UserID: 5, FirstName: 'Ana', LastName: 'Silva', AuthUID: 'ST-0001' };
const FAKE_STUDENT_ACCOUNT = { StudentAccountID: 3, User: FAKE_USER };
const FAKE_SESSION_STUDENT = { StudentAccountID: 3, StudentAccount: FAKE_STUDENT_ACCOUNT };

function makeEntry(overrides = {}) {
  return {
    EntryID: 1,
    SessionID: 10,
    Amount: '36.00',
    CreatedAt: new Date('2026-04-01T10:00:00Z'),
    IsExported: false,
    ExportedByUserID: null,
    FinancialEntryType: FAKE_ENTRY_TYPE,
    CoachingSession: {
      SessionStudent: [FAKE_SESSION_STUDENT],
    },
    User: null,
    ...overrides,
  };
}

function makeFakePrisma(opts = {}) {
  const entries = opts.entries ?? [];
  return {
    studentAccount: {
      findFirst: async () => opts.studentAccount ?? null,
    },
    financialEntry: {
      findMany: async () => entries,
      count: async () => opts.entryCount ?? entries.length,
      updateMany: async ({ data }) => {
        if (opts.captureUpdate) opts.captureUpdate(data);
        return { count: entries.length };
      },
    },
    $queryRaw: async () => opts.rawRows ?? [],
    $transaction: async (fn) => {
      const tx = {
        financialEntry: {
          findMany: async () => entries,
          updateMany: async ({ data }) => {
            if (opts.captureUpdate) opts.captureUpdate(data);
            return { count: entries.length };
          },
        },
      };
      return fn(tx);
    },
  };
}

// --- listTransactions ---

test('listTransactions: maps entries to expected shape', async () => {
  const svc = createFinanceService(makeFakePrisma({ entries: [makeEntry()] }));
  const result = await svc.listTransactions({});
  assert.equal(result.items.length, 1);
  const item = result.items[0];
  assert.equal(item.entryId, 1);
  assert.equal(item.sessionId, 10);
  assert.equal(item.amount, 36);
  assert.equal(item.entryType, 'session_revenue');
  assert.equal(item.isExported, false);
  assert.equal(item.studentName, 'Ana Silva');
  assert.equal(item.studentNumber, 'ST-0001');
});

test('listTransactions: returns total and pagination info', async () => {
  const svc = createFinanceService(makeFakePrisma({ entries: [makeEntry()], entryCount: 42 }));
  const result = await svc.listTransactions({ limit: 10, offset: 5 });
  assert.equal(result.total, 42);
  assert.equal(result.limit, 10);
  assert.equal(result.offset, 5);
});

test('listTransactions: handles entry with no session students', async () => {
  const entry = makeEntry({ CoachingSession: { SessionStudent: [] } });
  const svc = createFinanceService(makeFakePrisma({ entries: [entry] }));
  const result = await svc.listTransactions({});
  const item = result.items[0];
  assert.equal(item.studentName, null);
  assert.equal(item.studentNumber, null);
});

test('listTransactions: resolves studentNumber to studentAccountId via DB lookup', async () => {
  const prisma = makeFakePrisma({
    studentAccount: { StudentAccountID: 7 },
    entries: [],
  });
  const svc = createFinanceService(prisma);
  const result = await svc.listTransactions({ studentNumber: 'ST-0001' });
  assert.equal(result.items.length, 0);
});

// --- getSummary ---

test('getSummary: aggregates rows correctly', async () => {
  const rawRows = [
    { typeName: 'session_revenue', cnt: BigInt(3), total: 108.0, exportedCount: BigInt(2), unexportedCount: BigInt(1) },
    { typeName: 'no_show_fee', cnt: BigInt(1), total: 36.0, exportedCount: BigInt(0), unexportedCount: BigInt(1) },
  ];
  const svc = createFinanceService(makeFakePrisma({ rawRows }));
  const result = await svc.getSummary({});
  assert.equal(result.totalEntries, 4);
  assert.equal(result.totalRevenue, 108);
  assert.equal(result.totalPenalties, 36);
  assert.equal(result.exportedCount, 2);
  assert.equal(result.unexportedCount, 2);
  assert.equal(result.totalsByType.session_revenue.count, 3);
  assert.equal(result.totalsByType.session_revenue.total, 108);
  assert.equal(result.totalsByType.no_show_fee.count, 1);
});

test('getSummary: returns zero totals when no data', async () => {
  const svc = createFinanceService(makeFakePrisma({ rawRows: [] }));
  const result = await svc.getSummary({});
  assert.equal(result.totalEntries, 0);
  assert.equal(result.totalRevenue, 0);
  assert.equal(result.totalPenalties, 0);
  assert.deepEqual(result.totalsByType, {});
});

// --- getRevenue ---

test('getRevenue: fills all 12 months, missing months get zeros', async () => {
  const rawRows = [
    { month: BigInt(3), revenue: 36.0, penalties: 0.0, sessionCount: BigInt(1) },
  ];
  const svc = createFinanceService(makeFakePrisma({ rawRows }));
  const result = await svc.getRevenue({ year: 2026 });
  assert.equal(result.months.length, 12);
  assert.equal(result.months[0].revenue, 0);
  assert.equal(result.months[0].sessionCount, 0);
  assert.equal(result.months[2].revenue, 36);
  assert.equal(result.months[2].sessionCount, 1);
  assert.equal(result.months[2].label, 'Mar');
});

test('getRevenue: returns specified year in response', async () => {
  const svc = createFinanceService(makeFakePrisma({ rawRows: [] }));
  const result = await svc.getRevenue({ year: 2025 });
  assert.equal(result.year, 2025);
});

test('getRevenue: defaults to current year when year not provided', async () => {
  const svc = createFinanceService(makeFakePrisma({ rawRows: [] }));
  const result = await svc.getRevenue({});
  assert.equal(result.year, new Date().getFullYear());
});

// --- exportTransactions ---

test('exportTransactions: marks entries as exported and returns CSV', async () => {
  let capturedUpdate;
  const entry = makeEntry();
  const svc = createFinanceService(makeFakePrisma({
    entries: [entry],
    captureUpdate: (data) => { capturedUpdate = data; },
  }));
  const result = await svc.exportTransactions({ periodStart: new Date('2026-04-01'), periodEnd: new Date('2026-04-30'), userId: 99 });
  assert.equal(result.count, 1);
  assert.ok(result.csv.includes('session_revenue'));
  assert.ok(result.csv.includes('Ana Silva'));
  assert.equal(capturedUpdate.IsExported, true);
  assert.equal(capturedUpdate.ExportedByUserID, 99);
});

test('exportTransactions: returns CSV with just headers when no entries match', async () => {
  const svc = createFinanceService(makeFakePrisma({ entries: [] }));
  const result = await svc.exportTransactions({ periodStart: new Date('2026-01-01'), periodEnd: new Date('2026-01-31'), userId: 1 });
  assert.equal(result.count, 0);
  assert.ok(result.csv.includes('Sessão ID'));
});
