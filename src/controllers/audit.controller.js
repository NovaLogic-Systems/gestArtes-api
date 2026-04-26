const { createAuditService } = require('../services/audit.service');

const auditService = createAuditService();

async function listEvents(req, res, next) {
  try {
    const { periodStart, periodEnd, module, action, userId, result, limit, offset } = req.query;
    const data = await auditService.listEvents({
      periodStart,
      periodEnd,
      module,
      action,
      userId,
      result,
      limit: limit ?? 100,
      offset: offset ?? 0,
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function getSummary(req, res, next) {
  try {
    const { periodStart, periodEnd } = req.query;
    const data = await auditService.getSummary({ periodStart, periodEnd });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = { listEvents, getSummary };
