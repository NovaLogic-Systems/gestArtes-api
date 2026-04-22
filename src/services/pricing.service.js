const { logAudit, AUDIT_ACTIONS, AUDIT_MODULES, AUDIT_RESULTS } = require('../utils/audit');

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

      const entry = await tx.financialEntry.create({
        data: {
          SessionID: sessionId,
          Amount: finalPrice,
          EntryTypeID: entryType.EntryTypeID,
          FinancialSummaryID: summary.FinancialSummaryID,
          CreatedAt: new Date(),
          IsExported: false,
        },
      });

      logAudit({
        userId,
        action: AUDIT_ACTIONS.NOSHOW_PENALTY_APPLIED,
        module: AUDIT_MODULES.FINANCE,
        targetType: 'FinancialEntry',
        targetId: entry.EntryID,
        result: AUDIT_RESULTS.SUCCESS,
        detail: `Penalty ${finalPrice}€ for session ${sessionId}`,
      });

      return entry;
    });
  }

  async function generateFinancialEntryOnFinalization(sessionId, userId) {
    return prismaClient.$transaction(async (tx) => {
      const finalPrice = await calculateFinalPrice(sessionId, tx);

      const entryType = await tx.financialEntryType.findUnique({
        where: { TypeName: 'SESSION' },
      });
      if (!entryType) throw new Error("FinancialEntryType 'SESSION' not found");

      const summary = await _findOrCreateMonthSummary(tx, userId);

      const entry = await tx.financialEntry.create({
        data: {
          SessionID: sessionId,
          Amount: finalPrice,
          EntryTypeID: entryType.EntryTypeID,
          FinancialSummaryID: summary.FinancialSummaryID,
          CreatedAt: new Date(),
          IsExported: false,
        },
      });

      await tx.coachingSession.update({
        where: { SessionID: sessionId },
        data: { FinalPrice: finalPrice },
      });

      logAudit({
        userId,
        action: AUDIT_ACTIONS.SESSION_FINALIZED,
        module: AUDIT_MODULES.FINANCE,
        targetType: 'FinancialEntry',
        targetId: entry.EntryID,
        result: AUDIT_RESULTS.SUCCESS,
        detail: `Session ${sessionId} finalized at ${finalPrice}€`,
      });

      return entry;
    });
  }

  return { calculateFinalPrice, applyNoShowPenalty, generateFinancialEntryOnFinalization };
}

module.exports = { createPricingService };
