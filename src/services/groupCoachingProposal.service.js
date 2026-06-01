/**
 * @file src/services/groupCoachingProposal.service.js
 */

const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');
const { createSessionWithBusinessRules } = require('./session.service');
const { createHttpError } = require('../utils/http-error');

const GROUP_STATUS = Object.freeze({
  PENDING_ADMIN_APPROVAL: 'PENDING_ADMIN_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
});

const INDIVIDUAL_REQUEST_GROUPED_STATUS = 'GROUPED';

function toPositiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function trimNullable(value, max = 500) {
  const trimmed = String(value || '').trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function mapParticipant(p) {
  return {
    participantId: p.ParticipantID,
    studentUserId: p.StudentUserID,
    sourceRequestId: p.SourceRequestID ?? null,
    addedAt: p.AddedAt,
    student: p.StudentUser
      ? {
          userId: p.StudentUser.UserID,
          firstName: p.StudentUser.FirstName,
          lastName: p.StudentUser.LastName,
          email: p.StudentUser.Email,
          photo: p.StudentUser.Photo || null,
        }
      : null,
  };
}

function mapProposal(record) {
  return {
    proposalId: record.ProposalID,
    teacherUserId: record.TeacherUserID,
    modalityId: record.ModalityID,
    modalityName: record.Modality?.ModalityName || null,
    studioId: record.StudioID ?? null,
    studioName: record.Studio?.StudioName || null,
    confirmedSessionId: record.ConfirmedSessionID ?? null,
    startTime: record.StartTime,
    endTime: record.EndTime,
    status: record.Status,
    notes: record.Notes ?? null,
    adminResponseNotes: record.AdminResponseNotes ?? null,
    requestedAt: record.RequestedAt,
    updatedAt: record.UpdatedAt ?? null,
    resolvedAt: record.ResolvedAt ?? null,
    teacher: record.TeacherUser
      ? {
          userId: record.TeacherUser.UserID,
          firstName: record.TeacherUser.FirstName,
          lastName: record.TeacherUser.LastName,
          email: record.TeacherUser.Email,
          photo: record.TeacherUser.Photo || null,
        }
      : null,
    participants: Array.isArray(record.Participants)
      ? record.Participants.map(mapParticipant)
      : [],
  };
}

const PROPOSAL_INCLUDE = {
  TeacherUser: { select: { UserID: true, FirstName: true, LastName: true, Email: true, Photo: true } },
  Modality: { select: { ModalityID: true, ModalityName: true } },
  Studio: { select: { StudioID: true, StudioName: true, Capacity: true } },
  Participants: {
    include: {
      StudentUser: { select: { UserID: true, FirstName: true, LastName: true, Email: true, Photo: true } },
    },
    orderBy: { AddedAt: 'asc' },
  },
};

async function ensureTeacherHasModality(tx, teacherUserId, modalityId) {
  const relation = await tx.teacherModality.findFirst({
    where: { TeacherID: teacherUserId, ModalityID: modalityId },
  });
  if (!relation) {
    throw createHttpError(404, 'O professor não está associado a esta modalidade');
  }
}

async function resolveStudents(tx, studentUserIds) {
  const users = await tx.user.findMany({
    where: {
      UserID: { in: studentUserIds },
      IsActive: true,
      DeletedAt: null,
      StudentAccount: { isNot: null },
    },
    select: { UserID: true, FirstName: true, LastName: true, Email: true },
  });

  const found = new Set(users.map((u) => u.UserID));
  const missing = studentUserIds.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw createHttpError(404, `Alunos não encontrados: ${missing.join(', ')}`);
  }
  return users;
}

async function resolveSourceRequests(tx, requestIds, teacherUserId) {
  if (!requestIds || requestIds.length === 0) return [];

  const requests = await tx.coachingRequest.findMany({
    where: {
      RequestID: { in: requestIds },
      TeacherUserID: teacherUserId,
      Status: 'PENDING_TEACHER_REVIEW',
    },
    select: { RequestID: true, StudentUserID: true },
  });

  const found = new Set(requests.map((r) => r.RequestID));
  const missing = requestIds.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw createHttpError(404, `Pedidos individuais não encontrados ou não elegíveis: ${missing.join(', ')}`);
  }
  return requests;
}

async function resolveDefaultPricingRateId(tx) {
  const rate = await tx.sessionPricingRate.findFirst({
    orderBy: { PricingRateID: 'asc' },
    select: { PricingRateID: true },
  });
  if (!rate) throw createHttpError(500, 'Nenhuma tabela de preços configurada');
  return rate.PricingRateID;
}

async function resolveScheduledStatusId(tx) {
  const statuses = await tx.sessionStatus.findMany({ select: { StatusID: true, StatusName: true } });
  const match = statuses.find((s) =>
    s.StatusName.trim().toLowerCase().replace(/[^a-z]/g, '') === 'scheduled'
  );
  if (match) return match.StatusID;
  const created = await tx.sessionStatus.create({ data: { StatusName: 'Scheduled' }, select: { StatusID: true } });
  return created.StatusID;
}

async function resolveDefaultAttendanceStatusId(tx) {
  const status = await tx.attendanceStatus.findFirst({
    orderBy: { AttendanceStatusID: 'asc' },
    select: { AttendanceStatusID: true },
  });
  if (!status) throw createHttpError(500, 'Nenhum estado de presença configurado');
  return status.AttendanceStatusID;
}

async function findCompatibleStudio(tx, modalityId, startTime, endTime, minCapacity = 1) {
  const studios = await tx.studio.findMany({
    where: {
      StudioModality: { some: { ModalityID: modalityId } },
      Capacity: { gte: minCapacity },
    },
    select: { StudioID: true, StudioName: true, Capacity: true },
    orderBy: [{ Capacity: 'asc' }, { StudioName: 'asc' }],
  });

  for (const studio of studios) {
    const conflicts = await tx.coachingSession.count({
      where: { StudioID: studio.StudioID, StartTime: { lt: endTime }, EndTime: { gt: startTime } },
    });
    if (conflicts === 0) return studio;
  }
  throw createHttpError(
    409,
    `Nenhum estúdio compatível disponível para este horário com capacidade para ${minCapacity} participante${minCapacity !== 1 ? 's' : ''}`
  );
}

async function getCompatibleStudiosForProposal(proposalId, adminUserId) {
  const proposal = await prisma.groupCoachingProposal.findFirst({
    where: { ProposalID: proposalId },
    select: { ProposalID: true, ModalityID: true, StartTime: true, EndTime: true },
  });
  if (!proposal) throw createHttpError(404, 'Proposta de grupo não encontrada');

  const startTime = new Date(proposal.StartTime);
  const endTime = new Date(proposal.EndTime);
  const dayStart = new Date(startTime); dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart); dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
  const contextStart = new Date(startTime.getTime() - 2 * 60 * 60 * 1000);
  const contextEnd = new Date(endTime.getTime() + 2 * 60 * 60 * 1000);

  const studios = await prisma.studio.findMany({
    where: { StudioModality: { some: { ModalityID: proposal.ModalityID } } },
    select: { StudioID: true, StudioName: true, Capacity: true },
    orderBy: [{ Capacity: 'asc' }, { StudioName: 'asc' }],
  });

  return Promise.all(studios.map(async (studio) => {
    const [conflictCount, dailyCount, nearbyCount] = await Promise.all([
      prisma.coachingSession.count({ where: { StudioID: studio.StudioID, StartTime: { lt: endTime }, EndTime: { gt: startTime } } }),
      prisma.coachingSession.count({ where: { StudioID: studio.StudioID, StartTime: { lt: dayEnd }, EndTime: { gt: dayStart } } }),
      prisma.coachingSession.count({ where: { StudioID: studio.StudioID, StartTime: { lt: contextEnd }, EndTime: { gt: contextStart } } }),
    ]);
    return {
      studioId: studio.StudioID,
      studioName: studio.StudioName,
      capacity: studio.Capacity,
      isAvailable: conflictCount === 0,
      conflictCount,
      dailySessionCount: dailyCount,
      nearbySessionCount: nearbyCount,
    };
  }));
}

async function createGroupProposal({ teacherUserId, payload }) {
  const modalityId = toPositiveInt(payload.modalityId);
  const startTime = new Date(payload.startTime);
  const endTime = new Date(payload.endTime);

  if (!modalityId) throw createHttpError(400, 'modalityId inválido');
  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime()) || endTime <= startTime) {
    throw createHttpError(400, 'Intervalo temporal inválido');
  }
  if (startTime.getTime() <= Date.now()) {
    throw createHttpError(400, 'Não é possível criar um grupo para um horário no passado');
  }

  // studentUserIds: direct students to add (from search or from requests)
  const directStudentIds = Array.isArray(payload.studentUserIds)
    ? [...new Set(payload.studentUserIds.map(toPositiveInt).filter(Boolean))]
    : [];

  // sourceRequestIds: existing PENDING_TEACHER_REVIEW requests to merge
  const sourceRequestIds = Array.isArray(payload.sourceRequestIds)
    ? [...new Set(payload.sourceRequestIds.map(toPositiveInt).filter(Boolean))]
    : [];

  if (directStudentIds.length + sourceRequestIds.length < 2) {
    throw createHttpError(400, 'Uma sessão de grupo requer pelo menos 2 participantes');
  }

  return prisma.$transaction(async (tx) => {
    await ensureTeacherHasModality(tx, teacherUserId, modalityId);

    // Resolve source requests → get student IDs from them
    const sourceRequests = await resolveSourceRequests(tx, sourceRequestIds, teacherUserId);
    const requestStudentIds = sourceRequests.map((r) => r.StudentUserID);

    // Merge all student IDs, deduplicated
    const allStudentIds = [...new Set([...directStudentIds, ...requestStudentIds])];
    if (allStudentIds.length < 2) {
      throw createHttpError(400, 'Uma sessão de grupo requer pelo menos 2 participantes distintos');
    }

    await resolveStudents(tx, allStudentIds);

    const now = new Date();
    const proposal = await tx.groupCoachingProposal.create({
      data: {
        TeacherUserID: teacherUserId,
        ModalityID: modalityId,
        StartTime: startTime,
        EndTime: endTime,
        Status: GROUP_STATUS.PENDING_ADMIN_APPROVAL,
        Notes: trimNullable(payload.notes),
        RequestedAt: now,
        UpdatedAt: now,
      },
      select: { ProposalID: true },
    });

    // Create participants
    await tx.groupCoachingParticipant.createMany({
      data: allStudentIds.map((studentUserId) => {
        const sourceReq = sourceRequests.find((r) => r.StudentUserID === studentUserId);
        return {
          ProposalID: proposal.ProposalID,
          StudentUserID: studentUserId,
          SourceRequestID: sourceReq?.RequestID ?? null,
          AddedAt: now,
        };
      }),
    });

    // Mark source requests as GROUPED
    if (sourceRequestIds.length > 0) {
      await tx.coachingRequest.updateMany({
        where: { RequestID: { in: sourceRequestIds } },
        data: {
          Status: INDIVIDUAL_REQUEST_GROUPED_STATUS,
          GroupProposalID: proposal.ProposalID,
          UpdatedAt: now,
          ResolvedAt: now,
        },
      });
    }

    const created = await tx.groupCoachingProposal.findUnique({
      where: { ProposalID: proposal.ProposalID },
      include: PROPOSAL_INCLUDE,
    });

    return mapProposal(created);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function listProposalsForTeacher({ teacherUserId, includeResolved = false }) {
  const where = includeResolved
    ? { TeacherUserID: teacherUserId }
    : { TeacherUserID: teacherUserId, Status: GROUP_STATUS.PENDING_ADMIN_APPROVAL };

  const rows = await prisma.groupCoachingProposal.findMany({
    where,
    include: PROPOSAL_INCLUDE,
    orderBy: [{ RequestedAt: 'desc' }, { ProposalID: 'desc' }],
  });
  return rows.map(mapProposal);
}

async function listProposalsForAdmin({ includeResolved = false }) {
  const where = includeResolved ? undefined : { Status: GROUP_STATUS.PENDING_ADMIN_APPROVAL };
  const rows = await prisma.groupCoachingProposal.findMany({
    where,
    include: PROPOSAL_INCLUDE,
    orderBy: [{ RequestedAt: 'asc' }, { ProposalID: 'asc' }],
  });
  return rows.map(mapProposal);
}

async function reviewProposalAsAdmin({ proposalId, adminUserId, payload }) {
  const decision = String(payload.decision || '').trim().toLowerCase();
  if (!['approve', 'reject'].includes(decision)) {
    throw createHttpError(400, 'Decisão inválida: esperado approve ou reject');
  }

  const proposal = await prisma.groupCoachingProposal.findUnique({
    where: { ProposalID: proposalId },
    include: { ...PROPOSAL_INCLUDE, Participants: { include: { StudentUser: { select: { UserID: true, FirstName: true, LastName: true, Email: true, Photo: true } } } } },
  });

  if (!proposal) throw createHttpError(404, 'Proposta de grupo não encontrada');
  if (proposal.Status !== GROUP_STATUS.PENDING_ADMIN_APPROVAL) {
    throw createHttpError(409, 'Esta proposta já foi revista');
  }

  const now = new Date();
  let confirmedSessionId = null;
  let studioId = null;
  const nextStatus = decision === 'approve' ? GROUP_STATUS.APPROVED : GROUP_STATUS.REJECTED;

  if (decision === 'approve') {
    const requestedStudioId = toPositiveInt(payload.studioId);

    const studentUserIds = proposal.Participants.map((p) => p.StudentUserID);
    const participantCount = studentUserIds.length;

    let studioRecord;
    if (requestedStudioId) {
      studioRecord = await prisma.studio.findUnique({
        where: { StudioID: requestedStudioId },
        select: { StudioID: true, StudioName: true, Capacity: true },
      });
      if (!studioRecord) throw createHttpError(404, 'Estúdio não encontrado');
      if ((studioRecord.Capacity ?? 0) < participantCount) {
        throw createHttpError(
          409,
          `O estúdio selecionado tem capacidade para ${studioRecord.Capacity} participante(s), mas a sessão tem ${participantCount}.`
        );
      }
    } else {
      studioRecord = await findCompatibleStudio(
        prisma,
        proposal.ModalityID,
        proposal.StartTime,
        proposal.EndTime,
        participantCount
      );
    }
    studioId = studioRecord.StudioID;

    const [scheduledStatusId, pricingRateId, attendanceStatusId] = await Promise.all([
      resolveScheduledStatusId(prisma),
      resolveDefaultPricingRateId(prisma),
      resolveDefaultAttendanceStatusId(prisma),
    ]);

    const session = await createSessionWithBusinessRules({
      studioId,
      startTime: proposal.StartTime,
      endTime: proposal.EndTime,
      modalityId: proposal.ModalityID,
      pricingRateId,
      statusId: scheduledStatusId,
      teacherIds: [proposal.TeacherUserID],
      maxParticipants: participantCount,
      isExternal: false,
      isOutsideStdHours: false,
      reviewNotes: null,
      skipTeacherAvailability: true,
    }, adminUserId);

    // Enroll all students
    const studentAccounts = await prisma.studentAccount.findMany({
      where: { UserID: { in: studentUserIds } },
      select: { StudentAccountID: true, UserID: true },
    });

    await prisma.sessionStudent.createMany({
      data: studentAccounts.map((sa) => ({
        SessionID: session.SessionID,
        StudentAccountID: sa.StudentAccountID,
        EnrolledAt: now,
        AttendanceStatusID: attendanceStatusId,
      })),
    });

    confirmedSessionId = session.SessionID;
  }

  await prisma.groupCoachingProposal.update({
    where: { ProposalID: proposalId },
    data: {
      Status: nextStatus,
      StudioID: studioId,
      ConfirmedSessionID: confirmedSessionId,
      AdminResponseNotes: trimNullable(payload.notes),
      UpdatedAt: now,
      ResolvedAt: now,
    },
  });

  const updated = await prisma.groupCoachingProposal.findUnique({
    where: { ProposalID: proposalId },
    include: PROPOSAL_INCLUDE,
  });
  return mapProposal(updated);
}

async function searchStudents({ query, teacherUserId }) {
  const q = String(query || '').trim();
  if (q.length < 2) throw createHttpError(400, 'Pesquisa deve ter pelo menos 2 caracteres');

  const users = await prisma.user.findMany({
    where: {
      IsActive: true,
      DeletedAt: null,
      StudentAccount: { isNot: null },
      OR: [
        { FirstName: { contains: q } },
        { LastName: { contains: q } },
        { Email: { contains: q } },
      ],
    },
    select: { UserID: true, FirstName: true, LastName: true, Email: true, Photo: true },
    take: 20,
    orderBy: [{ FirstName: 'asc' }, { LastName: 'asc' }],
  });

  return users.map((u) => ({
    userId: u.UserID,
    firstName: u.FirstName,
    lastName: u.LastName,
    name: [u.FirstName, u.LastName].filter(Boolean).join(' '),
    email: u.Email,
    photo: u.Photo || null,
  }));
}

module.exports = {
  GROUP_STATUS,
  createGroupProposal,
  getCompatibleStudiosForProposal,
  listProposalsForAdmin,
  listProposalsForTeacher,
  reviewProposalAsAdmin,
  searchStudents,
};
