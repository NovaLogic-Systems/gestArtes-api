const express = require('express');
const router = express.Router();

const marketplaceController = require('../controllers/marketplace.controller');
const {
  APP_PERMISSIONS,
  requireAuth,
  requirePermission,
} = require('../middlewares/auth.middleware');
const { attachMarketplacePhoto } = require('../middlewares/marketplaceUpload.middleware');
const validateRequest = require('../middlewares/validate.middleware');
const {
  createMarketplaceItemSchema,
  updateMarketplaceItemSchema,
  marketplaceListingIdParamSchema,
  listMarketplaceListingsQuerySchema,
} = require('../middlewares/schemas/marketplace.schema');

const marketplaceAccess = [requireAuth, requirePermission(APP_PERMISSIONS.MARKETPLACE_ACCESS)];

router.get('/options', ...marketplaceAccess, marketplaceController.getMarketplaceOptions);

router.get(
  '/listings',
  ...marketplaceAccess,
  ...listMarketplaceListingsQuerySchema,
  validateRequest,
  marketplaceController.getListings
);

router.get(
  '/listings/:id',
  ...marketplaceAccess,
  ...marketplaceListingIdParamSchema,
  validateRequest,
  marketplaceController.getListingById
);

router.post(
  '/listings',
  ...marketplaceAccess,
  attachMarketplacePhoto,
  ...createMarketplaceItemSchema,
  validateRequest,
  marketplaceController.createListing
);

router.get('/my-listings', ...marketplaceAccess, marketplaceController.getMyListings);

router.patch(
  '/listings/:id',
  ...marketplaceAccess,
  attachMarketplacePhoto,
  ...marketplaceListingIdParamSchema,
  ...updateMarketplaceItemSchema,
  validateRequest,
  marketplaceController.updateListing
);

router.delete(
  '/listings/:id',
  ...marketplaceAccess,
  ...marketplaceListingIdParamSchema,
  validateRequest,
  marketplaceController.deleteListing
);

module.exports = router;
