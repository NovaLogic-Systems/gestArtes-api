jest.mock('../../src/utils/audit', () => ({
  AUDIT_ACTIONS: {
    NOSHOW_PENALTY_APPLIED: 'NOSHOW_PENALTY_APPLIED',
    SESSION_FINALIZED: 'SESSION_FINALIZED',
  },
  AUDIT_MODULES: {
    FINANCE: 'FINANCE',
  },
  AUDIT_RESULTS: {
    SUCCESS: 'SUCCESS',
  },
  logAudit: jest.fn(),
}));

const { createPricingService } = require('../../src/services/pricing.service');
const { buildPricingSession } = require('./fixtures/pricing.fixtures');

function createPricingContext(session) {
  const tx = {
    academicYear: {
      findFirst: jest.fn(async () => ({ AcademicYearID: 1 })),
    },
    financialSummary: {
      upsert: jest.fn(async () => ({ FinancialSummaryID: 77 })),
    },
    financialEntryType: {
      findUnique: jest.fn(async ({ where }) => {
        if (where?.TypeName === 'no_show_fee') {
          return { EntryTypeID: 3, TypeName: 'no_show_fee' };
        }

        if (where?.TypeName === 'session_revenue') {
          return { EntryTypeID: 2, TypeName: 'session_revenue' };
        }

        return null;
      }),
    },
    financialEntry: {
      create: jest.fn(async ({ data }) => ({
        EntryID: 999,
        ...data,
      })),
    },
    coachingSession: {
      findUnique: jest.fn(async () => session),
      update: jest.fn(async () => ({})),
    },
  };

  const prismaMock = {
    coachingSession: {
      findUnique: jest.fn(async () => session),
    },
    $transaction: jest.fn(async (callback) => callback(tx)),
  };

  const pricingService = createPricingService(prismaMock);

  return {
    pricingService,
    prismaMock,
    tx,
  };
}

describe('Pricing Service (Jest)', () => {
  test('base rule: 36€/hour for a 1h session', async () => {
    const session = buildPricingSession({ hourlyRate: 36, durationHours: 1 });
    const { pricingService } = createPricingContext(session);

    const finalPrice = await pricingService.calculateFinalPrice(session.SessionID);

    expect(finalPrice).toBe(36);
  });

  test('outside standard hours applies the configured multiplier', async () => {
    const session = buildPricingSession({
      hourlyRate: 36,
      durationHours: 1,
      isOutsideStdHours: true,
    });
    const { pricingService } = createPricingContext(session);

    const finalPrice = await pricingService.calculateFinalPrice(session.SessionID);

    expect(finalPrice).toBe(54);
  });

  test('external flag follows current multiplier rule', async () => {
    const session = buildPricingSession({
      hourlyRate: 36,
      durationHours: 1,
      isExternal: true,
    });
    const { pricingService } = createPricingContext(session);

    const finalPrice = await pricingService.calculateFinalPrice(session.SessionID);

    expect(finalPrice).toBe(36);
  });

  test('outside-hours + external together still compute a deterministic final price', async () => {
    const session = buildPricingSession({
      hourlyRate: 36,
      durationHours: 2,
      isOutsideStdHours: true,
      isExternal: true,
    });
    const { pricingService } = createPricingContext(session);

    const finalPrice = await pricingService.calculateFinalPrice(session.SessionID);

    expect(finalPrice).toBe(108);
  });

  test('throws when session does not exist', async () => {
    const { pricingService } = createPricingContext(null);

    await expect(pricingService.calculateFinalPrice(404)).rejects.toThrow('Session 404 not found');
  });

  test('applyNoShowPenalty creates a financial entry with the no-show type', async () => {
    const session = buildPricingSession({ sessionId: 21, hourlyRate: 36, durationHours: 1 });
    const { pricingService, tx } = createPricingContext(session);

    const entry = await pricingService.applyNoShowPenalty(21, 900);

    expect(entry.SessionID).toBe(21);
    expect(entry.EntryTypeID).toBe(3);
    expect(entry.Amount).toBe(36);
    expect(tx.financialEntry.create).toHaveBeenCalledTimes(1);
  });

  test('generateFinancialEntryOnFinalization writes final price on session and financial entry', async () => {
    const session = buildPricingSession({
      sessionId: 22,
      hourlyRate: 40,
      durationHours: 1.5,
      isOutsideStdHours: true,
    });
    const { pricingService, tx } = createPricingContext(session);

    const entry = await pricingService.generateFinancialEntryOnFinalization(22, 901);

    expect(entry.SessionID).toBe(22);
    expect(entry.EntryTypeID).toBe(2);
    expect(entry.Amount).toBe(90);
    expect(tx.coachingSession.update).toHaveBeenCalledWith({
      where: { SessionID: 22 },
      data: { FinalPrice: 90 },
    });
  });
});
