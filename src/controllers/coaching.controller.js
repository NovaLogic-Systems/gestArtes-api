const coachingService = require('../services/coaching.service');
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

async function getAvailableSlots(req, res, next) {
  try {
    const { weekStart, startDate, endDate, teacherId, modalityId } = req.query;
    const result = await coachingService.getAvailableSlots({ 
      weekStart, 
      startDate, 
      endDate, 
      teacherId, 
      modalityId 
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

module.exports = {
  cancelBooking,
  confirmCompletion,
  createBooking,
  createSession,
  getAvailableSlots,
  getCompatibleStudios,
  getSessionHistory,
  getWeeklyMap,
};
