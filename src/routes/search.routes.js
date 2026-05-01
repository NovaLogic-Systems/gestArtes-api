/**
 * @file src/routes/search.routes.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const express = require('express');

const marketplaceController = require('../controllers/marketplace.controller');
const validateRequest = require('../middlewares/validate.middleware');
const {
  APP_PERMISSIONS,
  requireAuth,
  requirePermission,
} = require('../middlewares/auth.middleware');
const {
  listMarketplaceListingsQuerySchema,
} = require('../middlewares/schemas/marketplace.schema');

const router = express.Router();
const marketplaceAccess = [requireAuth, requirePermission(APP_PERMISSIONS.MARKETPLACE_ACCESS)];

router.get(
  '/marketplace',
  ...marketplaceAccess,
  ...listMarketplaceListingsQuerySchema,
  validateRequest,
  marketplaceController.getListings
);

module.exports = router;

