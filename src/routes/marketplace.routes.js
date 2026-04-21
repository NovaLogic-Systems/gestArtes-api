const express = require('express');
const router = express.Router();

const marketplaceController = require('../controllers/marketplace.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { uploadMarketplacePhoto } = require('../middlewares/upload.middleware');
const validateRequest = require('../middlewares/validate.middleware');
const {
  createMarketplaceItemSchema,
  updateMarketplaceItemSchema,
  marketplaceListingIdParamSchema,
  listMarketplaceListingsQuerySchema,
} = require('../middlewares/schemas/marketplace.schema');

router.use(requireAuth);

router.get('/options', marketplaceController.getMarketplaceOptions);

router.get(
  '/listings',
  ...listMarketplaceListingsQuerySchema,
  validateRequest,
  marketplaceController.getListings
);

router.get(
  '/listings/:id',
  ...marketplaceListingIdParamSchema,
  validateRequest,
  marketplaceController.getListingById
);

router.post(
  '/listings',
  uploadMarketplacePhoto.single('photo'),
  ...createMarketplaceItemSchema,
  validateRequest,
  marketplaceController.createListing
);

router.get('/my-listings', marketplaceController.getMyListings);

router.patch(
  '/listings/:id',
  uploadMarketplacePhoto.single('photo'),
  ...marketplaceListingIdParamSchema,
  ...updateMarketplaceItemSchema,
  validateRequest,
  marketplaceController.updateListing
);

router.delete(
  '/listings/:id',
  ...marketplaceListingIdParamSchema,
  validateRequest,
  marketplaceController.deleteListing
);

module.exports = router;
