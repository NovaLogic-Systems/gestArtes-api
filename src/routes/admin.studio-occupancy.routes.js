/**
 * @file src/routes/admin.studio-occupancy.routes.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const express = require('express');
const validateRequest = require('../middlewares/validate.middleware');
const { requireAuth, requireAdminRole } = require('../middlewares/auth.middleware');
const studioController = require('../controllers/studio.controller');
const {
  getStudioOccupancySchema,
  getStudioOccupancyForecastSchema,
  blockStudioSchema,
  updateStudioStatusSchema,
} = require('../middlewares/schemas/studioOccupancy.schema');

const router = express.Router();
const adminAccess = [requireAuth, requireAdminRole];

router.get(
  '/real-time',
  ...adminAccess,
  ...getStudioOccupancySchema,
  validateRequest,
  studioController.getStudioOccupancy
);

router.get(
  '/forecast',
  ...adminAccess,
  ...getStudioOccupancyForecastSchema,
  validateRequest,
  studioController.getStudioOccupancyForecast
);

router.post(
  '/block',
  ...adminAccess,
  ...blockStudioSchema,
  validateRequest,
  studioController.blockStudio
);

router.patch(
  '/:studioId/status',
  ...adminAccess,
  ...updateStudioStatusSchema,
  validateRequest,
  studioController.updateStudioOccupancyStatus
);

module.exports = router;

