/**
 * @file src/services/audit.service.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const prisma = require('../config/prisma');

function createAuditService() {
  async function _readAllEvents(where = {}) {
    return prisma.auditLog.findMany({
      where,
      include: {
        User: {
          select: {
            UserID: true,
            FirstName: true,
            LastName: true,
            Email: true,
            UserRole: {
              select: {
                Role: {
                  select: {
                    RoleName: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        AuditTimestamp: 'desc',
      },
    });
  }

  function mapAuditUserName(entry) {
    const user = entry.User;
    const fullName = [user?.FirstName, user?.LastName].filter(Boolean).join(' ').trim();
    return fullName || user?.Email || entry.UserName || null;
  }

  function mapAuditUserRole(entry) {
    const roles = entry.User?.UserRole
      ?.map((userRole) => userRole.Role?.RoleName)
      .filter(Boolean);

    return roles?.length ? roles.join(', ') : entry.UserRole || null;
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
    if (end) end.setHours(23, 59, 59, 999);

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
      userName: mapAuditUserName(e),
      userEmail: e.User?.Email || null,
      userRole: mapAuditUserRole(e),
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
    if (end) end.setHours(23, 59, 59, 999);

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
