const coachingService = require('../services/coaching.service');
const { sendNotification } = require('./notification.controller');

function toPositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function getAvailableSlots(req, res, next) {
  try {
    const { weekStart, teacherId, modalityId } = req.query;
    const result = await coachingService.getAvailableSlots({ weekStart, teacherId, modalityId });
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

async function createBooking(req, res, next) {
  try {
    const studentUserId = toPositiveInt(req.session?.userId);
    if (!studentUserId) return res.status(401).json({ error: 'Não autenticado' });

    const { teacherId, studioId, modalityId, startTime, endTime, maxParticipants, notes } = req.body;

    const session = await coachingService.createBooking(
      { teacherId, studioId, modalityId, startTime, endTime, maxParticipants, notes },
      studentUserId
    );

    const parsedTeacherId = toPositiveInt(teacherId);
    if (parsedTeacherId) {
      try {
        const startLabel = startTime
          ? new Date(startTime).toLocaleString('pt-PT', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' })
          : '';
        await sendNotification(req, {
          userId: parsedTeacherId,
          type: 'coaching',
          message: `Nova solicitação de sessão de coaching para ${startLabel}. Sessão #${session.SessionID}.`,
        });
      } catch {
        // Notification failure must not block the booking response
      }
    }

    return res.status(201).json({ session });
  } catch (error) {
    return next(error);
  }
}

async function cancelBooking(req, res, next) {
  try {
    const studentUserId = toPositiveInt(req.session?.userId);
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
    const studentUserId = toPositiveInt(req.session?.userId);
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
    const studentUserId = toPositiveInt(req.session?.userId);
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
  getAvailableSlots,
  getCompatibleStudios,
  getSessionHistory,
  getWeeklyMap,
};
