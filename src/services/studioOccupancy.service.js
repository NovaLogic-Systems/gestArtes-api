const prisma = require('../config/prisma');
const { createHttpError } = require('../utils/http-error');

const APPROVED_STATUS_CANDIDATES = new Set([
  'approved',
  'aprovado',
  'aprovada',
  'validated',
  'validado',
  'validada',
  'confirmed',
  'confirmado',
  'confirmada',
  'teacherapproved',
  'adminapproved',
  'scheduled',
  'agendada',
]);

const NON_BOOKING_STATUS_CANDIDATES = new Set([
  'cancelled',
  'canceled',
  'cancelada',
  'cancelado',
  'rejected',
  'rejeitada',
  'rejeitado',
  'denied',
  'negada',
  'negado',
]);

const BLOCKING_OVERRIDE_STATUSES = new Set(['blocked', 'maintenance', 'unavailable']);
const OCCUPIED_OVERRIDE_STATUSES = new Set(['occupied']);
const ALLOWED_MANUAL_STATUSES = new Set(['available', 'occupied', 'blocked', 'maintenance', 'unavailable']);
const DDMMYYYY_PATTERN = /^(\d{2})-(\d{2})-(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

function normalizeStatusName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}


function parseDateOrDefault(value, fallback) {
  if (!value) {
    return fallback;
  }

  const raw = String(value).trim();
  const ddmmyyyyMatch = raw.match(DDMMYYYY_PATTERN);

  if (ddmmyyyyMatch) {
    const day = Number(ddmmyyyyMatch[1]);
    const month = Number(ddmmyyyyMatch[2]);
    const year = Number(ddmmyyyyMatch[3]);
    const hours = Number(ddmmyyyyMatch[4] || 0);
    const minutes = Number(ddmmyyyyMatch[5] || 0);
    const seconds = Number(ddmmyyyyMatch[6] || 0);

    const parsed = new Date(year, month - 1, day, hours, minutes, seconds, 0);
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.getFullYear() !== year ||
      parsed.getMonth() !== month - 1 ||
      parsed.getDate() !== day
    ) {
      return null;
    }

    return parsed;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function overlaps(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function clampInterval(start, end, windowStart, windowEnd) {
  const clampedStart = start > windowStart ? start : windowStart;
  const clampedEnd = end < windowEnd ? end : windowEnd;

  if (clampedEnd <= clampedStart) {
    return null;
  }

  return {
    start: clampedStart,
    end: clampedEnd,
  };
}

function mergeIntervals(intervals) {
  if (intervals.length === 0) {
    return [];
  }

  const ordered = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged = [ordered[0]];

  for (let i = 1; i < ordered.length; i += 1) {
    const current = ordered[i];
    const last = merged[merged.length - 1];

    if (current.start <= last.end) {
      if (current.end > last.end) {
        last.end = current.end;
      }
      continue;
    }

    merged.push({ start: current.start, end: current.end });
  }

  return merged;
}

function toMinutes(intervals) {
  return Math.round(
    intervals.reduce((total, interval) => total + (interval.end.getTime() - interval.start.getTime()), 0) / 60000
  );
}

function buildTeacherLabel(session) {
  const firstTeacher = session.SessionTeacher?.[0]?.User;
  if (firstTeacher) {
    return {
      userId: firstTeacher.UserID,
      firstName: firstTeacher.FirstName,
      lastName: firstTeacher.LastName,
      fullName: [firstTeacher.FirstName, firstTeacher.LastName].filter(Boolean).join(' ').trim(),
      source: 'teacher',
    };
  }

  const requester = session.User_CoachingSession_RequestedByUserIDToUser;
  if (requester) {
    return {
      userId: requester.UserID,
      firstName: requester.FirstName,
      lastName: requester.LastName,
      fullName: [requester.FirstName, requester.LastName].filter(Boolean).join(' ').trim(),
      source: 'requester',
    };
  }

  return null;
}

function countDoubleBookingConflicts(sessions) {
  const ordered = [...sessions].sort((a, b) => a.StartTime.getTime() - b.StartTime.getTime());
  let count = 0;

  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length; j += 1) {
      if (!overlaps(ordered[i].StartTime, ordered[i].EndTime, ordered[j].StartTime, ordered[j].EndTime)) {
        if (ordered[j].StartTime >= ordered[i].EndTime) {
          break;
        }
        continue;
      }
      count += 1;
    }
  }

  return count;
}

function getActiveOverride(overrides, at) {
  return (
    overrides
      .filter((entry) => entry.IsActive && entry.StartsAt <= at && (!entry.EndsAt || entry.EndsAt > at))
      .sort((a, b) => b.StartsAt.getTime() - a.StartsAt.getTime())[0] || null
  );
}

async function resolveApprovedStatusIds(db) {
  const statuses = await db.sessionStatus.findMany({
    select: {
      StatusID: true,
      StatusName: true,
    },
  });

  const statusIds = statuses
    .filter((status) => {
      const normalized = normalizeStatusName(status.StatusName);
      if (APPROVED_STATUS_CANDIDATES.has(normalized)) {
        return true;
      }

      return normalized.includes('approved') || normalized.includes('validat') || normalized.includes('confirm');
    })
    .map((status) => status.StatusID);

  if (statusIds.length > 0) {
    return statusIds;
  }

  return statuses
    .filter((status) => {
      const normalized = normalizeStatusName(status.StatusName);
      return !NON_BOOKING_STATUS_CANDIDATES.has(normalized);
    })
    .map((status) => status.StatusID);
}

async function fetchOccupancyContext({ start, end }) {
  const approvedStatusIds = await resolveApprovedStatusIds(prisma);

  const [studios, sessions, blocks, overrides] = await Promise.all([
    prisma.studio.findMany({
      orderBy: {
        StudioName: 'asc',
      },
      select: {
        StudioID: true,
        StudioName: true,
        Capacity: true,
      },
    }),
    prisma.coachingSession.findMany({
      where: {
        StatusID: {
          in: approvedStatusIds,
        },
        StartTime: {
          lt: end,
        },
        EndTime: {
          gt: start,
        },
      },
      orderBy: {
        StartTime: 'asc',
      },
      select: {
        SessionID: true,
        StudioID: true,
        StartTime: true,
        EndTime: true,
        SessionTeacher: {
          select: {
            TeacherID: true,
            User: {
              select: {
                UserID: true,
                FirstName: true,
                LastName: true,
              },
            },
          },
          take: 1,
          orderBy: {
            TeacherID: 'asc',
          },
        },
        User_CoachingSession_RequestedByUserIDToUser: {
          select: {
            UserID: true,
            FirstName: true,
            LastName: true,
          },
        },
      },
    }),
    prisma.studioBlock.findMany({
      where: {
        IsActive: true,
        StartsAt: {
          lt: end,
        },
        EndsAt: {
          gt: start,
        },
      },
      select: {
        StudioBlockID: true,
        StudioID: true,
        StartsAt: true,
        EndsAt: true,
        Reason: true,
        BlockType: true,
      },
    }),
    prisma.studioStatusOverride.findMany({
      where: {
        IsActive: true,
        StartsAt: {
          lt: end,
        },
        OR: [
          { EndsAt: null },
          {
            EndsAt: {
              gt: start,
            },
          },
        ],
      },
      select: {
        StudioStatusOverrideID: true,
        StudioID: true,
        Status: true,
        Reason: true,
        StartsAt: true,
        EndsAt: true,
        IsActive: true,
      },
    }),
  ]);

  return {
    studios,
    sessions,
    blocks,
    overrides,
    approvedStatusIds,
  };
}

function buildRealtimeStudioItem(studio, sessions, blocks, overrides, at) {
  const activeSessions = sessions.filter((session) => session.StartTime <= at && session.EndTime > at);
  const activeBlocks = blocks.filter((block) => block.StartsAt <= at && block.EndsAt > at);
  const activeOverride = getActiveOverride(overrides, at);

  const doubleBooking = activeSessions.length > 1;
  const currentSession = activeSessions[0] || null;

  let status = 'available';
  let occupiedUntil = null;
  let currentUser = null;

  if (activeBlocks.length > 0) {
    status = 'blocked';
    occupiedUntil = activeBlocks
      .map((entry) => entry.EndsAt)
      .sort((a, b) => a.getTime() - b.getTime())[0] || null;
  } else if (activeOverride && BLOCKING_OVERRIDE_STATUSES.has(normalizeStatusName(activeOverride.Status))) {
    status = normalizeStatusName(activeOverride.Status);
    occupiedUntil = activeOverride.EndsAt || null;
  } else if (doubleBooking) {
    status = 'double-booked';
    occupiedUntil = activeSessions
      .map((entry) => entry.EndTime)
      .sort((a, b) => a.getTime() - b.getTime())[0] || null;
  } else if (activeSessions.length === 1) {
    status = 'occupied';
    occupiedUntil = currentSession.EndTime;
    currentUser = buildTeacherLabel(currentSession);
  } else if (activeOverride && OCCUPIED_OVERRIDE_STATUSES.has(normalizeStatusName(activeOverride.Status))) {
    status = 'occupied';
    occupiedUntil = activeOverride.EndsAt || null;
  } else if (activeOverride) {
    status = normalizeStatusName(activeOverride.Status);
    occupiedUntil = activeOverride.EndsAt || null;
  }

  if (!currentUser && currentSession) {
    currentUser = buildTeacherLabel(currentSession);
  }

  return {
    studioId: studio.StudioID,
    studioName: studio.StudioName,
    capacity: Number(studio.Capacity || 0),
    status,
    currentUser,
    occupiedUntil,
    activeSessionId: currentSession ? currentSession.SessionID : null,
    activeSessionIds: activeSessions.map((entry) => entry.SessionID),
    activeBlockId: activeBlocks[0]?.StudioBlockID || null,
    activeOverrideId: activeOverride?.StudioStatusOverrideID || null,
    activeOverrideStatus: activeOverride?.Status || null,
  };
}

async function getStudioOccupancyRealTime({ at }) {
  const now = parseDateOrDefault(at, new Date());
  if (!now) {
    throw createHttpError(400, 'Parâmetro de data/hora inválido');
  }

  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const { studios, sessions, blocks, overrides } = await fetchOccupancyContext({
    start: windowStart,
    end: windowEnd,
  });

  const items = studios.map((studio) => {
    const studioSessions = sessions.filter((entry) => entry.StudioID === studio.StudioID);
    const studioBlocks = blocks.filter((entry) => entry.StudioID === studio.StudioID);
    const studioOverrides = overrides.filter((entry) => entry.StudioID === studio.StudioID);

    return buildRealtimeStudioItem(studio, studioSessions, studioBlocks, studioOverrides, now);
  });

  const alerts = items
    .filter((item) => item.activeSessionIds.length > 1)
    .map((item) => ({
      type: 'DOUBLE_BOOKING',
      studioId: item.studioId,
      studioName: item.studioName,
      conflictingSessionIds: item.activeSessionIds,
      severity: 'high',
    }));

  const occupiedStudios = items.filter((item) => item.status === 'occupied' || item.status === 'double-booked').length;
  const blockedStudios = items.filter((item) => item.status === 'blocked' || item.status === 'maintenance' || item.status === 'unavailable').length;
  const availableStudios = Math.max(items.length - occupiedStudios - blockedStudios, 0);

  return {
    generatedAt: now,
    summary: {
      totalStudios: items.length,
      occupiedStudios,
      blockedStudios,
      availableStudios,
      occupancyRate: items.length > 0 ? Number(((occupiedStudios / items.length) * 100).toFixed(2)) : 0,
      doubleBookingAlerts: alerts.length,
    },
    alerts,
    studios: items,
  };
}

async function getStudioOccupancyForecast({ from, to }) {
  const windowStart = parseDateOrDefault(from, new Date());
  if (!windowStart) {
    throw createHttpError(400, 'Parâmetro from inválido');
  }

  const defaultWindowEnd = new Date(windowStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const windowEnd = parseDateOrDefault(to, defaultWindowEnd);

  if (!windowEnd || windowEnd <= windowStart) {
    throw createHttpError(400, 'Parâmetro to inválido');
  }

  const { studios, sessions, blocks, overrides } = await fetchOccupancyContext({
    start: windowStart,
    end: windowEnd,
  });

  const totalMinutes = Math.round((windowEnd.getTime() - windowStart.getTime()) / 60000);
  let totalDoubleBookingConflicts = 0;

  const byStudio = studios.map((studio) => {
    const studioSessions = sessions.filter((entry) => entry.StudioID === studio.StudioID);
    const studioBlocks = blocks.filter((entry) => entry.StudioID === studio.StudioID);
    const studioOverrides = overrides.filter((entry) => entry.StudioID === studio.StudioID);

    const sessionIntervals = mergeIntervals(
      studioSessions
        .map((entry) => clampInterval(entry.StartTime, entry.EndTime, windowStart, windowEnd))
        .filter(Boolean)
    );

    const blockedIntervals = mergeIntervals([
      ...studioBlocks
        .map((entry) => clampInterval(entry.StartsAt, entry.EndsAt, windowStart, windowEnd))
        .filter(Boolean),
      ...studioOverrides
        .filter((entry) => BLOCKING_OVERRIDE_STATUSES.has(normalizeStatusName(entry.Status)))
        .map((entry) => clampInterval(entry.StartsAt, entry.EndsAt || windowEnd, windowStart, windowEnd))
        .filter(Boolean),
    ]);

    const manualOccupiedIntervals = mergeIntervals(
      studioOverrides
        .filter((entry) => OCCUPIED_OVERRIDE_STATUSES.has(normalizeStatusName(entry.Status)))
        .map((entry) => clampInterval(entry.StartsAt, entry.EndsAt || windowEnd, windowStart, windowEnd))
        .filter(Boolean)
    );

    const occupiedIntervals = mergeIntervals([...sessionIntervals, ...manualOccupiedIntervals]);

    const scheduledMinutes = toMinutes(sessionIntervals);
    const blockedMinutes = toMinutes(blockedIntervals);
    const occupiedMinutes = toMinutes(occupiedIntervals);

    const availableMinutes = Math.max(totalMinutes - blockedMinutes, 0);
    const idleMinutes = Math.max(availableMinutes - occupiedMinutes, 0);

    const doubleBookingConflicts = countDoubleBookingConflicts(studioSessions);
    totalDoubleBookingConflicts += doubleBookingConflicts;

    return {
      studioId: studio.StudioID,
      studioName: studio.StudioName,
      capacity: Number(studio.Capacity || 0),
      totalWindowMinutes: totalMinutes,
      scheduledMinutes,
      blockedMinutes,
      occupiedMinutes,
      idleMinutes,
      utilizationRate: availableMinutes > 0 ? Number(((occupiedMinutes / availableMinutes) * 100).toFixed(2)) : 0,
      occupancyRate: totalMinutes > 0 ? Number(((occupiedMinutes / totalMinutes) * 100).toFixed(2)) : 0,
      doubleBookingConflicts,
      upcomingSessions: studioSessions
        .sort((a, b) => a.StartTime.getTime() - b.StartTime.getTime())
        .map((entry) => ({
          sessionId: entry.SessionID,
          startTime: entry.StartTime,
          endTime: entry.EndTime,
          currentUser: buildTeacherLabel(entry),
        })),
    };
  });

  return {
    generatedAt: new Date(),
    from: windowStart,
    to: windowEnd,
    summary: {
      totalStudios: byStudio.length,
      totalDoubleBookingConflicts,
      averageUtilizationRate: byStudio.length > 0
        ? Number((byStudio.reduce((sum, item) => sum + item.utilizationRate, 0) / byStudio.length).toFixed(2))
        : 0,
      averageOccupancyRate: byStudio.length > 0
        ? Number((byStudio.reduce((sum, item) => sum + item.occupancyRate, 0) / byStudio.length).toFixed(2))
        : 0,
    },
    studios: byStudio,
  };
}

async function blockStudio({ studioId, startsAt, endsAt, reason, blockType, userId }) {
  if (!Number.isInteger(studioId) || studioId <= 0) {
    throw createHttpError(400, 'StudioID inválido');
  }

  if (!Number.isInteger(userId) || userId <= 0) {
    throw createHttpError(401, 'Not authenticated');
  }

  const start = parseDateOrDefault(startsAt, null);
  const end = parseDateOrDefault(endsAt, null);

  if (!start || !end || end <= start) {
    throw createHttpError(400, 'Intervalo de bloqueio inválido');
  }

  const studio = await prisma.studio.findUnique({
    where: {
      StudioID: studioId,
    },
    select: {
      StudioID: true,
      StudioName: true,
    },
  });

  if (!studio) {
    throw createHttpError(404, 'Studio not found');
  }

  const approvedStatusIds = await resolveApprovedStatusIds(prisma);

  const conflictingSessions = await prisma.coachingSession.findMany({
    where: {
      StudioID: studioId,
      StatusID: {
        in: approvedStatusIds,
      },
      StartTime: {
        lt: end,
      },
      EndTime: {
        gt: start,
      },
    },
    select: {
      SessionID: true,
      StartTime: true,
      EndTime: true,
    },
    orderBy: {
      StartTime: 'asc',
    },
  });

  const created = await prisma.studioBlock.create({
    data: {
      StudioID: studioId,
      StartsAt: start,
      EndsAt: end,
      Reason: reason || null,
      BlockType: blockType || 'maintenance',
      CreatedByUserID: userId,
      CreatedAt: new Date(),
      IsActive: true,
    },
    select: {
      StudioBlockID: true,
      StudioID: true,
      StartsAt: true,
      EndsAt: true,
      Reason: true,
      BlockType: true,
      CreatedByUserID: true,
      CreatedAt: true,
      IsActive: true,
    },
  });

  return {
    block: created,
    studio,
    alerts: conflictingSessions.length > 0
      ? [{
          type: 'BLOCK_CONFLICT',
          studioId,
          studioName: studio.StudioName,
          conflictingSessionIds: conflictingSessions.map((entry) => entry.SessionID),
          severity: 'high',
        }]
      : [],
  };
}

async function updateStudioStatus({ studioId, status, reason, startsAt, endsAt, userId }) {
  if (!Number.isInteger(studioId) || studioId <= 0) {
    throw createHttpError(400, 'StudioID inválido');
  }

  if (!Number.isInteger(userId) || userId <= 0) {
    throw createHttpError(401, 'Not authenticated');
  }

  const normalizedStatus = normalizeStatusName(status);
  if (!ALLOWED_MANUAL_STATUSES.has(normalizedStatus)) {
    throw createHttpError(400, 'Estado manual inválido');
  }

  const start = parseDateOrDefault(startsAt, new Date());
  if (!start) {
    throw createHttpError(400, 'Parâmetro startsAt inválido');
  }

  const end = endsAt ? parseDateOrDefault(endsAt, null) : null;
  if (endsAt && (!end || end <= start)) {
    throw createHttpError(400, 'Parâmetro endsAt inválido');
  }

  const studio = await prisma.studio.findUnique({
    where: {
      StudioID: studioId,
    },
    select: {
      StudioID: true,
      StudioName: true,
    },
  });

  if (!studio) {
    throw createHttpError(404, 'Studio not found');
  }

  const now = new Date();

  await prisma.studioStatusOverride.updateMany({
    where: {
      StudioID: studioId,
      IsActive: true,
      OR: [
        { EndsAt: null },
        {
          EndsAt: {
            gt: now,
          },
        },
      ],
    },
    data: {
      IsActive: false,
      EndsAt: now,
      UpdatedAt: now,
    },
  });

  if (normalizedStatus === 'available') {
    return {
      studio,
      statusOverride: null,
      alerts: [],
    };
  }

  const statusOverride = await prisma.studioStatusOverride.create({
    data: {
      StudioID: studioId,
      Status: normalizedStatus,
      Reason: reason || null,
      StartsAt: start,
      EndsAt: end,
      SetByUserID: userId,
      CreatedAt: now,
      UpdatedAt: now,
      IsActive: true,
    },
    select: {
      StudioStatusOverrideID: true,
      StudioID: true,
      Status: true,
      Reason: true,
      StartsAt: true,
      EndsAt: true,
      SetByUserID: true,
      CreatedAt: true,
      IsActive: true,
    },
  });

  const shouldCheckConflicts = BLOCKING_OVERRIDE_STATUSES.has(normalizedStatus);
  let alerts = [];

  if (shouldCheckConflicts) {
    const approvedStatusIds = await resolveApprovedStatusIds(prisma);
    const conflictEnd = end || new Date(start.getTime() + 24 * 60 * 60 * 1000);

    const conflictingSessions = await prisma.coachingSession.findMany({
      where: {
        StudioID: studioId,
        StatusID: {
          in: approvedStatusIds,
        },
        StartTime: {
          lt: conflictEnd,
        },
        EndTime: {
          gt: start,
        },
      },
      select: {
        SessionID: true,
      },
    });

    if (conflictingSessions.length > 0) {
      alerts = [{
        type: 'STATUS_OVERRIDE_CONFLICT',
        studioId,
        studioName: studio.StudioName,
        conflictingSessionIds: conflictingSessions.map((entry) => entry.SessionID),
        severity: 'high',
      }];
    }
  }

  return {
    studio,
    statusOverride,
    alerts,
  };
}

module.exports = {
  getStudioOccupancyRealTime,
  getStudioOccupancyForecast,
  blockStudio,
  updateStudioStatus,
};
