const prisma = require('../config/prisma');

const PENDING_STATUS_NAMES = ['pending', 'pendente', 'pending_review', 'pending approval'];
const APPROVED_STATUS_NAMES = ['approved', 'aprovado', 'published', 'publicado', 'active', 'ativo'];
const REJECTED_STATUS_NAMES = ['rejected', 'rejeitado', 'declined', 'recusado'];
const REMOVED_STATUS_NAMES = ['removed', 'removido', 'hidden', 'oculto', 'inactive', 'inativo'];

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeString(value) {
  return String(value || '').trim().toLowerCase();
}

function toMoney(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return Number(value);
}

function normalizePhotoUrl(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return String(value)
    .replace(/&#x2F;/gi, '/')
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function serializeListing(record, includeSellerContact = true) {
  const seller = record.User
    ? {
        userId: record.User.UserID,
        firstName: record.User.FirstName,
        lastName: record.User.LastName,
        ...(includeSellerContact
          ? {
              email: record.User.Email,
              phoneNumber: record.User.PhoneNumber,
            }
          : {}),
      }
    : null;

  return {
    listingId: record.MarketplaceItemID,
    sellerId: record.SellerID,
    title: record.Title,
    description: record.Description,
    rejectionReason: record.RejectionReason ?? null,
    price: toMoney(record.Price),
    category: record.ItemCategory
      ? {
          categoryId: record.ItemCategory.CategoryID,
          categoryName: record.ItemCategory.CategoryName,
        }
      : null,
    condition: record.MarketplaceItemCondition
      ? {
          conditionId: record.MarketplaceItemCondition.ConditionID,
          conditionName: record.MarketplaceItemCondition.ConditionName,
        }
      : null,
    status: record.MarketplaceItemStatus
      ? {
          statusId: record.MarketplaceItemStatus.StatusID,
          statusName: record.MarketplaceItemStatus.StatusName,
        }
      : null,
    photoUrl: normalizePhotoUrl(record.PhotoURL),
    location: record.Location,
    createdAt: record.CreatedAt,
    isActive: record.IsActive,
    seller,
  };
}

function buildListingInclude(includeSellerContact = true) {
  return {
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
        ...(includeSellerContact
          ? {
              Email: true,
              PhoneNumber: true,
            }
          : {}),
      },
    },
  };
}

async function resolveStatusId(preferredNames) {
  const statusRows = await prisma.marketplaceItemStatus.findMany({
    select: {
      StatusID: true,
      StatusName: true,
    },
    orderBy: {
      StatusID: 'asc',
    },
  });

  const expected = new Set(preferredNames.map(normalizeString));
  const match = statusRows.find((status) => expected.has(normalizeString(status.StatusName)));

  return match ? match.StatusID : null;
}

function buildCategoryFilter(rawCategory) {
  if (rawCategory === undefined || rawCategory === null) {
    return null;
  }

  const category = String(rawCategory).trim();

  if (!category) {
    return null;
  }

  const maybeId = Number.parseInt(category, 10);

  if (!Number.isNaN(maybeId) && maybeId > 0 && String(maybeId) === category) {
    return {
      CategoryID: maybeId,
    };
  }

  return {
    ItemCategory: {
      CategoryName: category,
    },
  };
}

function buildStatusFilter(rawStatus) {
  const normalized = normalizeString(rawStatus);

  if (!normalized || normalized === 'all') {
    return null;
  }

  const aliases = {
    pending: PENDING_STATUS_NAMES,
    pendente: PENDING_STATUS_NAMES,
    approved: APPROVED_STATUS_NAMES,
    aprovado: APPROVED_STATUS_NAMES,
    rejected: REJECTED_STATUS_NAMES,
    rejeitado: REJECTED_STATUS_NAMES,
    removed: REMOVED_STATUS_NAMES,
    removido: REMOVED_STATUS_NAMES,
  }[normalized];

  if (!aliases) {
    return {
      MarketplaceItemStatus: {
        StatusName: normalized,
      },
    };
  }

  return {
    MarketplaceItemStatus: {
      StatusName: {
        in: aliases,
      },
    },
  };
}

function buildSearchFilter(rawSearch) {
  const search = String(rawSearch || '').trim();

  if (!search) {
    return null;
  }

  return {
    OR: [
      { Title: { contains: search } },
      { Description: { contains: search } },
      { Location: { contains: search } },
      { User: { FirstName: { contains: search } } },
      { User: { LastName: { contains: search } } },
      { User: { Email: { contains: search } } },
    ],
  };
}

function buildPriceFilter(minPrice, maxPrice) {
  if (minPrice === undefined && maxPrice === undefined) {
    return null;
  }

  return {
    Price: {
      ...(minPrice !== undefined ? { gte: minPrice } : {}),
      ...(maxPrice !== undefined ? { lte: maxPrice } : {}),
    },
  };
}

function mergeWhereClauses(baseWhere, clauses) {
  for (const clause of clauses) {
    if (!clause) {
      continue;
    }

    if (clause.OR) {
      baseWhere.OR = clause.OR;
      continue;
    }

    Object.assign(baseWhere, clause);
  }

  return baseWhere;
}

async function buildListingWhere(query) {
  const where = {};

  mergeWhereClauses(where, [
    buildCategoryFilter(query.category),
    buildStatusFilter(query.status),
    buildSearchFilter(query.search),
    buildPriceFilter(query.minPrice, query.maxPrice),
  ]);

  if (query.location) {
    where.Location = {
      contains: query.location,
    };
  }

  return where;
}

async function getListings(req, res, next) {
  try {
    const where = await buildListingWhere(req.query);
    const listings = await prisma.marketplaceItem.findMany({
      where,
      include: buildListingInclude(true),
      orderBy: {
        CreatedAt: 'desc',
      },
    });

    res.json({
      listings: listings.map((listing) => serializeListing(listing, true)),
    });
  } catch (error) {
    next(error);
  }
}

async function approveListing(req, res, next) {
  try {
    const existing = await prisma.marketplaceItem.findUnique({
      where: {
        MarketplaceItemID: req.params.id,
      },
      select: {
        MarketplaceItemID: true,
      },
    });

    if (!existing) {
      throw createHttpError(404, 'Anúncio não encontrado');
    }

    const approvedStatusId = await resolveStatusId(APPROVED_STATUS_NAMES);

    if (!approvedStatusId) {
      throw createHttpError(500, 'Estado aprovado de anúncio não configurado');
    }

    const updated = await prisma.marketplaceItem.update({
      where: {
        MarketplaceItemID: req.params.id,
      },
      data: {
        StatusID: approvedStatusId,
        IsActive: true,
        RejectionReason: null,
      },
      include: buildListingInclude(true),
    });

    res.json({
      listing: serializeListing(updated, true),
    });
  } catch (error) {
    next(error);
  }
}

async function rejectListing(req, res, next) {
  try {
    const existing = await prisma.marketplaceItem.findUnique({
      where: {
        MarketplaceItemID: req.params.id,
      },
      select: {
        MarketplaceItemID: true,
      },
    });

    if (!existing) {
      throw createHttpError(404, 'Anúncio não encontrado');
    }

    const rejectedStatusId = await resolveStatusId(REJECTED_STATUS_NAMES);

    if (!rejectedStatusId) {
      throw createHttpError(500, 'Estado rejeitado de anúncio não configurado');
    }

    const reason = String(req.body.reason || '').trim();

    const updated = await prisma.marketplaceItem.update({
      where: {
        MarketplaceItemID: req.params.id,
      },
      data: {
        StatusID: rejectedStatusId,
        IsActive: false,
        RejectionReason: reason,
      },
      include: buildListingInclude(true),
    });

    res.json({
      listing: serializeListing(updated, true),
    });
  } catch (error) {
    next(error);
  }
}

async function deleteListing(req, res, next) {
  try {
    const existing = await prisma.marketplaceItem.findUnique({
      where: {
        MarketplaceItemID: req.params.id,
      },
      select: {
        MarketplaceItemID: true,
        RejectionReason: true,
      },
    });

    if (!existing) {
      throw createHttpError(404, 'Anúncio não encontrado');
    }

    const removedStatusId = await resolveStatusId(REMOVED_STATUS_NAMES);

    await prisma.marketplaceItem.update({
      where: {
        MarketplaceItemID: req.params.id,
      },
      data: {
        IsActive: false,
        ...(removedStatusId ? { StatusID: removedStatusId } : {}),
        RejectionReason: existing.RejectionReason ?? null,
      },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getListings,
  approveListing,
  rejectListing,
  deleteListing,
};