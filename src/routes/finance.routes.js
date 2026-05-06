/**
 * @file src/routes/finance.routes.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const express = require('express');
const { requireAuth, requireAdminRole } = require('../middlewares/auth.middleware');
const validateRequest = require('../middlewares/validate.middleware');
const {
  transactionsQuerySchema,
  summaryQuerySchema,
  revenueQuerySchema,
  exportBodySchema,
} = require('../middlewares/schemas/finance.schema');
const financeController = require('../controllers/finance.controller');

const router = express.Router();

router.get(
  '/admin/finance/transactions',
  requireAuth,
  requireAdminRole,
  ...transactionsQuerySchema,
  validateRequest,
  financeController.listTransactions
);

router.get(
  '/admin/finance/summary',
  requireAuth,
  requireAdminRole,
  ...summaryQuerySchema,
  validateRequest,
  financeController.getSummary
);

router.get(
  '/admin/finance/revenue',
  requireAuth,
  requireAdminRole,
  ...revenueQuerySchema,
  validateRequest,
  financeController.getRevenue
);

router.post(
  '/admin/finance/export',
  requireAuth,
  requireAdminRole,
  ...exportBodySchema,
  validateRequest,
  financeController.exportTransactions
);

module.exports = router;

