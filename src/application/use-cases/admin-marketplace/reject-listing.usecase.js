const { createHttpError } = require('../../../utils/http-error');
const { REJECTED_STATUS_NAMES, resolveStatusId } = require('./resolve-status-id');

function createRejectListingUseCase({ prisma }) {
  return {
    async execute({ listingId, reason }) {
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

      const rejectedStatusId = await resolveStatusId(prisma, REJECTED_STATUS_NAMES);

      if (!rejectedStatusId) {
        throw createHttpError(500, 'Estado rejeitado de anúncio não configurado');
      }

      const normalizedReason = String(reason || '').trim();

      return prisma.marketplaceItem.update({
        where: {
          MarketplaceItemID: listingId,
        },
        data: {
          StatusID: rejectedStatusId,
          IsActive: false,
          RejectionReason: normalizedReason,
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
  createRejectListingUseCase,
};