const prisma = require('../config/prisma');
const { createPricingService } = require('./pricing.service');

const pricingService = createPricingService(prisma);

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function toInteger(value) {
  if (typeof value === 'bigint') {
    return Number(value);
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDecimal(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function parseDateParam(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getDefaultOccupancyWindow() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { from, to };
}

function mapPostSessionRow(row) {
  return {
    sessionId: toInteger(row.sessionId),
    studioId: toInteger(row.studioId),
    studioName: row.studioName,
    modalityId: toInteger(row.modalityId),
    modalityName: row.modalityName,
    statusName: row.statusName,
    startTime: row.startTime,
    endTime: row.endTime,
    teacherCount: toInteger(row.teacherCount),
    studentCount: toInteger(row.studentCount),
    lastConfirmationAt: row.lastConfirmationAt,
  };
}

function mapStudioOccupancyRow(row) {
  const totalSessions = toInteger(row.totalSessions);
  const capacity = toInteger(row.capacity);
  const totalParticipants = toInteger(row.totalParticipants);
  const occupancyRate =
    capacity > 0 && totalSessions > 0
      ? Number(((totalParticipants / (capacity * totalSessions)) * 100).toFixed(2))
      : 0;

  return {
    studioId: toInteger(row.studioId),
    studioName: row.studioName,
    capacity,
    totalSessions,
    bookedHours: toDecimal(row.bookedHours),
    totalParticipants,
    occupancyRate,
  };
}

async function listPostSessionValidationQueue() {
  const rows = await prisma.$queryRaw`
    WITH ValidationByRole AS (
      SELECT
        sv.SessionID,
        MAX(CASE WHEN LOWER(r.RoleName) = 'teacher' THEN 1 ELSE 0 END) AS hasTeacherConfirmation,
        MAX(CASE WHEN LOWER(r.RoleName) = 'student' THEN 1 ELSE 0 END) AS hasStudentConfirmation,
        MAX(
          CASE
            WHEN LOWER(r.RoleName) = 'admin'
              AND (
                LOWER(vs.StepName) LIKE '%admin%'
                OR LOWER(vs.StepName) LIKE '%final%'
                OR LOWER(vs.StepName) LIKE '%gest%'
                OR LOWER(vs.StepName) LIKE '%manag%'
              )
            THEN 1
            ELSE 0
          END
        ) AS hasAdminFinalValidation,
        MAX(sv.ValidatedAt) AS lastConfirmationAt
      FROM [SessionValidation] AS sv
      INNER JOIN [ValidationStep] AS vs ON vs.StepID = sv.ValidationStepID
      INNER JOIN [UserRole] AS ur ON ur.UserID = sv.ValidatedByUserID
      INNER JOIN [Role] AS r ON r.RoleID = ur.RoleID
      GROUP BY sv.SessionID
    )
    SELECT
      cs.SessionID AS sessionId,
      cs.StudioID AS studioId,
      st.StudioName AS studioName,
      cs.ModalityID AS modalityId,
      m.ModalityName AS modalityName,
      ss.StatusName AS statusName,
      cs.StartTime AS startTime,
      cs.EndTime AS endTime,
      COUNT(DISTINCT stt.TeacherID) AS teacherCount,
      COUNT(DISTINCT sstd.StudentAccountID) AS studentCount,
      vbr.lastConfirmationAt AS lastConfirmationAt
    FROM ValidationByRole AS vbr
    INNER JOIN [CoachingSession] AS cs ON cs.SessionID = vbr.SessionID
    INNER JOIN [Studio] AS st ON st.StudioID = cs.StudioID
    INNER JOIN [Modality] AS m ON m.ModalityID = cs.ModalityID
    INNER JOIN [SessionStatus] AS ss ON ss.StatusID = cs.StatusID
    LEFT JOIN [SessionTeacher] AS stt ON stt.SessionID = cs.SessionID
    LEFT JOIN [SessionStudent] AS sstd ON sstd.SessionID = cs.SessionID
    WHERE vbr.hasTeacherConfirmation = 1
      AND vbr.hasStudentConfirmation = 1
      AND vbr.hasAdminFinalValidation = 0
    GROUP BY
      cs.SessionID,
      cs.StudioID,
      st.StudioName,
      cs.ModalityID,
      m.ModalityName,
      ss.StatusName,
      cs.StartTime,
      cs.EndTime,
      vbr.lastConfirmationAt
    ORDER BY vbr.lastConfirmationAt ASC, cs.StartTime ASC, cs.SessionID ASC
  `;

  return rows.map(mapPostSessionRow);
}

async function assertSessionIsReadyForFinalValidation(sessionId) {
  const rows = await prisma.$queryRaw`
    SELECT
      MAX(CASE WHEN LOWER(r.RoleName) = 'teacher' THEN 1 ELSE 0 END) AS hasTeacherConfirmation,
      MAX(CASE WHEN LOWER(r.RoleName) = 'student' THEN 1 ELSE 0 END) AS hasStudentConfirmation,
      MAX(
        CASE
          WHEN LOWER(r.RoleName) = 'admin'
            AND (
              LOWER(vs.StepName) LIKE '%admin%'
              OR LOWER(vs.StepName) LIKE '%final%'
              OR LOWER(vs.StepName) LIKE '%gest%'
              OR LOWER(vs.StepName) LIKE '%manag%'
            )
          THEN 1
          ELSE 0
        END
      ) AS hasAdminFinalValidation
    FROM [SessionValidation] AS sv
    INNER JOIN [ValidationStep] AS vs ON vs.StepID = sv.ValidationStepID
    INNER JOIN [UserRole] AS ur ON ur.UserID = sv.ValidatedByUserID
    INNER JOIN [Role] AS r ON r.RoleID = ur.RoleID
    WHERE sv.SessionID = ${sessionId}
  `;

  const row = rows[0] || {};

  if (!toInteger(row.hasTeacherConfirmation) || !toInteger(row.hasStudentConfirmation)) {
    throw createHttpError(
      409,
      'Sessão ainda não está pronta para validação final administrativa'
    );
  }

  if (toInteger(row.hasAdminFinalValidation)) {
    throw createHttpError(409, 'Sessão já foi validada pela administração');
  }
}

async function resolveAdminFinalStepId() {
  const preferred = [
    'adminfinalvalidation',
    'managementfinalvalidation',
    'adminfinalization',
    'finalvalidation',
    'finalization',
  ];

  const steps = await prisma.validationStep.findMany({
    select: {
      StepID: true,
      StepName: true,
    },
    orderBy: {
      StepID: 'asc',
    },
  });

  for (const key of preferred) {
    const found = steps.find((step) => normalizeKey(step.StepName) === key);
    if (found) {
      return found.StepID;
    }
  }

  const created = await prisma.validationStep.create({
    data: {
      StepName: 'AdminFinalValidation',
    },
    select: {
      StepID: true,
    },
  });

  return created.StepID;
}

async function assertNoFinalFinancialEntry(sessionId) {
  const existing = await prisma.financialEntry.findFirst({
    where: {
      SessionID: sessionId,
      FinancialEntryType: {
        TypeName: 'SESSION',
      },
    },
    select: {
      EntryID: true,
    },
  });

  if (existing) {
    throw createHttpError(409, 'FinancialEntry desta sessão já foi gerada');
  }
}

async function finalizeSessionValidation({ sessionId, adminUserId }) {
  const session = await prisma.coachingSession.findUnique({
    where: {
      SessionID: sessionId,
    },
    select: {
      SessionID: true,
    },
  });

  if (!session) {
    throw createHttpError(404, 'Sessão não encontrada');
  }

  await assertSessionIsReadyForFinalValidation(sessionId);
  await assertNoFinalFinancialEntry(sessionId);

  const stepId = await resolveAdminFinalStepId();
  const finalizedAt = new Date();

  const validation = await prisma.sessionValidation.create({
    data: {
      SessionID: sessionId,
      ValidationStepID: stepId,
      ValidatedByUserID: adminUserId,
      ValidatedAt: finalizedAt,
    },
    select: {
      ValidationID: true,
    },
  });

  try {
    const entry = await pricingService.generateFinancialEntryOnFinalization(
      sessionId,
      adminUserId
    );

    return {
      sessionId,
      validationId: validation.ValidationID,
      finalizedAt,
      financialEntryId: entry.EntryID,
    };
  } catch (error) {
    await prisma.sessionValidation.delete({
      where: {
        ValidationID: validation.ValidationID,
      },
    });

    throw error;
  }
}

async function getStudioOccupancy({ from, to }) {
  const fromDate = parseDateParam(from);
  const toDate = parseDateParam(to);

  if ((from && !fromDate) || (to && !toDate)) {
    throw createHttpError(400, 'Parâmetros de data inválidos');
  }

  const window = fromDate && toDate
    ? { from: fromDate, to: toDate }
    : getDefaultOccupancyWindow();

  if (window.from >= window.to) {
    throw createHttpError(400, 'Período inválido: "from" deve ser anterior a "to"');
  }

  const rows = await prisma.$queryRaw`
    WITH SessionStudentCount AS (
      SELECT
        ss.SessionID,
        COUNT(1) AS studentCount
      FROM [SessionStudent] AS ss
      GROUP BY ss.SessionID
    )
    SELECT
      st.StudioID AS studioId,
      st.StudioName AS studioName,
      st.Capacity AS capacity,
      COUNT(DISTINCT cs.SessionID) AS totalSessions,
      CAST(
        ISNULL(SUM(CAST(DATEDIFF(MINUTE, cs.StartTime, cs.EndTime) AS decimal(10, 2))), 0) / 60.0
        AS decimal(10, 2)
      ) AS bookedHours,
      ISNULL(SUM(ISNULL(ssc.studentCount, 0)), 0) AS totalParticipants
    FROM [Studio] AS st
    LEFT JOIN [CoachingSession] AS cs
      ON cs.StudioID = st.StudioID
      AND cs.StartTime >= ${window.from}
      AND cs.StartTime < ${window.to}
    LEFT JOIN SessionStudentCount AS ssc ON ssc.SessionID = cs.SessionID
    GROUP BY st.StudioID, st.StudioName, st.Capacity
    ORDER BY st.StudioName ASC
  `;

  const studios = rows.map(mapStudioOccupancyRow);
  const totalStudios = studios.length;
  const totalSessions = studios.reduce((sum, studio) => sum + studio.totalSessions, 0);
  const totalBookedHours = Number(
    studios.reduce((sum, studio) => sum + studio.bookedHours, 0).toFixed(2)
  );
  const averageOccupancyRate = totalStudios
    ? Number(
        (
          studios.reduce((sum, studio) => sum + studio.occupancyRate, 0) /
          totalStudios
        ).toFixed(2)
      )
    : 0;

  return {
    period: {
      from: window.from,
      to: window.to,
    },
    summary: {
      totalStudios,
      totalSessions,
      totalBookedHours,
      averageOccupancyRate,
    },
    studios,
  };
}

module.exports = {
  listPostSessionValidationQueue,
  finalizeSessionValidation,
  getStudioOccupancy,
};
