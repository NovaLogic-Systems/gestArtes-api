const express = require('express');
const { requireSessionAuth, requireAdminRole } = require('../middlewares/auth.middleware');
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
  requireSessionAuth,
  requireAdminRole,
  ...transactionsQuerySchema,
  validateRequest,
  financeController.listTransactions
);

router.get(
  '/admin/finance/summary',
  requireSessionAuth,
  requireAdminRole,
  ...summaryQuerySchema,
  validateRequest,
  financeController.getSummary
);

router.get(
  '/admin/finance/revenue',
  requireSessionAuth,
  requireAdminRole,
  ...revenueQuerySchema,
  validateRequest,
  financeController.getRevenue
);

router.post(
  '/admin/finance/export',
  requireSessionAuth,
  requireAdminRole,
  ...exportBodySchema,
  validateRequest,
  financeController.exportTransactions
);

module.exports = router;
