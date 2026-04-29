const { createApproveListingUseCase } = require('./approve-listing.usecase');
const { createRejectListingUseCase } = require('./reject-listing.usecase');

function createAdminMarketplaceUseCases({ prisma }) {
  return {
    approveListing: createApproveListingUseCase({ prisma }),
    rejectListing: createRejectListingUseCase({ prisma }),
  };
}

module.exports = {
  createAdminMarketplaceUseCases,
};