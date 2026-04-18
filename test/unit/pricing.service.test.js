const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const FAKE_SUMMARY = { FinancialSummaryID: 1 };
const FAKE_YEAR = { AcademicYearID: 1 };
const FAKE_SESSION_TYPE = { EntryTypeID: 2, TypeName: 'SESSION' };
const FAKE_NOSHOWPENALTY_TYPE = { EntryTypeID: 3, TypeName: 'NOSHOWPENALTY' };

function makeSession({ hourlyRate = 36, durationMs = 3_600_000, isOutside = false, isExternal = false } = {}) {
  const start = new Date('2026-04-18T10:00:00Z');
  return {
    SessionID: 10,
    StartTime: start,
    EndTime: new Date(start.getTime() + durationMs),
    IsOutsideStdHours: isOutside,
    IsExternal: isExternal,
    SessionPricingRate: { HourlyRate: hourlyRate },
  };
}

function makeFakePrisma(session, { entryCreateThrows = false, summaryExists = true } = {}) {
  const fakeTx = {
    financialEntryType: {
      findFirst: async ({ where }) => {
        if (where.TypeName === 'SESSION') return FAKE_SESSION_TYPE;
        if (where.TypeName === 'NOSHOWPENALTY') return FAKE_NOSHOWPENALTY_TYPE;
        return null;
      },
    },
    financialSummary: {
      findFirst: async () => (summaryExists ? FAKE_SUMMARY : null),
      create: async ({ data }) => ({ FinancialSummaryID: 99, ...data }),
    },
    academicYear: {
      findFirst: async () => FAKE_YEAR,
    },
    financialEntry: {
      create: async ({ data }) => {
        if (entryCreateThrows) throw new Error('DB failure');
        return { EntryID: 1, ...data };
      },
    },
    coachingSession: {
      update: async () => {},
    },
  };

  return {
    coachingSession: {
      findUnique: async () => session,
    },
    $transaction: async (fn) => fn(fakeTx),
  };
}

function loadService(fakePrisma) {
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '../config/prisma') return fakePrisma;
    return originalLoad.call(this, request, parent, isMain);
  };
  // Clear cache so the module re-evaluates with the new prisma mock
  delete require.cache[require.resolve('../../src/services/pricing.service')];
  try {
    return require('../../src/services/pricing.service');
  } finally {
    Module._load = originalLoad;
  }
}

// --- calculateFinalPrice ---

test('base price: hourlyRate × duration, no flags', async () => {
  const svc = loadService(makeFakePrisma(makeSession({ hourlyRate: 36, durationMs: 3_600_000 })));
  const price = await svc.calculateFinalPrice(10);
  assert.equal(price, 36.00);
});

test('base price: 2-hour session at €36/h = €72', async () => {
  const svc = loadService(makeFakePrisma(makeSession({ hourlyRate: 36, durationMs: 7_200_000 })));
  const price = await svc.calculateFinalPrice(10);
  assert.equal(price, 72.00);
});

test('isOutsideStdHours applies 1.5× multiplier', async () => {
  const svc = loadService(makeFakePrisma(makeSession({ hourlyRate: 36, durationMs: 3_600_000, isOutside: true })));
  const price = await svc.calculateFinalPrice(10);
  assert.equal(price, 54.00);
});

test('isExternal applies EXTERNAL_MULTIPLIER (currently 1.0)', async () => {
  const svc = loadService(makeFakePrisma(makeSession({ hourlyRate: 36, durationMs: 3_600_000, isExternal: true })));
  const price = await svc.calculateFinalPrice(10);
  assert.equal(price, 36.00);
});

test('both flags: price × 1.5 × EXTERNAL_MULTIPLIER', async () => {
  const svc = loadService(makeFakePrisma(makeSession({ hourlyRate: 36, durationMs: 3_600_000, isOutside: true, isExternal: true })));
  const price = await svc.calculateFinalPrice(10);
  assert.equal(price, 54.00);
});

test('throws when session not found', async () => {
  const svc = loadService(makeFakePrisma(null));
  await assert.rejects(() => svc.calculateFinalPrice(999), /not found/);
});

// --- applyNoShowPenalty ---

test('applyNoShowPenalty creates entry with NOSHOWPENALTY type and full price', async () => {
  const svc = loadService(makeFakePrisma(makeSession({ hourlyRate: 36, durationMs: 3_600_000 })));
  const entry = await svc.applyNoShowPenalty(10, 1);
  assert.equal(entry.Amount, 36.00);
  assert.equal(entry.EntryTypeID, FAKE_NOSHOWPENALTY_TYPE.EntryTypeID);
  assert.equal(entry.SessionID, 10);
  assert.equal(entry.IsExported, false);
});

test('applyNoShowPenalty uses existing FinancialSummary when present', async () => {
  const svc = loadService(makeFakePrisma(makeSession(), { summaryExists: true }));
  const entry = await svc.applyNoShowPenalty(10, 1);
  assert.equal(entry.FinancialSummaryID, FAKE_SUMMARY.FinancialSummaryID);
});

test('applyNoShowPenalty creates FinancialSummary when none exists for month', async () => {
  const svc = loadService(makeFakePrisma(makeSession(), { summaryExists: false }));
  const entry = await svc.applyNoShowPenalty(10, 1);
  assert.equal(entry.FinancialSummaryID, 99);
});

// --- generateFinancialEntryOnFinalization ---

test('generateFinancialEntryOnFinalization creates SESSION entry', async () => {
  const svc = loadService(makeFakePrisma(makeSession({ hourlyRate: 36, durationMs: 3_600_000 })));
  const entry = await svc.generateFinancialEntryOnFinalization(10, 1);
  assert.equal(entry.Amount, 36.00);
  assert.equal(entry.EntryTypeID, FAKE_SESSION_TYPE.EntryTypeID);
  assert.equal(entry.SessionID, 10);
  assert.equal(entry.IsExported, false);
});

// --- Transaction rollback propagation ---

test('propagates error when financialEntry.create fails inside transaction', async () => {
  const svc = loadService(makeFakePrisma(makeSession(), { entryCreateThrows: true }));
  await assert.rejects(() => svc.generateFinancialEntryOnFinalization(10, 1), /DB failure/);
});
