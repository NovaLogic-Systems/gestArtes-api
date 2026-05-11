/**
 * @file src/routes/admin.inventory.routes.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const express = require('express');

const adminInventoryController = require('../controllers/admin_inventory.controller');
const validateRequest = require('../middlewares/validate.middleware');
const { requireAuth, requireAdminRole } = require('../middlewares/auth.middleware');
const { attachInventoryPhoto } = require('../middlewares/inventoryUpload.middleware');
const {
  createInventoryItemSchema,
  inventoryItemIdParamSchema,
  updateInventoryItemSchema,
  updateInventoryAvailabilitySchema,
  inventoryRentalIdParamSchema,
  verifyReturnSchema,
  rejectReturnSchema,
  listInventoryItemsQuerySchema,
  approveRentalSchema,
} = require('../middlewares/schemas/inventory.schema');

const router = express.Router();
const adminAccess = [requireAuth, requireAdminRole];

router.get(
  '/',
  ...adminAccess,
  ...listInventoryItemsQuerySchema,
  validateRequest,
  adminInventoryController.getItems
);

router.get(
  '/rentals',
  ...adminAccess,
  validateRequest,
  adminInventoryController.getRentals
);

router.patch(
  '/rentals/:rentalId/approve',
  ...adminAccess,
  ...inventoryRentalIdParamSchema,
  ...approveRentalSchema,
  validateRequest,
  adminInventoryController.approveRental
);

router.post(
  '/',
  ...adminAccess,
  attachInventoryPhoto,
  ...createInventoryItemSchema,
  validateRequest,
  adminInventoryController.createItem
);

router.patch(
  '/:id',
  ...adminAccess,
  attachInventoryPhoto,
  ...inventoryItemIdParamSchema,
  ...updateInventoryItemSchema,
  validateRequest,
  adminInventoryController.updateItem
);

router.delete(
  '/:id',
  ...adminAccess,
  ...inventoryItemIdParamSchema,
  validateRequest,
  adminInventoryController.removeItem
);

router.patch(
  '/:id/availability',
  ...adminAccess,
  ...inventoryItemIdParamSchema,
  ...updateInventoryAvailabilitySchema,
  validateRequest,
  adminInventoryController.updateAvailability
);

router.patch(
  '/rentals/:rentalId/verify-return',
  ...adminAccess,
  ...inventoryRentalIdParamSchema,
  ...verifyReturnSchema,
  validateRequest,
  adminInventoryController.verifyReturn
);

router.patch(
  '/rentals/:rentalId/reject-return',
  ...adminAccess,
  ...inventoryRentalIdParamSchema,
  ...rejectReturnSchema,
  validateRequest,
  adminInventoryController.rejectReturn
);

module.exports = router;

