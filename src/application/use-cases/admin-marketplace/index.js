/**
 * @file src/application/use-cases/admin-marketplace/index.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

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
