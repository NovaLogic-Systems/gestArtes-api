const prisma = require('../config/prisma');

function createAuditService() {
  async function _readAllEvents(where = {}) {
    return prisma.auditLog.findMany({
      where,
      orderBy: {
        AuditTimestamp: 'desc',
      },
    });
  }

  async function listEvents({
    periodStart,
    periodEnd,
    module,
    action,
    userId,
    result,
    limit = 100,
    offset = 0,
  } = {}) {
    const parsedUserId = userId === undefined || userId === null || userId === '' ? null : Number(userId);
    const parsedLimit = Number(limit);
    const parsedOffset = Number(offset);
    const start = periodStart ? new Date(periodStart) : null;
    const end = periodEnd ? new Date(periodEnd) : null;

    const where = {
      ...(start || end
        ? {
            AuditTimestamp: {
              ...(start ? { gte: start } : {}),
              ...(end ? { lte: end } : {}),
            },
          }
        : {}),
      ...(module ? { Module: module } : {}),
      ...(action ? { Action: action } : {}),
      ...(Number.isFinite(parsedUserId) ? { UserID: parsedUserId } : {}),
      ...(result ? { Result: result } : {}),
    };

    const filtered = await _readAllEvents(where);

    const total = filtered.length;
    const startIndex = Number.isFinite(parsedOffset) ? Math.max(0, parsedOffset) : 0;
    const pageSize = Number.isFinite(parsedLimit) ? Math.max(0, parsedLimit) : 100;
    const items = filtered.slice(startIndex, startIndex + pageSize).map((e) => ({
      timestamp: e.AuditTimestamp,
      userId: e.UserID,
      userName: e.UserName,
      userRole: e.UserRole,
      action: e.Action,
      module: e.Module,
      targetType: e.TargetType,
      targetId: e.TargetID,
      result: e.Result,
      detail: e.Detail,
    }));

    return { items, total, limit: pageSize, offset: startIndex };
  }

  async function getSummary({ periodStart, periodEnd } = {}) {
    const start = periodStart ? new Date(periodStart) : null;
    const end = periodEnd ? new Date(periodEnd) : null;

    const where = {
      ...(start || end
        ? {
            AuditTimestamp: {
              ...(start ? { gte: start } : {}),
              ...(end ? { lte: end } : {}),
            },
          }
        : {}),
    };

    const filtered = await _readAllEvents(where);

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last24h = filtered.filter((e) => new Date(e.AuditTimestamp) >= yesterday).length;

    const byModule = {};
    const byResult = { success: 0, failure: 0 };

    for (const e of filtered) {
      byModule[e.Module] = (byModule[e.Module] ?? 0) + 1;
      if (e.Result === 'success') byResult.success += 1;
      else if (e.Result === 'failure') byResult.failure += 1;
    }

    return {
      auditedActionsLast24h: last24h,
      total: filtered.length,
      byModule,
      byResult,
    };
  }

  return { listEvents, getSummary };
}

module.exports = { createAuditService };
