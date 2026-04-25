const prisma = require('../config/prisma');

const ADMIN_DASHBOARD_SOCKET_EVENT = 'admin:dashboard:update';

function normalizeStatusName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function toNumber(value) {
  if (value == null) {
    return 0;
  }

  if (typeof value === 'bigint') {
    return Number(value);
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getCurrentMonthRange(referenceDate = new Date()) {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));

  return { start, end };
}

async function getPendingJoinRequestStatusIds() {
  const statuses = await prisma.coachingJoinRequestStatus.findMany({
    select: {
      StatusID: true,
      StatusName: true,
    },
  });

  return statuses
    .filter((status) => normalizeStatusName(status.StatusName).includes('pending'))
    .map((status) => status.StatusID);
}

async function getPendingAvailabilityStatusIds() {
  const statuses = await prisma.teacherAvailabilityStatus.findMany({
    select: {
      StatusID: true,
      StatusName: true,
    },
  });

  return statuses
    .filter((status) => normalizeStatusName(status.StatusName).includes('pending'))
    .map((status) => status.StatusID);
}

async function getMonthlyRevenue(referenceDate = new Date()) {
  const { start, end } = getCurrentMonthRange(referenceDate);

  const aggregation = await prisma.financialEntry.aggregate({
    _sum: {
      Amount: true,
    },
    where: {
      CreatedAt: {
        gte: start,
        lt: end,
      },
      FinancialEntryType: {
        TypeName: 'SESSION',
      },
    },
  });

  return Number(toNumber(aggregation?._sum?.Amount).toFixed(2));
}

async function getStudioOccupancyHeatmap(referenceDate = new Date()) {
  const studios = await prisma.studio.findMany({
    include: {
      StudioModality: {
        include: {
          Modality: {
            select: {
              ModalityName: true,
            },
          },
        },
      },
    },
    orderBy: {
      StudioName: 'asc',
    },
  });

  const activeSessions = await prisma.coachingSession.findMany({
    where: {
      StartTime: {
        lte: referenceDate,
      },
      EndTime: {
        gte: referenceDate,
      },
    },
    select: {
      StudioID: true,
      _count: {
        select: {
          SessionStudent: true,
        },
      },
    },
  });

  const sessionByStudio = new Map();

  for (const session of activeSessions) {
    const studioId = session.StudioID;
    const current = sessionByStudio.get(studioId) || {
      activeSessions: 0,
      enrolledStudents: 0,
    };

    current.activeSessions += 1;
    current.enrolledStudents += toNumber(session._count?.SessionStudent);
    sessionByStudio.set(studioId, current);
  }

  return studios.map((studio) => {
    const occupancy = sessionByStudio.get(studio.StudioID) || {
      activeSessions: 0,
      enrolledStudents: 0,
    };

    const capacity = Math.max(0, toNumber(studio.Capacity));
    const occupancyPercentage = capacity > 0
      ? Math.min(100, Math.round((occupancy.enrolledStudents / capacity) * 100))
      : 0;

    let status = 'available';
    if (occupancyPercentage >= 90) {
      status = 'near_full';
    } else if (occupancyPercentage >= 60) {
      status = 'stable';
    } else if (occupancyPercentage > 0) {
      status = 'low_usage';
    }

    return {
      studioId: studio.StudioID,
      studioName: studio.StudioName,
      capacity,
      activeSessions: occupancy.activeSessions,
      enrolledStudents: occupancy.enrolledStudents,
      occupancyPercentage,
      status,
      modalities: studio.StudioModality.map((entry) => entry.Modality.ModalityName),
    };
  });
}

async function getManagementNotices(limit = 5) {
  const notices = await prisma.notification.findMany({
    where: {
      UserID: 0,
    },
    orderBy: {
      CreatedAt: 'desc',
    },
    take: limit,
    select: {
      NotificationID: true,
      Title: true,
      Message: true,
      CreatedAt: true,
    },
  });

  return notices.map((notice) => ({
    notificationId: notice.NotificationID,
    title: notice.Title,
    message: notice.Message,
    createdAt: notice.CreatedAt,
  }));
}

async function getAdminDashboardSnapshot(referenceDate = new Date()) {
  const pendingJoinRequestStatusIds = await getPendingJoinRequestStatusIds();
  const pendingAvailabilityStatusIds = await getPendingAvailabilityStatusIds();

  const [
    pendingRequests,
    pendingValidations,
    pendingSubmissions,
    totalClassesHeld,
    monthlyRevenue,
    studioOccupancyHeatmap,
    managementNotices,
  ] = await Promise.all([
    pendingJoinRequestStatusIds.length > 0
      ? prisma.coachingJoinRequest.count({
          where: {
            StatusID: {
              in: pendingJoinRequestStatusIds,
            },
          },
        })
      : 0,
    prisma.coachingSession.count({
      where: {
        ValidationRequestedAt: {
          not: null,
        },
        SessionValidation: {
          none: {},
        },
      },
    }),
    pendingAvailabilityStatusIds.length > 0
      ? prisma.teacherAvailability.count({
          where: {
            StatusID: {
              in: pendingAvailabilityStatusIds,
            },
          },
        })
      : prisma.teacherAvailability.count({
          where: {
            ReviewedAt: null,
          },
        }),
    prisma.coachingSession.count({
      where: {
        EndTime: {
          lt: referenceDate,
        },
      },
    }),
    getMonthlyRevenue(referenceDate),
    getStudioOccupancyHeatmap(referenceDate),
    getManagementNotices(),
  ]);

  return {
    generatedAt: referenceDate,
    kpis: {
      pendingRequests,
      pendingValidations,
      pendingSubmissions,
      monthlyRevenue,
      totalClassesHeld,
    },
    studioOccupancyHeatmap,
    managementNotices,
  };
}

async function emitAdminDashboardUpdate(io) {
  if (!io) {
    return null;
  }

  const snapshot = await getAdminDashboardSnapshot();
  io.to('broadcast:admin').emit(ADMIN_DASHBOARD_SOCKET_EVENT, snapshot);
  return snapshot;
}

module.exports = {
  ADMIN_DASHBOARD_SOCKET_EVENT,
  getAdminDashboardSnapshot,
  emitAdminDashboardUpdate,
  getStudioOccupancyHeatmap,
};
