const prisma = require('../config/prisma');

const OUTSIDE_HOURS_MULTIPLIER = 1.5; // BR-18
// TODO BR-18: exact external multiplier not yet documented
const EXTERNAL_MULTIPLIER = 1.0;

async function calculateFinalPrice(sessionId) {
  const session = await prisma.coachingSession.findUnique({
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
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const existing = await tx.financialSummary.findFirst({
    where: { PeriodStart: periodStart, PeriodEnd: periodEnd },
  });
  if (existing) return existing;

  const activeYear = await tx.academicYear.findFirst({
    where: { IsActive: true },
  });
  if (!activeYear) {
    throw new Error('No active academic year found');
  }

  return tx.financialSummary.create({
    data: {
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
  const finalPrice = await calculateFinalPrice(sessionId);

  return prisma.$transaction(async (tx) => {
    const entryType = await tx.financialEntryType.findFirst({
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

async function generateFinancialEntryOnFinalization(sessionId, userId) {
  const finalPrice = await calculateFinalPrice(sessionId);

  return prisma.$transaction(async (tx) => {
    const entryType = await tx.financialEntryType.findFirst({
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

    return entry;
  });
}

module.exports = {
  calculateFinalPrice,
  applyNoShowPenalty,
  generateFinancialEntryOnFinalization,
};
