const express = require('express');

const inventoryController = require('../controllers/inventory.controller');
const validateRequest = require('../middlewares/validate.middleware');
const { requireRoles } = require('../middlewares/auth.middleware');
const {
  createInventoryTransactionSchema,
  inventoryItemIdParamSchema,
  listInventoryItemsQuerySchema,
} = require('../middlewares/schemas/inventory.schema');

const router = express.Router();

router.use(requireRoles(['student', 'teacher']));

router.get(
  '/items',
  ...listInventoryItemsQuerySchema,
  validateRequest,
  inventoryController.getItems
);

router.get(
  '/items/:id',
  ...inventoryItemIdParamSchema,
  validateRequest,
  inventoryController.getItemById
);

router.post(
  '/rentals',
  ...createInventoryTransactionSchema,
  validateRequest,
  inventoryController.createRental
);

router.get('/rentals', inventoryController.getRentals);

module.exports = router;
