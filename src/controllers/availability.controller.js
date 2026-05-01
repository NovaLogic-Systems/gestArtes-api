/**
 * @file src/controllers/availability.controller.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const {
  createException,
  getAvailability,
  getPendingExceptions,
  listPendingAvailabilityForAdmin,
  reviewAvailability,
  submitAvailability,
  updateAvailability,
} = require('../services/availability.service');
const { getTeacherAvailabilityCounters } = require('../services/availabilityCounters.service');
const { emitAvailabilityCounter } = require('../events/availability.events');
const { createAvailabilityUseCases } = require('../application/use-cases/availability');
const logger = require('../utils/logger');

const availabilityService = require('../services/availability.service');
const availabilityUseCases = createAvailabilityUseCases({ availabilityService });

function getAuthenticatedTeacherUserId(req, res) {
  const userId = Number(req.auth?.userId);
  const role = String(req.auth?.role || '').trim().toLowerCase();

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

    const { summary, availability } = await availabilityUseCases.submitAvailability.execute({
      req,
      teacherUserId,
      payload: req.body,
    });
    await emitAvailabilitySummary(req, teacherUserId);
    res.status(201).json({ summary, availability });
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

function getAuthenticatedAdminUserId(req, res) {
  const userId = Number(req.auth?.userId);
  const role = String(req.auth?.role || '').trim().toLowerCase();

  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }

  if (role !== 'admin') {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }

  return userId;
}

async function listAdminPendingAvailability(req, res, next) {
  try {
    const adminUserId = getAuthenticatedAdminUserId(req, res);

    if (!adminUserId) {
      return;
    }

    const availability = await listPendingAvailabilityForAdmin();
    res.json({ availability });
  } catch (error) {
    next(error);
  }
}

async function approveAvailability(req, res, next) {
  try {
    const adminUserId = getAuthenticatedAdminUserId(req, res);

    if (!adminUserId) {
      return;
    }

    const availabilityId = parseAvailabilityId(req.params?.availabilityId);

    if (!availabilityId) {
      res.status(400).json({ error: 'Invalid availabilityId' });
      return;
    }

    const { availability } = await availabilityUseCases.reviewAvailability.execute({
      req,
      adminUserId,
      payload: {
        availabilityId,
        decision: 'approve',
        reviewNotes: req.body?.reviewNotes ?? null,
      },
    });

    res.json({ availability });
  } catch (error) {
    next(error);
  }
}

async function rejectAvailability(req, res, next) {
  try {
    const adminUserId = getAuthenticatedAdminUserId(req, res);

    if (!adminUserId) {
      return;
    }

    const availabilityId = parseAvailabilityId(req.params?.availabilityId);

    if (!availabilityId) {
      res.status(400).json({ error: 'Invalid availabilityId' });
      return;
    }

    const { availability } = await availabilityUseCases.reviewAvailability.execute({
      req,
      adminUserId,
      payload: {
        availabilityId,
        decision: 'reject',
        reviewNotes: req.body?.reviewNotes ?? null,
      },
    });
    res.json({ availability });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  approveAvailability,
  createTeacherException,
  listAdminPendingAvailability,
  listPendingTeacherExceptions,
  listTeacherAvailability,
  rejectAvailability,
  submitTeacherAvailability,
  updateTeacherAvailability,
};
