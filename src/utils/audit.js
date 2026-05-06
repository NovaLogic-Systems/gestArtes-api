/**
 * @file src/utils/audit.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const prisma = require('../config/prisma');
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

  if (!prisma?.auditLog?.create) {
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
    return;
  }

  void prisma.auditLog.create({
    data: {
      AuditTimestamp: new Date(),
      UserID: userId,
      UserName: userName,
      UserRole: userRole,
      Action: action,
      Module: module,
      TargetType: targetType,
      TargetID: targetId,
      Result: result,
      Detail: detail,
    },
  }).catch((error) => {
    logger.error('Falha ao registar auditoria na base de dados', {
      action,
      module,
      error: error?.message,
    });
  });
}

module.exports = {
  logAudit,
  AUDIT_ACTIONS,
  AUDIT_MODULES,
  AUDIT_RESULTS,
};

