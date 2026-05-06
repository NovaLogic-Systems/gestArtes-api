/**
 * @file src/controllers/marketplace.controller.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const prisma = require('../config/prisma');
const { createHttpError } = require('../utils/http-error');
const { getAuthenticatedUserId } = require('../utils/auth-context');

const PENDING_STATUS_NAMES = ['pending', 'pendente', 'pending_review', 'pending approval'];
const REMOVED_STATUS_NAMES = ['removed', 'removido', 'hidden', 'oculto', 'inactive', 'inativo'];

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

function serializeListing(record, includeSellerContact = false) {
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

  if (statusRows.length === 0) {
    return null;
  }

  const expected = new Set(preferredNames.map(normalizeString));
  const match = statusRows.find((status) => expected.has(normalizeString(status.StatusName)));

  return (match || statusRows[0]).StatusID;
}

async function ensureConditionExists(conditionId) {
  const condition = await prisma.marketplaceItemCondition.findUnique({
    where: {
      ConditionID: conditionId,
    },
    select: {
      ConditionID: true,
    },
  });

  if (!condition) {
    throw createHttpError(400, 'Condição inválida');
  }
}

async function ensureCategoryExists(categoryId) {
  if (categoryId === undefined || categoryId === null) {
    return;
  }

  const category = await prisma.itemCategory.findUnique({
    where: {
      CategoryID: categoryId,
    },
    select: {
      CategoryID: true,
      IsActive: true,
    },
  });

  if (!category || !category.IsActive) {
    throw createHttpError(400, 'Categoria inválida');
  }
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

function buildTextSearchFilter(rawQuery) {
  const query = String(rawQuery || '').trim();

  if (!query) {
    return null;
  }

  return {
    OR: [
      {
        Title: {
          contains: query,
        },
      },
      {
        Description: {
          contains: query,
        },
      },
    ],
  };
}

function buildListingInclude(includeSellerContact = false) {
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

async function getMarketplaceOptions(req, res, next) {
  try {
    const [categories, conditions] = await Promise.all([
      prisma.itemCategory.findMany({
        where: {
          IsActive: true,
        },
        select: {
          CategoryID: true,
          CategoryName: true,
        },
        orderBy: {
          CategoryName: 'asc',
        },
      }),
      prisma.marketplaceItemCondition.findMany({
        select: {
          ConditionID: true,
          ConditionName: true,
        },
        orderBy: {
          ConditionName: 'asc',
        },
      }),
    ]);

    res.json({
      categories: categories.map((entry) => ({
        categoryId: entry.CategoryID,
        categoryName: entry.CategoryName,
      })),
      conditions: conditions.map((entry) => ({
        conditionId: entry.ConditionID,
        conditionName: entry.ConditionName,
      })),
    });
  } catch (error) {
    next(error);
  }
}

async function getListings(req, res, next) {
  try {
    const where = {
      IsActive: true,
    };

    const textQuery = req.query.q ?? req.query.search;
    const textSearchFilter = buildTextSearchFilter(textQuery);

    const categoryFilter = buildCategoryFilter(req.query.category);

    if (textSearchFilter) {
      where.OR = textSearchFilter.OR;
    }

    if (categoryFilter) {
      Object.assign(where, categoryFilter);
    }

    if (req.query.location) {
      where.Location = {
        contains: req.query.location,
      };
    }

    if (req.query.minPrice !== undefined || req.query.maxPrice !== undefined) {
      where.Price = {};

      if (req.query.minPrice !== undefined) {
        where.Price.gte = req.query.minPrice;
      }

      if (req.query.maxPrice !== undefined) {
        where.Price.lte = req.query.maxPrice;
      }
    }

    const listings = await prisma.marketplaceItem.findMany({
      where,
      include: buildListingInclude(false),
      orderBy: {
        CreatedAt: 'desc',
      },
    });

    res.json({
      listings: listings.map((listing) => serializeListing(listing, false)),
    });
  } catch (error) {
    next(error);
  }
}

async function getListingById(req, res, next) {
  try {
    const authenticatedUserId = getAuthenticatedUserId(req);

    const listing = await prisma.marketplaceItem.findFirst({
      where: {
        MarketplaceItemID: req.params.id,
        OR: [
          {
            IsActive: true,
          },
          {
            SellerID: authenticatedUserId,
          },
        ],
      },
      include: buildListingInclude(true),
    });

    if (!listing) {
      throw createHttpError(404, 'Anúncio não encontrado');
    }

    res.json({
      listing: serializeListing(listing, true),
    });
  } catch (error) {
    next(error);
  }
}

async function createListing(req, res, next) {
  try {
    await ensureConditionExists(req.body.conditionId);
    await ensureCategoryExists(req.body.categoryId);

    const statusId = await resolveStatusId(PENDING_STATUS_NAMES);

    if (!statusId) {
      throw createHttpError(500, 'Estado pendente de anúncio não configurado');
    }

    const listing = await prisma.marketplaceItem.create({
      data: {
        SellerID: getAuthenticatedUserId(req),
        CategoryID: req.body.categoryId ?? null,
        Title: req.body.title,
        Description: req.body.description ?? null,
        Price: req.body.price,
        ConditionID: req.body.conditionId,
        StatusID: statusId,
        PhotoURL: req.body.photoUrl ?? null,
        Location: req.body.location ?? null,
        RejectionReason: null,
        IsActive: false,
      },
      include: buildListingInclude(false),
    });

    res.status(201).json({
      listing: serializeListing(listing, false),
    });
  } catch (error) {
    next(error);
  }
}

async function publish(req, res, next) {
  return createListing(req, res, next);
}

async function getMyListings(req, res, next) {
  try {
    const authenticatedUserId = getAuthenticatedUserId(req);

    const listings = await prisma.marketplaceItem.findMany({
      where: {
        SellerID: authenticatedUserId,
      },
      include: buildListingInclude(false),
      orderBy: {
        CreatedAt: 'desc',
      },
    });

    res.json({
      listings: listings.map((listing) => serializeListing(listing, false)),
    });
  } catch (error) {
    next(error);
  }
}

async function updateListing(req, res, next) {
  try {
    const listingId = req.params.id;
    const existing = await prisma.marketplaceItem.findUnique({
      where: {
        MarketplaceItemID: listingId,
      },
      select: {
        MarketplaceItemID: true,
        SellerID: true,
        IsActive: true,
      },
    });

    if (!existing) {
      throw createHttpError(404, 'Anúncio não encontrado');
    }

    if (existing.SellerID !== getAuthenticatedUserId(req)) {
      throw createHttpError(403, 'Sem permissão para editar este anúncio');
    }

    if (req.body.conditionId !== undefined) {
      await ensureConditionExists(req.body.conditionId);
    }

    if (req.body.categoryId !== undefined) {
      await ensureCategoryExists(req.body.categoryId);
    }

    const updateData = {};
    const pendingStatusId = await resolveStatusId(PENDING_STATUS_NAMES);

    if (!pendingStatusId) {
      throw createHttpError(500, 'Estado pendente de anúncio não configurado');
    }

    if (req.body.title !== undefined) {
      updateData.Title = req.body.title;
    }

    if (req.body.description !== undefined) {
      updateData.Description = req.body.description;
    }

    if (req.body.price !== undefined) {
      updateData.Price = req.body.price;
    }

    if (req.body.conditionId !== undefined) {
      updateData.ConditionID = req.body.conditionId;
    }

    if (req.body.categoryId !== undefined) {
      updateData.CategoryID = req.body.categoryId;
    }

    if (req.body.photoUrl !== undefined) {
      updateData.PhotoURL = req.body.photoUrl;
    }

    if (req.body.location !== undefined) {
      updateData.Location = req.body.location;
    }

    updateData.StatusID = pendingStatusId;
    updateData.IsActive = false;
    updateData.RejectionReason = null;

    const updated = await prisma.marketplaceItem.update({
      where: {
        MarketplaceItemID: listingId,
      },
      data: updateData,
      include: buildListingInclude(false),
    });

    res.json({
      listing: serializeListing(updated, false),
    });
  } catch (error) {
    next(error);
  }
}

async function reserve(req, res, next) {
  return updateListing(req, res, next);
}

async function close(req, res, next) {
  return deleteListing(req, res, next);
}

async function complete(req, res, next) {
  return deleteListing(req, res, next);
}

async function deleteListing(req, res, next) {
  try {
    const listingId = req.params.id;
    const existing = await prisma.marketplaceItem.findUnique({
      where: {
        MarketplaceItemID: listingId,
      },
      select: {
        SellerID: true,
        IsActive: true,
        RejectionReason: true,
      },
    });

    if (!existing) {
      throw createHttpError(404, 'Anúncio não encontrado');
    }

    if (existing.SellerID !== getAuthenticatedUserId(req)) {
      throw createHttpError(403, 'Sem permissão para remover este anúncio');
    }

    if (!existing.IsActive) {
      res.status(204).send();
      return;
    }

    const removedStatusId = await resolveStatusId(REMOVED_STATUS_NAMES);
    const updateData = {
      IsActive: false,
      RejectionReason: existing.RejectionReason ?? null,
    };

    if (removedStatusId) {
      updateData.StatusID = removedStatusId;
    }

    await prisma.marketplaceItem.update({
      where: {
        MarketplaceItemID: listingId,
      },
      data: updateData,
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getMarketplaceOptions,
  getListings,
  getListingById,
  publish,
  createListing,
  reserve,
  close,
  complete,
  updateListing,
  deleteListing,
  getMyListings,
};

