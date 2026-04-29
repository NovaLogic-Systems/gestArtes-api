const { createHttpError } = require('../../../utils/http-error');
const { APPROVED_STATUS_NAMES, resolveStatusId } = require('./resolve-status-id');

function createApproveListingUseCase({ prisma }) {
  return {
    async execute({ listingId }) {
      const existing = await prisma.marketplaceItem.findUnique({
        where: {
          MarketplaceItemID: listingId,
        },
        select: {
          MarketplaceItemID: true,
        },
      });

      if (!existing) {
        throw createHttpError(404, 'Anúncio não encontrado');
      }

      const approvedStatusId = await resolveStatusId(prisma, APPROVED_STATUS_NAMES);

      if (!approvedStatusId) {
        throw createHttpError(500, 'Estado aprovado de anúncio não configurado');
      }

      return prisma.marketplaceItem.update({
        where: {
          MarketplaceItemID: listingId,
        },
        data: {
          StatusID: approvedStatusId,
          IsActive: true,
          RejectionReason: null,
        },
        include: {
          ItemCategory: {
            select: {
              CategoryID: true,
              CategoryName: true,
            },
          },
          MarketplaceItemCondition: {
            select: {
              ConditionID: true,
              ConditionName: true,
            },
          },
          MarketplaceItemStatus: {
            select: {
              StatusID: true,
              StatusName: true,
            },
          },
          User: {
            select: {
              UserID: true,
              FirstName: true,
              LastName: true,
              Email: true,
              PhoneNumber: true,
            },
          },
        },
      });
    },
  };
}

module.exports = {
  createApproveListingUseCase,
};