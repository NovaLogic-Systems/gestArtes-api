/**
 * @file src/services/admin.service.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const prisma = require('../config/prisma');
const { createPricingService } = require('./pricing.service');
const { createHttpError } = require('../utils/http-error');

const pricingService = createPricingService(prisma);

function toInteger(value) {
  if (typeof value === 'bigint') {
    return Number(value);
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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
  const validations = await prisma.sessionValidation.findMany({
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

  let hasTeacherConfirmation = false;
  let hasStudentConfirmation = false;
  let hasAdminFinalValidation = false;

  for (const sv of validations) {
    const stepName = (sv.ValidationStep.StepName || '').toLowerCase();
    for (const ur of sv.User.UserRole) {
      const roleName = (ur.Role.RoleName || '').toLowerCase();
      if (roleName === 'teacher') hasTeacherConfirmation = true;
      if (roleName === 'student') hasStudentConfirmation = true;
      if (
        roleName === 'admin' &&
        (stepName.includes('admin') ||
          stepName.includes('final') ||
          stepName.includes('gest') ||
          stepName.includes('manag'))
      ) {
        hasAdminFinalValidation = true;
      }
    }
  }

  if (!hasTeacherConfirmation || !hasStudentConfirmation) {
    throw createHttpError(
      409,
      'Sessão ainda não está pronta para validação final administrativa'
    );
  }

  if (hasAdminFinalValidation) {
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

  const studioRows = await prisma.studio.findMany({
    orderBy: { StudioName: 'asc' },
    select: {
      StudioID: true,
      StudioName: true,
      Capacity: true,
      CoachingSession: {
        where: {
          StartTime: { gte: window.from, lt: window.to },
        },
        select: {
          StartTime: true,
          EndTime: true,
          _count: { select: { SessionStudent: true } },
        },
      },
    },
  });

  const studios = studioRows.map((studio) => {
    const sessions = studio.CoachingSession;
    const totalSessions = sessions.length;
    const bookedMinutes = sessions.reduce(
      (sum, cs) => sum + (cs.EndTime.getTime() - cs.StartTime.getTime()) / (1000 * 60),
      0,
    );
    const totalParticipants = sessions.reduce((sum, cs) => sum + cs._count.SessionStudent, 0);
    const capacity = studio.Capacity;
    const occupancyRate =
      capacity > 0 && totalSessions > 0
        ? Number(((totalParticipants / (capacity * totalSessions)) * 100).toFixed(2))
        : 0;

    return {
      studioId: studio.StudioID,
      studioName: studio.StudioName,
      capacity,
      totalSessions,
      bookedHours: Number((bookedMinutes / 60).toFixed(2)),
      totalParticipants,
      occupancyRate,
    };
  });
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

