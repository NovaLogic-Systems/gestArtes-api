/**
 * @file src/controllers/groupCoachingProposal.controller.js
 */

const groupService = require('../services/groupCoachingProposal.service');
const { sendNotification } = require('./notification.controller');

function toPositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function notifyUsers(req, userIds, message, title) {
  await Promise.allSettled(
    userIds
      .filter((id) => toPositiveInt(id))
      .map((userId) => sendNotification(req, { userId, type: 'coaching', title, message }))
  );
}

async function createProposal(req, res, next) {
  try {
    const teacherUserId = toPositiveInt(req.auth?.userId);
    if (!teacherUserId) return res.status(401).json({ error: 'Não autenticado' });

    const proposal = await groupService.createGroupProposal({ teacherUserId, payload: req.body });

    const studentIds = proposal.participants.map((p) => p.studentUserId);
    await notifyUsers(
      req, studentIds,
      'O teu professor criou uma sessão de grupo. Aguarda aprovação da direção.',
      'Sessão de grupo criada'
    );

    return res.status(201).json({ proposal });
  } catch (error) {
    return next(error);
  }
}

async function listTeacherProposals(req, res, next) {
  try {
    const teacherUserId = toPositiveInt(req.auth?.userId);
    if (!teacherUserId) return res.status(401).json({ error: 'Não autenticado' });

    const proposals = await groupService.listProposalsForTeacher({ teacherUserId });
    return res.json({ proposals });
  } catch (error) {
    return next(error);
  }
}

async function listAdminProposals(req, res, next) {
  try {
    const proposals = await groupService.listProposalsForAdmin({ includeResolved: false });
    return res.json({ proposals });
  } catch (error) {
    return next(error);
  }
}

async function getCompatibleStudios(req, res, next) {
  try {
    const adminUserId = toPositiveInt(req.auth?.userId);
    if (!adminUserId) return res.status(401).json({ error: 'Não autenticado' });
    const proposalId = toPositiveInt(req.params.id);
    if (!proposalId) return res.status(400).json({ error: 'ID de proposta inválido' });

    const studios = await groupService.getCompatibleStudiosForProposal(proposalId, adminUserId);
    return res.json({ studios });
  } catch (error) {
    return next(error);
  }
}

async function reviewProposal(req, res, next) {
  try {
    const adminUserId = toPositiveInt(req.auth?.userId);
    if (!adminUserId) return res.status(401).json({ error: 'Não autenticado' });
    const proposalId = toPositiveInt(req.params.id);
    if (!proposalId) return res.status(400).json({ error: 'ID de proposta inválido' });

    const proposal = await groupService.reviewProposalAsAdmin({ proposalId, adminUserId, payload: req.body });

    const notifyIds = [
      proposal.teacherUserId,
      ...proposal.participants.map((p) => p.studentUserId),
    ];
    const message = proposal.status === 'APPROVED'
      ? 'A sessão de grupo foi aprovada pela direção.'
      : 'A sessão de grupo foi rejeitada pela direção.';
    await notifyUsers(req, notifyIds, message, 'Decisão sobre sessão de grupo');

    return res.json({ proposal });
  } catch (error) {
    return next(error);
  }
}

async function searchStudents(req, res, next) {
  try {
    const teacherUserId = toPositiveInt(req.auth?.userId);
    if (!teacherUserId) return res.status(401).json({ error: 'Não autenticado' });

    const students = await groupService.searchStudents({
      query: req.query.q,
      teacherUserId,
    });
    return res.json({ students });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createProposal,
  getCompatibleStudios,
  listAdminProposals,
  listTeacherProposals,
  reviewProposal,
  searchStudents,
};
