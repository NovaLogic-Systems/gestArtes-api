/**
 * @file src/routes/audit.routes.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const express = require('express');
const { requireAuth, requireAdminRole } = require('../middlewares/auth.middleware');
const validateRequest = require('../middlewares/validate.middleware');
const { auditQuerySchema, auditSummaryQuerySchema } = require('../middlewares/schemas/audit.schema');
const auditController = require('../controllers/audit.controller');

const router = express.Router();

router.get(
  '/admin/audit',
  requireAuth,
  requireAdminRole,
  ...auditQuerySchema,
  validateRequest,
  auditController.listEvents
);

router.get(
  '/admin/audit/summary',
  requireAuth,
  requireAdminRole,
  ...auditSummaryQuerySchema,
  validateRequest,
  auditController.getSummary
);

module.exports = router;

