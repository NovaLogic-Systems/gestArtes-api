const fs = require('node:fs');
const readline = require('node:readline');
const path = require('node:path');

const LOG_FILE_PATH = path.join(process.cwd(), 'logs', 'audit.log');

function createAuditService() {
  async function _readAllEvents(predicate = null) {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(LOG_FILE_PATH)) {
        return resolve([]);
      }

      const events = [];
      const fileStream = fs.createReadStream(LOG_FILE_PATH, { encoding: 'utf8' });
      const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

      rl.on('line', (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.category === 'audit' && (!predicate || predicate(parsed))) {
            events.push(parsed);
          }
        } catch {
          // skip malformed lines
        }
      });

      rl.on('close', () => resolve(events));
      fileStream.on('error', reject);
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
    const start = periodStart ? new Date(periodStart) : null;
    const end = periodEnd ? new Date(periodEnd) : null;

    const predicate = (e) => {
      const ts = new Date(e.auditTimestamp);
      if (start && ts < start) return false;
      if (end && ts > end) return false;
      if (module && e.module !== module) return false;
      if (action && e.action !== action) return false;
      if (userId !== undefined && e.userId !== userId) return false;
      if (result && e.result !== result) return false;
      return true;
    };

    const filtered = await _readAllEvents(predicate);
    filtered.sort((a, b) => new Date(b.auditTimestamp) - new Date(a.auditTimestamp));

    const total = filtered.length;
    const items = filtered.slice(offset, offset + limit).map((e) => ({
      timestamp: e.auditTimestamp,
      userId: e.userId,
      userName: e.userName,
      userRole: e.userRole,
      action: e.action,
      module: e.module,
      targetType: e.targetType,
      targetId: e.targetId,
      result: e.result,
      detail: e.detail,
    }));

    return { items, total, limit, offset };
  }

  async function getSummary({ periodStart, periodEnd } = {}) {
    const start = periodStart ? new Date(periodStart) : null;
    const end = periodEnd ? new Date(periodEnd) : null;

    const periodPredicate = start || end
      ? (e) => {
          const ts = new Date(e.auditTimestamp);
          if (start && ts < start) return false;
          if (end && ts > end) return false;
          return true;
        }
      : null;

    const filtered = await _readAllEvents(periodPredicate);

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last24h = filtered.filter((e) => new Date(e.auditTimestamp) >= yesterday).length;

    const byModule = {};
    const byResult = { success: 0, failure: 0 };

    for (const e of filtered) {
      byModule[e.module] = (byModule[e.module] ?? 0) + 1;
      if (e.result === 'success') byResult.success += 1;
      else if (e.result === 'failure') byResult.failure += 1;
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
