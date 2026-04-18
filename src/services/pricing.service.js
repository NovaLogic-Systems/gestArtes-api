const prisma = require('../config/prisma');

const OUTSIDE_STD_HOURS_MULTIPLIER = 1.5;
const EXTERNAL_MULTIPLIER = 1.25;

function calculateAmount(session, hourlyRate) {
  const durationHours =
    (new Date(session.EndTime) - new Date(session.StartTime)) / (1000 * 60 * 60);

  let rate = Number(hourlyRate);
  if (session.IsOutsideStdHours) rate *= OUTSIDE_STD_HOURS_MULTIPLIER;
  if (session.IsExternal) rate *= EXTERNAL_MULTIPLIER;

  return parseFloat((durationHours * rate).toFixed(2));
}

async function getEntryTypeId(typeName) {
  const type = await prisma.financialEntryType.findFirst({
    where: { TypeName: typeName },
  });
  if (!type) throw new Error(`FinancialEntryType '${typeName}' not found`);
  return type.EntryTypeID;
}

async function computeAndSaveSessionPrice(sessionId, financialSummaryId) {
  const session = await prisma.coachingSession.findUnique({
    where: { SessionID: sessionId },
    include: { SessionPricingRate: true },
  });
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const amount = calculateAmount(session, session.SessionPricingRate.HourlyRate);
  const entryTypeId = await getEntryTypeId('SESSION');

  return prisma.$transaction(async (tx) => {
    const entry = await tx.financialEntry.create({
      data: {
        SessionID: sessionId,
        Amount: amount,
        EntryTypeID: entryTypeId,
        CreatedAt: new Date(),
        IsExported: false,
        FinancialSummaryID: financialSummaryId,
      },
    });

    await tx.coachingSession.update({
      where: { SessionID: sessionId },
      data: { FinalPrice: amount },
    });

    return entry;
  });
}

async function applyNoShowPenalty(sessionId, financialSummaryId) {
  const session = await prisma.coachingSession.findUnique({
    where: { SessionID: sessionId },
    include: { SessionPricingRate: true },
  });
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const amount = calculateAmount(session, session.SessionPricingRate.HourlyRate);
  const entryTypeId = await getEntryTypeId('NOSHOWPENALTY');

  return prisma.$transaction((tx) =>
    tx.financialEntry.create({
      data: {
        SessionID: sessionId,
        Amount: amount,
        EntryTypeID: entryTypeId,
        CreatedAt: new Date(),
        IsExported: false,
        FinancialSummaryID: financialSummaryId,
      },
    })
  );
}

async function applyJustifiedCancellationDecision(sessionId, isExempt, financialSummaryId) {
  if (isExempt) return null;

  const session = await prisma.coachingSession.findUnique({
    where: { SessionID: sessionId },
    include: { SessionPricingRate: true },
  });
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const amount = calculateAmount(session, session.SessionPricingRate.HourlyRate);
  const entryTypeId = await getEntryTypeId('CANCELLATION');

  return prisma.$transaction((tx) =>
    tx.financialEntry.create({
      data: {
        SessionID: sessionId,
        Amount: amount,
        EntryTypeID: entryTypeId,
        CreatedAt: new Date(),
        IsExported: false,
        FinancialSummaryID: financialSummaryId,
      },
    })
  );
}

module.exports = {
  computeAndSaveSessionPrice,
  applyNoShowPenalty,
  applyJustifiedCancellationDecision,
};
