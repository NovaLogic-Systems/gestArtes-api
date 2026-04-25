const OUTSIDE_HOURS_MULTIPLIER = 1.5; // BR-18
// TODO BR-18: exact external multiplier not yet documented
const EXTERNAL_MULTIPLIER = 1.0;

function createPricingService(prismaClient) {
  async function calculateFinalPrice(sessionId, client = prismaClient) {
    const session = await client.coachingSession.findUnique({
      where: { SessionID: sessionId },
      include: { SessionPricingRate: true },
    });

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const durationHours = (session.EndTime - session.StartTime) / 3_600_000;
    let price = Number(session.SessionPricingRate.HourlyRate) * durationHours;

    if (session.IsOutsideStdHours) {
      price *= OUTSIDE_HOURS_MULTIPLIER;
    }
    if (session.IsExternal) {
      price *= EXTERNAL_MULTIPLIER;
    }

    return Number(price.toFixed(2));
  }

  async function _findOrCreateMonthSummary(tx, userId) {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const periodStart = new Date(Date.UTC(year, month, 1));
    const periodEnd = new Date(Date.UTC(year, month + 1, 0));

    const activeYear = await tx.academicYear.findFirst({
      where: { IsActive: true },
    });
    if (!activeYear) {
      throw new Error('No active academic year found');
    }

    return tx.financialSummary.upsert({
      where: { PeriodStart_PeriodEnd: { PeriodStart: periodStart, PeriodEnd: periodEnd } },
      update: {},
      create: {
        PeriodStart: periodStart,
        PeriodEnd: periodEnd,
        GeneratedAt: now,
        TotalAmount: 0,
        GeneratedByUserID: userId,
        IsExported: false,
        AcademicYearID: activeYear.AcademicYearID,
      },
    });
  }

  async function applyNoShowPenalty(sessionId, userId) {
    return prismaClient.$transaction(async (tx) => {
      const finalPrice = await calculateFinalPrice(sessionId, tx);

      const entryType = await tx.financialEntryType.findUnique({
        where: { TypeName: 'NOSHOWPENALTY' },
      });
      if (!entryType) throw new Error("FinancialEntryType 'NOSHOWPENALTY' not found");

      const summary = await _findOrCreateMonthSummary(tx, userId);

      return tx.financialEntry.create({
        data: {
          SessionID: sessionId,
          Amount: finalPrice,
          EntryTypeID: entryType.EntryTypeID,
          FinancialSummaryID: summary.FinancialSummaryID,
          CreatedAt: new Date(),
          IsExported: false,
        },
      });
    });
  }

  async function generateFinancialEntryOnFinalization(sessionId, userId, client = prismaClient) {
    const run = async (db) => {
      const finalPrice = await calculateFinalPrice(sessionId, db);

      const entryType = await db.financialEntryType.findUnique({
        where: { TypeName: 'SESSION' },
      });
      if (!entryType) throw new Error("FinancialEntryType 'SESSION' not found");

      const summary = await _findOrCreateMonthSummary(db, userId);

      const entry = await db.financialEntry.create({
        data: {
          SessionID: sessionId,
          Amount: finalPrice,
          EntryTypeID: entryType.EntryTypeID,
          FinancialSummaryID: summary.FinancialSummaryID,
          CreatedAt: new Date(),
          IsExported: false,
        },
      });

      await db.coachingSession.update({
        where: { SessionID: sessionId },
        data: { FinalPrice: finalPrice },
      });

      return entry;
    };

    if (client === prismaClient) {
      return prismaClient.$transaction((tx) => run(tx));
    }

    return run(client);
  }

  return { calculateFinalPrice, applyNoShowPenalty, generateFinancialEntryOnFinalization };
}

module.exports = { createPricingService };
