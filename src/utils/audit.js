const logger = require('./logger');

const AUDIT_ACTIONS = Object.freeze({
  FINANCE_EXPORT: 'FINANCE_EXPORT',
  NOSHOW_PENALTY_APPLIED: 'NOSHOW_PENALTY_APPLIED',
  SESSION_FINALIZED: 'SESSION_FINALIZED',
  SESSION_CANCELLED: 'SESSION_CANCELLED',
  VALIDATION_APPROVED: 'VALIDATION_APPROVED',
  VALIDATION_REJECTED: 'VALIDATION_REJECTED',
  LOSTFOUND_CLAIMED: 'LOSTFOUND_CLAIMED',
  LOSTFOUND_ARCHIVED: 'LOSTFOUND_ARCHIVED',
  MARKETPLACE_HIDDEN: 'MARKETPLACE_HIDDEN',
  USER_PASSWORD_RESET: 'USER_PASSWORD_RESET',
});

const AUDIT_MODULES = Object.freeze({
  FINANCE: 'finance',
  COACHING: 'coaching',
  VALIDATIONS: 'validations',
  MARKETPLACE: 'marketplace',
  LOSTFOUND: 'lostfound',
  USERS: 'users',
  SYSTEM: 'system',
});

const AUDIT_RESULTS = Object.freeze({
  SUCCESS: 'success',
  FAILURE: 'failure',
});

function logAudit({
  userId = null,
  userName = null,
  userRole = null,
  action,
  module,
  targetType = null,
  targetId = null,
  result = AUDIT_RESULTS.SUCCESS,
  detail = null,
} = {}) {
  if (!action || !module) {
    logger.warn('logAudit called without action or module', { action, module });
    return;
  }

  logger.info('audit', {
    category: 'audit',
    auditTimestamp: new Date().toISOString(),
    userId,
    userName,
    userRole,
    action,
    module,
    targetType,
    targetId,
    result,
    detail,
  });
}

module.exports = {
  logAudit,
  AUDIT_ACTIONS,
  AUDIT_MODULES,
  AUDIT_RESULTS,
};
