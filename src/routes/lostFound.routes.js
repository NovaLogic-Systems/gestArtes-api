const express = require('express');
const lostFoundController = require('../controllers/lostFound.controller');
const validateRequest = require('../middlewares/validate.middleware');
const {
  requireSessionAuth,
  requireAdminRole,
} = require('../middlewares/auth.middleware');
const {
  createLostAndFoundItemSchema,
  updateLostAndFoundItemSchema,
  itemIdParamSchema,
  claimLostAndFoundItemSchema,
  archiveLostAndFoundItemSchema,
} = require('../middlewares/schemas/lostFound.schema');

const router = express.Router();
const adminLostFoundAccess = [requireSessionAuth, requireAdminRole];

router.get('/lostfound', lostFoundController.listPublic);
router.get('/lostfound/:id', ...itemIdParamSchema, validateRequest, lostFoundController.getPublicById);

router.post(
  '/admin/lostfound',
  ...adminLostFoundAccess,
  ...createLostAndFoundItemSchema,
  validateRequest,
  lostFoundController.create
);

router.patch(
  '/admin/lostfound/:id',
  ...adminLostFoundAccess,
  ...itemIdParamSchema,
  ...updateLostAndFoundItemSchema,
  validateRequest,
  lostFoundController.update
);

router.delete(
  '/admin/lostfound/:id',
  ...adminLostFoundAccess,
  ...itemIdParamSchema,
  validateRequest,
  lostFoundController.remove
);

router.patch(
  '/admin/lostfound/:id/claim',
  ...adminLostFoundAccess,
  ...itemIdParamSchema,
  ...claimLostAndFoundItemSchema,
  validateRequest,
  lostFoundController.claim
);

router.patch(
  '/admin/lostfound/:id/archive',
  ...adminLostFoundAccess,
  ...itemIdParamSchema,
  ...archiveLostAndFoundItemSchema,
  validateRequest,
  lostFoundController.archive
);

module.exports = router;
