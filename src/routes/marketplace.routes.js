const express = require('express');
const router = express.Router();

const marketplaceController = require('../controllers/marketplace.controller');
const { APP_ROLES, requireAuth, requireRole } = require('../middlewares/auth.middleware');
const validateRequest = require('../middlewares/validate.middleware');
const {
  createMarketplaceItemSchema,
  updateMarketplaceItemSchema,
  marketplaceListingIdParamSchema,
  listMarketplaceListingsQuerySchema,
} = require('../middlewares/schemas/marketplace.schema');

const marketplaceAccess = [requireAuth, requireRole(APP_ROLES)];

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
  ...createMarketplaceItemSchema,
  validateRequest,
  marketplaceController.createListing
);

router.get('/my-listings', ...marketplaceAccess, marketplaceController.getMyListings);

router.patch(
  '/listings/:id',
  ...marketplaceAccess,
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
