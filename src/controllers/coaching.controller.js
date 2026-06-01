/**
 * @file src/controllers/coaching.controller.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const coachingService = require('../services/coaching.service');
const coachingRequestService = require('../services/coachingRequest.service');
const { sendNotification } = require('./notification.controller');
const logger = require('../utils/logger');
const { createCoachingUseCases } = require('../application/use-cases/coaching');

const coachingUseCases = createCoachingUseCases({
  coachingService,
  sendNotification,
  logger,
});
function toPositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function notifyCoachingRequest(req, userId, message, title = 'Atualização de pedido de coaching') {
  if (!toPositiveInt(userId)) return;
  await sendNotification(req, {
    userId,
    type: 'coaching',
    title,
    message,
  });
}

async function getAvailableSlots(req, res, next) {
  try {
    const { weekStart, startDate, endDate, teacherId, modalityId } = req.query;
    const authenticatedUserId = req.auth?.userId;
    const result = await coachingService.getAvailableSlots({ 
      weekStart, 
      startDate, 
      endDate, 
      teacherId, 
      modalityId,
      authenticatedUserId,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function getCompatibleStudios(req, res, next) {
  try {
    const { modalityId } = req.query;
    const studios = await coachingService.getCompatibleStudios(modalityId);
    res.json({ studios });
  } catch (error) {
    next(error);
  }
}

async function createSession(req, res, next) {
  try {
    const teacherUserId = toPositiveInt(req.auth?.userId);
    if (!teacherUserId) {
      return res.status(500).json({ error: 'Sessão autenticada inválida' });
    }

    const { session } = await coachingUseCases.createSessionInitiative.execute({
      req,
      teacherUserId,
      payload: req.body,
    });

    return res.status(201).json({ session });
  } catch (error) {
    if (error?.status) {
      return res.status(error.status).json({
        error: error.message,
        details: error.details || null,
      });
    }

    return next(error);
  }
}

async function createBooking(req, res, next) {
  try {
    const studentUserId = toPositiveInt(req.auth?.userId);
    if (!studentUserId) return res.status(401).json({ error: 'Não autenticado' });

    const { session } = await coachingUseCases.createBookingRequest.execute({
      req,
      studentUserId,
      payload: req.body,
    });

    return res.status(201).json({ session });
  } catch (error) {
    return next(error);
  }
}

async function cancelBooking(req, res, next) {
  try {
    const studentUserId = toPositiveInt(req.auth?.userId);
    if (!studentUserId) return res.status(401).json({ error: 'Não autenticado' });

    const sessionId = toPositiveInt(req.params.id);
    if (!sessionId) return res.status(400).json({ error: 'ID de sessão inválido' });

    const { justification } = req.body;
    const result = await coachingService.cancelBooking(sessionId, studentUserId, justification);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

async function confirmCompletion(req, res, next) {
  try {
    const studentUserId = toPositiveInt(req.auth?.userId);
    if (!studentUserId) return res.status(401).json({ error: 'Não autenticado' });

    const sessionId = toPositiveInt(req.params.id);
    if (!sessionId) return res.status(400).json({ error: 'ID de sessão inválido' });

    const result = await coachingService.confirmCompletion(sessionId, studentUserId);
    return res.status(201).json(result);
  } catch (error) {
    return next(error);
  }
}

async function getSessionHistory(req, res, next) {
  try {
    const studentUserId = toPositiveInt(req.auth?.userId);
    if (!studentUserId) return res.status(401).json({ error: 'Não autenticado' });

    const sessions = await coachingService.getSessionHistory(studentUserId);
    return res.json({ sessions });
  } catch (error) {
    return next(error);
  }
}

async function getWeeklyMap(req, res, next) {
  try {
    const { weekStart, teacherId, studioId } = req.query;
    const result = await coachingService.getWeeklyMap({ weekStart, teacherId, studioId });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function listModalities(req, res, next) {
  try {
    const studentUserId = toPositiveInt(req.auth?.userId);
    const modalities = await coachingRequestService.listModalities({ studentUserId });
    return res.json({ modalities });
  } catch (error) {
    return next(error);
  }
}

async function listTeachersByModality(req, res, next) {
  try {
    const teachers = await coachingRequestService.listTeachersByModality({
      modalityId: req.query?.modalityId,
    });
    return res.json({ teachers });
  } catch (error) {
    return next(error);
  }
}

async function getTeacherWeeklyAvailability(req, res, next) {
  try {
    const result = await coachingRequestService.getTeacherWeeklyAvailability({
      teacherId: req.query?.teacherId,
      modalityId: req.query?.modalityId,
      weekStart: req.query?.weekStart,
      authenticatedUserId: req.auth?.userId,
    });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

async function createRequest(req, res, next) {
  try {
    const studentUserId = toPositiveInt(req.auth?.userId);
    if (!studentUserId) return res.status(401).json({ error: 'Não autenticado' });

    const request = await coachingRequestService.createCoachingRequest({
      studentUserId,
      payload: req.body,
    });

    await notifyCoachingRequest(
      req,
      request.teacherUserId,
      `Novo pedido de coaching de ${request.student?.firstName || 'aluno'} para ${new Date(request.currentStartTime).toLocaleString('pt-PT')}.`,
      'Novo pedido de coaching'
    );

    return res.status(201).json({ request });
  } catch (error) {
    return next(error);
  }
}

async function listMyRequests(req, res, next) {
  try {
    const studentUserId = toPositiveInt(req.auth?.userId);
    if (!studentUserId) return res.status(401).json({ error: 'Não autenticado' });
    const requests = await coachingRequestService.listRequestsForStudent({ studentUserId });
    return res.json({ requests });
  } catch (error) {
    return next(error);
  }
}

async function getRequestById(req, res, next) {
  try {
    const actorUserId = toPositiveInt(req.auth?.userId);
    if (!actorUserId) return res.status(401).json({ error: 'Não autenticado' });

    const requestId = toPositiveInt(req.params.id);
    if (!requestId) return res.status(400).json({ error: 'ID de pedido inválido' });

    const request = await coachingRequestService.getRequestById({
      requestId,
      actorUserId,
      actorRole: req.auth?.role,
    });
    return res.json({ request });
  } catch (error) {
    return next(error);
  }
}

async function listTeacherRequests(req, res, next) {
  try {
    const teacherUserId = toPositiveInt(req.auth?.userId);
    if (!teacherUserId) return res.status(401).json({ error: 'Não autenticado' });
    const requests = await coachingRequestService.listRequestsForTeacher({ teacherUserId });
    return res.json({ requests });
  } catch (error) {
    return next(error);
  }
}

async function reviewRequestAsTeacher(req, res, next) {
  try {
    const teacherUserId = toPositiveInt(req.auth?.userId);
    if (!teacherUserId) return res.status(401).json({ error: 'Não autenticado' });
    const requestId = toPositiveInt(req.params.id);
    if (!requestId) return res.status(400).json({ error: 'ID de pedido inválido' });

    const request = await coachingRequestService.reviewRequestAsTeacher({
      requestId,
      teacherUserId,
      payload: req.body,
    });

    await notifyCoachingRequest(
      req,
      request.studentUserId,
      request.status === 'PENDING_STUDENT_CONFIRMATION'
        ? 'O professor sugeriu um novo horário para o teu pedido de coaching.'
        : request.status === 'PENDING_ADMIN_APPROVAL'
          ? 'O professor aprovou o teu pedido de coaching. Aguarda decisão da direção.'
          : 'O professor rejeitou o teu pedido de coaching.',
      'Pedido de coaching atualizado'
    );

    if (request.status === 'PENDING_ADMIN_APPROVAL') {
      const adminUserIds = await coachingService.listAdminUserIds();
      await Promise.allSettled(adminUserIds.map((adminUserId) =>
        notifyCoachingRequest(req, adminUserId, `Pedido de coaching #${request.requestId} aguarda validação final.`, 'Validação de coaching pendente')
      ));
    }

    return res.json({ request });
  } catch (error) {
    return next(error);
  }
}

async function respondToTeacherSuggestion(req, res, next) {
  try {
    const studentUserId = toPositiveInt(req.auth?.userId);
    if (!studentUserId) return res.status(401).json({ error: 'Não autenticado' });
    const requestId = toPositiveInt(req.params.id);
    if (!requestId) return res.status(400).json({ error: 'ID de pedido inválido' });

    const request = await coachingRequestService.respondToTeacherSuggestion({
      requestId,
      studentUserId,
      payload: req.body,
    });

    await notifyCoachingRequest(
      req,
      request.teacherUserId,
      request.status === 'PENDING_ADMIN_APPROVAL'
        ? 'O aluno aceitou a nova proposta de horário para o pedido de coaching.'
        : 'O aluno rejeitou a nova proposta de horário. O pedido foi cancelado.',
      'Resposta do aluno ao coaching'
    );

    return res.json({ request });
  } catch (error) {
    return next(error);
  }
}

async function listAdminRequests(req, res, next) {
  try {
    const requests = await coachingRequestService.listRequestsForAdmin({ includeResolved: false });
    return res.json({ requests });
  } catch (error) {
    return next(error);
  }
}

async function getCompatibleStudiosForRequest(req, res, next) {
  try {
    const adminUserId = toPositiveInt(req.auth?.userId);
    if (!adminUserId) return res.status(401).json({ error: 'Não autenticado' });
    const requestId = toPositiveInt(req.params.id);
    if (!requestId) return res.status(400).json({ error: 'ID de pedido inválido' });

    const studios = await coachingRequestService.getCompatibleStudiosForRequest(requestId, adminUserId);
    return res.json({ studios });
  } catch (error) {
    return next(error);
  }
}

async function reviewRequestAsAdmin(req, res, next) {
  try {
    const adminUserId = toPositiveInt(req.auth?.userId);
    if (!adminUserId) return res.status(401).json({ error: 'Não autenticado' });
    const requestId = toPositiveInt(req.params.id);
    if (!requestId) return res.status(400).json({ error: 'ID de pedido inválido' });

    const request = await coachingRequestService.reviewRequestAsAdmin({
      requestId,
      adminUserId,
      payload: req.body,
    });

    const adminMessage = request.status === 'APPROVED'
      ? 'O teu pedido de coaching foi confirmado pela direção.'
      : 'O teu pedido de coaching foi rejeitado pela direção.';

    await Promise.allSettled([
      notifyCoachingRequest(req, request.studentUserId, adminMessage, 'Decisão final do coaching'),
      notifyCoachingRequest(req, request.teacherUserId, adminMessage, 'Decisão final do coaching'),
    ]);

    return res.json({ request });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  cancelBooking,
  confirmCompletion,
  createBooking,
  createRequest,
  createSession,
  getAvailableSlots,
  getCompatibleStudios,
  getCompatibleStudiosForRequest,
  getRequestById,
  getSessionHistory,
  getTeacherWeeklyAvailability,
  getWeeklyMap,
  listAdminRequests,
  listModalities,
  listMyRequests,
  listTeacherRequests,
  listTeachersByModality,
  respondToTeacherSuggestion,
  reviewRequestAsAdmin,
  reviewRequestAsTeacher,
};
