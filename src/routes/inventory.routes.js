const express = require('express');

const inventoryController = require('../controllers/inventory.controller');
const validateRequest = require('../middlewares/validate.middleware');
const {
  APP_PERMISSIONS,
  requireAuth,
  requirePermission,
} = require('../middlewares/auth.middleware');
const {
  createInventoryTransactionSchema,
  inventoryItemIdParamSchema,
  listInventoryItemsQuerySchema,
} = require('../middlewares/schemas/inventory.schema');

const router = express.Router();
const inventoryAccess = [requireAuth, requirePermission(APP_PERMISSIONS.INVENTORY_ACCESS)];

router.get(
  '/items',
  ...inventoryAccess,
  ...listInventoryItemsQuerySchema,
  validateRequest,
  inventoryController.getItems
);

router.get(
  '/items/:id',
  ...inventoryAccess,
  ...inventoryItemIdParamSchema,
  validateRequest,
  inventoryController.getItemById
);

router.post(
  '/rentals',
  ...inventoryAccess,
  ...createInventoryTransactionSchema,
  validateRequest,
  inventoryController.createRental
);

router.get('/rentals', ...inventoryAccess, inventoryController.getRentals);

module.exports = router;
