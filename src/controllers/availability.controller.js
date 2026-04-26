const {
  createException,
  getAvailability,
  getPendingExceptions,
  submitAvailability,
  updateAvailability,
} = require('../services/availability.service');
const { getTeacherAvailabilityCounters } = require('../services/availabilityCounters.service');
const { emitAvailabilityCounter } = require('../events/availability.events');

function getAuthenticatedTeacherUserId(req, res) {
  const userId = Number(req.session?.userId);
  const role = String(req.session?.role || '').trim().toLowerCase();

  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }

  if (role !== 'teacher') {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }

  return userId;
}

function parseAvailabilityId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function submitTeacherAvailability(req, res, next) {
  try {
    const teacherUserId = getAuthenticatedTeacherUserId(req, res);

    if (!teacherUserId) {
      return;
    }

    const result = await submitAvailability(teacherUserId, req.body);
    await emitAvailabilitySummary(req, teacherUserId);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

async function listTeacherAvailability(req, res, next) {
  try {
    const teacherUserId = getAuthenticatedTeacherUserId(req, res);

    if (!teacherUserId) {
      return;
    }

    const result = await getAvailability(teacherUserId);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function updateTeacherAvailability(req, res, next) {
  try {
    const teacherUserId = getAuthenticatedTeacherUserId(req, res);

    if (!teacherUserId) {
      return;
    }

    const availabilityId = parseAvailabilityId(req.params?.availabilityId);

    if (!availabilityId) {
      res.status(400).json({ error: 'Invalid availabilityId' });
      return;
    }

    const result = await updateAvailability(teacherUserId, availabilityId, req.body);
    await emitAvailabilitySummary(req, teacherUserId);
    res.json({ availability: result });
  } catch (error) {
    next(error);
  }
}

async function createTeacherException(req, res, next) {
  try {
    const teacherUserId = getAuthenticatedTeacherUserId(req, res);

    if (!teacherUserId) {
      return;
    }

    const result = await createException(teacherUserId, req.body);
    await emitAvailabilitySummary(req, teacherUserId);
    res.status(201).json({ exception: result });
  } catch (error) {
    next(error);
  }
}

async function emitAvailabilitySummary(req, teacherUserId) {
  const io = req.app.get('io');

  if (!io) {
    return;
  }

  const payload = await getTeacherAvailabilityCounters(teacherUserId);
  emitAvailabilityCounter(io, teacherUserId, payload);
}

async function listPendingTeacherExceptions(req, res, next) {
  try {
    const teacherUserId = getAuthenticatedTeacherUserId(req, res);

    if (!teacherUserId) {
      return;
    }

    const result = await getPendingExceptions(teacherUserId);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createTeacherException,
  listPendingTeacherExceptions,
  listTeacherAvailability,
  submitTeacherAvailability,
  updateTeacherAvailability,
};