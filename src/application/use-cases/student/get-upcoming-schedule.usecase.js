/**
 * get-upcoming-schedule.usecase.js — Use-case para calendário futuro do estudante
 * Responsabilidades:
 * - Orquestração: carrega sessões futuras via Prisma
 * - Transformação: mapeia dados brutos para estrutura de resposta
 * - Devolve ao controller para tratamento HTTP/IO
 */

function toUTCDateString(date) {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().slice(0, 10);
}

function toUTCTimeString(date) {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().slice(11, 16);
}

function toInteger(value) {
  if (typeof value === 'bigint') return Number(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapScheduleRow(row) {
  return {
    sessionId: toInteger(row.sessionId),
    date: row.sessionDate,
    time: row.sessionTime,
    teacher: row.teacherName,
    studio: row.studioName,
    status: row.sessionStatus,
  };
}

function createGetUpcomingScheduleUseCase(deps) {
  const { prisma } = deps;

  async function execute({ studentAccountId, limit = 5 }) {
    const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 5;
    const now = new Date();

    // Carrega sessões futuras do estudante ordenadas por data de início
    const sessionStudents = await prisma.sessionStudent.findMany({
      where: {
        StudentAccountID: studentAccountId,
        CoachingSession: { StartTime: { gte: now } },
      },
      include: {
        CoachingSession: {
          include: {
            Studio: { select: { StudioName: true } },
            SessionStatus: { select: { StatusName: true } },
            SessionTeacher: {
              orderBy: [{ AssignmentRoleID: 'asc' }, { TeacherID: 'asc' }],
              include: { User: { select: { FirstName: true, LastName: true } } },
            },
          },
        },
      },
      orderBy: [{ CoachingSession: { StartTime: 'asc' } }, { SessionID: 'asc' }],
      take: safeLimit,
    });

    // Transforma e retorna calendário mapeado
    return sessionStudents.map((ss) => {
      const cs = ss.CoachingSession;
      const teacher = cs.SessionTeacher[0];
      return mapScheduleRow({
        sessionId: cs.SessionID,
        sessionDate: toUTCDateString(cs.StartTime),
        sessionTime: toUTCTimeString(cs.StartTime),
        teacherName: teacher
          ? [teacher.User.FirstName, teacher.User.LastName].filter(Boolean).join(' ')
          : 'Por atribuir',
        studioName: cs.Studio.StudioName,
        sessionStatus: cs.SessionStatus.StatusName,
      });
    });
  }

  return { execute };
}

module.exports = { createGetUpcomingScheduleUseCase };
