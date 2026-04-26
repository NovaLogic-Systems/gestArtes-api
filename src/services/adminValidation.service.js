const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');
const { createPricingService } = require('./pricing.service');

const pricingService = createPricingService(prisma);

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function toPositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function mapQueueRow(row) {
  return {
    sessionId: Number(row.sessionId),
    sessionReference: `#${Number(row.sessionId)}`,
    title: String(row.title || '').trim(),
    teacherName: String(row.teacherName || '—').trim() || '—',
    studentName: String(row.studentName || '—').trim() || '—',
    startTime: row.startTime,
    endTime: row.endTime,
    hourlyRate: Number(row.hourlyRate || 0),
    isExternal: Boolean(row.isExternal),
    isOutsideStdHours: Boolean(row.isOutsideStdHours),
    confirmationCount: Number(row.confirmationCount || 0),
    teacherConfirmed: Boolean(row.teacherConfirmed),
    studentConfirmed: Boolean(row.studentConfirmed),
  }
}

async function listPostSessionValidations() {
  const rows = await prisma.$queryRaw`
    WITH ValidationSummary AS (
      SELECT
        sv.SessionID,
        COUNT(DISTINCT CASE WHEN LOWER(r.RoleName) = 'teacher' THEN sv.ValidatedByUserID END) AS teacherConfirmed,
        COUNT(DISTINCT CASE WHEN LOWER(r.RoleName) = 'student' THEN sv.ValidatedByUserID END) AS studentConfirmed,
        COUNT(CASE WHEN LOWER(vs.StepName) LIKE '%final%' THEN 1 END) AS finalizationCount,
        COUNT(DISTINCT CASE WHEN LOWER(r.RoleName) IN ('teacher', 'student') THEN r.RoleName END) AS confirmationCount
      FROM SessionValidation AS sv
      INNER JOIN ValidationStep AS vs ON vs.StepID = sv.ValidationStepID
      INNER JOIN UserRole AS ur ON ur.UserID = sv.ValidatedByUserID
      INNER JOIN Role AS r ON r.RoleID = ur.RoleID
      GROUP BY sv.SessionID
    )
    SELECT
      cs.SessionID AS sessionId,
      cs.StartTime AS startTime,
      cs.EndTime AS endTime,
      cs.IsExternal AS isExternal,
      cs.IsOutsideStdHours AS isOutsideStdHours,
      cs.FinalPrice AS finalPrice,
      pr.HourlyRate AS hourlyRate,
      COALESCE(
        (
          SELECT TOP (1)
            CONCAT(u.FirstName, ' ', COALESCE(u.LastName, ''))
          FROM SessionTeacher AS st
          INNER JOIN [User] AS u ON u.UserID = st.TeacherID
          WHERE st.SessionID = cs.SessionID
          ORDER BY st.TeacherID
        ),
        '—'
      ) AS teacherName,
      COALESCE(
        (
          SELECT TOP (1)
            CONCAT(u.FirstName, ' ', COALESCE(u.LastName, ''))
          FROM SessionStudent AS ss
          INNER JOIN StudentAccount AS sa ON sa.StudentAccountID = ss.StudentAccountID
          INNER JOIN [User] AS u ON u.UserID = sa.UserID
          WHERE ss.SessionID = cs.SessionID
          ORDER BY ss.StudentAccountID
        ),
        '—'
      ) AS studentName,
      vsum.teacherConfirmed AS teacherConfirmed,
      vsum.studentConfirmed AS studentConfirmed,
      vsum.confirmationCount AS confirmationCount
    FROM CoachingSession AS cs
    INNER JOIN SessionPricingRate AS pr ON pr.PricingRateID = cs.PricingRateID
    INNER JOIN ValidationSummary AS vsum ON vsum.SessionID = cs.SessionID
    WHERE cs.EndTime <= SYSUTCDATETIME()
      AND vsum.teacherConfirmed >= 1
      AND vsum.studentConfirmed >= 1
      AND vsum.finalizationCount = 0
    ORDER BY cs.EndTime DESC, cs.SessionID DESC
  `;

  return rows.map(mapQueueRow);
}

async function getFinalizationStepId(db) {
  const steps = await db.validationStep.findMany({
    select: {
      StepID: true,
      StepName: true,
    },
  });

  const keywords = ['final', 'management'];
  const step = steps.find((entry) => {
    const normalized = normalizeText(entry.StepName);
    return keywords.every((keyword) => normalized.includes(keyword)) || normalized.includes('finalization') || normalized.includes('finalisation');
  });

  if (!step) {
    throw createHttpError(500, 'Validation step for finalisation not configured');
  }

  return step.StepID;
}

async function finalizeSessionValidation(sessionId, adminUserId) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.coachingSession.findUnique({
      where: {
        SessionID: sessionId,
      },
      select: {
        SessionID: true,
        StartTime: true,
        EndTime: true,
      },
    });

    if (!session) {
      throw createHttpError(404, 'Sessão não encontrada');
    }

    const validations = await tx.sessionValidation.findMany({
      where: { SessionID: sessionId },
      select: {
        ValidatedByUserID: true,
        ValidationStep: { select: { StepName: true } },
        User: {
          select: {
            UserRole: {
              select: { Role: { select: { RoleName: true } } },
            },
          },
        },
      },
    });

    const teacherUserIds = new Set();
    const studentUserIds = new Set();
    let finalizationCount = 0;

    for (const sv of validations) {
      const stepName = (sv.ValidationStep.StepName || '').toLowerCase();
      if (stepName.includes('final')) finalizationCount++;
      for (const ur of sv.User.UserRole) {
        const roleName = (ur.Role.RoleName || '').toLowerCase();
        if (roleName === 'teacher') teacherUserIds.add(sv.ValidatedByUserID);
        if (roleName === 'student') studentUserIds.add(sv.ValidatedByUserID);
      }
    }

    const queueRow = {
      teacherConfirmed: teacherUserIds.size,
      studentConfirmed: studentUserIds.size,
      finalizationCount,
    };

    if (queueRow.teacherConfirmed < 1 || queueRow.studentConfirmed < 1) {
      throw createHttpError(409, 'Sessão ainda não está pronta para finalização');
    }

    if (queueRow.finalizationCount > 0) {
      throw createHttpError(409, 'Sessão já foi finalizada');
    }

    const finalizationStepId = await getFinalizationStepId(tx);

    await tx.sessionValidation.create({
      data: {
        SessionID: sessionId,
        ValidatedByUserID: adminUserId,
        ValidatedAt: new Date(),
        ValidationStepID: finalizationStepId,
      },
    });

    const financialEntry = await pricingService.generateFinancialEntryOnFinalization(
      sessionId,
      adminUserId,
      tx,
    );

    return {
      session,
      financialEntry,
    };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

module.exports = {
  finalizeSessionValidation,
  listPostSessionValidations,
};