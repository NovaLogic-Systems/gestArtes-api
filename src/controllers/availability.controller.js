/**
 * @file src/controllers/availability.controller.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const prisma = require('../config/prisma');
const {
  cancelAvailability,
  createException,
  getAvailability,
  getPendingExceptions,
  listPendingAbsencesForAdmin,
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
const notificationService = require('../services/notification.service');

function formatDateTime(value) {
  if (!value) {
    return '—';
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }

  return parsed.toLocaleString('pt-PT', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

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
    // Notify all admins about the new availability submission
    try {
      const teacher = await prisma.user.findUnique({ where: { UserID: teacherUserId }, select: { FirstName: true, LastName: true, Email: true } });
      const teacherName = teacher ? `${teacher.FirstName || ''} ${teacher.LastName || ''}`.trim() || teacher.Email : `Professor #${teacherUserId}`;
      const title = 'Novo pedido de disponibilidade'
      const message = `${teacherName} submeteu um pedido de disponibilidade (${summary?.totalSlots ?? 0} slots).`;

      const admins = await prisma.user.findMany({
        where: {
          IsActive: true,
          UserRole: { some: { Role: { RoleName: 'admin' } } },
        },
        select: { UserID: true },
      });

      const io = req.app.get('io');

      await Promise.all(admins.map(async (a) => {
        try {
          const notif = await notificationService.create(a.UserID, message, title);
          if (io) {
            io.to(`user:${a.UserID}`).emit('notification', notif);
          }
        } catch (err) {
          logger.warn('[Availability] failed to notify admin', { adminId: a.UserID, err: err?.message });
        }
      }));
    } catch (err) {
      logger.warn('[Availability] admin notification failed', { err: err?.message });
    }
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

async function cancelTeacherAvailability(req, res, next) {
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

    await cancelAvailability(teacherUserId, availabilityId);
    await emitAvailabilitySummary(req, teacherUserId);
    res.json({ success: true });
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

    try {
      const teacher = await prisma.user.findUnique({
        where: { UserID: teacherUserId },
        select: { FirstName: true, LastName: true, Email: true },
      });

      const teacherName = teacher
        ? `${teacher.FirstName || ''} ${teacher.LastName || ''}`.trim() || teacher.Email
        : `Professor #${teacherUserId}`;
      const title = 'Nova ausência submetida';
      const message = `${teacherName} reportou uma ausência (${formatDateTime(result?.startDate)} - ${formatDateTime(result?.endDate)}).`;

      const admins = await prisma.user.findMany({
        where: {
          IsActive: true,
          UserRole: { some: { Role: { RoleName: 'admin' } } },
        },
        select: { UserID: true },
      });

      const io = req.app.get('io');

      await Promise.all(admins.map(async (admin) => {
        try {
          const notification = await notificationService.create(admin.UserID, message, title, 'schedule');
          if (io) {
            io.to(`user:${admin.UserID}`).emit('notification', notification);
          }
        } catch (err) {
          logger.warn('[Availability] failed to notify admin about absence', { adminId: admin.UserID, err: err?.message });
        }
      }));
    } catch (err) {
      logger.warn('[Availability] absence admin notification failed', { err: err?.message });
    }

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

async function listAdminPendingAbsences(req, res, next) {
  try {
    const adminUserId = getAuthenticatedAdminUserId(req, res);

    if (!adminUserId) {
      return;
    }

    const absences = await listPendingAbsencesForAdmin();
    res.json({ absences });
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

async function getTeacherCalendar(req, res, next) {
  try {
    const teacherUserId = getAuthenticatedTeacherUserId(req, res);

    if (!teacherUserId) {
      return;
    }

    // Fetch teacher's availability records and convert to UI slots
    const result = await getAvailability(teacherUserId);
    const { TeacherAvailabilityStatus } = prisma;

    // Get status names for mapping
    const statuses = await TeacherAvailabilityStatus.findMany({
      select: { StatusID: true, StatusName: true }
    });

    const statusMap = new Map(statuses.map(s => [s.StatusID, s.StatusName.toLowerCase()]));

    // Build slots array for 7 days × 13 hours (8-20)
    const slots = [];
    const hourRange = Array.from({ length: 13 }, (_, i) => i + 8);
    const dayOfWeekRange = Array.from({ length: 7 }, (_, i) => i);

    // For each day/hour combination, create a slot entry
    if (result && result.availability && Array.isArray(result.availability)) {
      // Mark approved/pending slots based on availability records
      for (const record of result.availability) {
        const statusName = statusMap.get(record.StatusID) || 'pending';

        // Handle recurring (weekly) availability
        if (record.RecurringSlot) {
          const slot = record.RecurringSlot;
          const dayOfWeek = slot.DayOfWeek; // 0-6

          // Calculate hours from StartTime and EndTime
          if (slot.StartTime && slot.EndTime) {
            const startHour = new Date(slot.StartTime).getHours();
            const endHour = new Date(slot.EndTime).getHours();

            for (let hour = startHour; hour < endHour && hour < 21; hour++) {
                slots.push({
                  day: dayOfWeek,
                  hour,
                  status: statusName,
                  availabilityId: record.AvailabilityID,
                  reason: record.Reason
                });
            }
          }
        }
      }
    }

    // Return slots array (frontend will visualize this)
    res.json({
      slots: slots.length > 0 ? slots : generateEmptySlots()
    });
  } catch (error) {
    next(error);
  }
}

function generateEmptySlots() {
  // Return empty calendar for initial load
  const slots = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 8; hour < 21; hour++) {
      slots.push({
        day,
        hour,
        status: 'available'
      });
    }
  }
  return slots;
}

module.exports = {
  cancelTeacherAvailability,
  approveAvailability,
  createTeacherException,
  getTeacherCalendar,
  listAdminPendingAvailability,
  listAdminPendingAbsences,
  listPendingTeacherExceptions,
  listTeacherAvailability,
  rejectAvailability,
  submitTeacherAvailability,
  updateTeacherAvailability,
};
