const express = require('express');

const validateRequest = require('../middlewares/validate.middleware');
const { requireSessionAuth, requireRole } = require('../middlewares/auth.middleware');
const {
  marketplaceListingIdParamSchema,
  listMarketplaceListingsQuerySchema,
  rejectMarketplaceListingSchema,
} = require('../middlewares/schemas/marketplace.schema');
const adminMarketplaceController = require('../controllers/admin_marketplace.controller');

const router = express.Router();
const adminAccess = [requireSessionAuth, requireRole(['ADMIN'])];

router.get(
  '/listings',
  ...adminAccess,
  ...listMarketplaceListingsQuerySchema,
  validateRequest,
  adminMarketplaceController.getListings
);

router.patch(
  '/listings/:id/approve',
  ...adminAccess,
  ...marketplaceListingIdParamSchema,
  validateRequest,
  adminMarketplaceController.approveListing
);

router.patch(
  '/listings/:id/reject',
  ...adminAccess,
  ...marketplaceListingIdParamSchema,
  ...rejectMarketplaceListingSchema,
  validateRequest,
  adminMarketplaceController.rejectListing
);

router.delete(
  '/listings/:id',
  ...adminAccess,
  ...marketplaceListingIdParamSchema,
  validateRequest,
  adminMarketplaceController.deleteListing
);

module.exports = router;
