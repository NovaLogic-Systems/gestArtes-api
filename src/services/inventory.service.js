/**
 * @file src/services/inventory.service.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const { Prisma } = require('@prisma/client');

const prisma = require('../config/prisma');
const { createHttpError } = require('../utils/http-error');

function toMoney(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return Number(value);
}

function normalizeString(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function normalizeStatusFilter(value) {
  const normalized = normalizeString(value);

  if (!normalized) {
    return null;
  }

  if (normalized === 'all') {
    return null;
  }

  if (['available', 'available-only', 'available_only', 'free', 'livre'].includes(normalized)) {
    return 'available';
  }

  if (['rented', 'reserved', 'unavailable', 'occupied', 'alugado'].includes(normalized)) {
    return 'rented';
  }

  return null;
}

function parsePositiveMoney(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric < 0) {
    throw createHttpError(400, 'Preço inválido');
  }

  return numeric;
}

function isSchoolOwnedItem(item) {
  return item?.IsSchoolOwned !== false;
}

function buildSearchFilter(rawSearch) {
  if (rawSearch === undefined || rawSearch === null) {
    return null;
  }

  const search = String(rawSearch).trim();

  if (!search) {
    return null;
  }

  return {
    OR: [
      {
        ItemName: {
          contains: search,
        },
      },
      {
        Description: {
          contains: search,
        },
      },
      {
        ItemCategory: {
          is: {
            IsActive: true,
            CategoryName: {
              contains: search,
            },
          },
        },
      },
    ],
  };
}

function buildInventoryStatusFilter(filters = {}) {
  const explicitStatus = normalizeStatusFilter(filters.status || filters.availability);

  if (explicitStatus) {
    return explicitStatus;
  }

  if (
    filters.availableOnly === true
    || normalizeString(filters.availableOnly) === 'true'
    || filters.onlyAvailable === true
    || normalizeString(filters.onlyAvailable) === 'true'
  ) {
    return 'available';
  }

  return null;
}

function buildInventoryPriceFilter(filters = {}) {
  const exactPrice = parsePositiveMoney(filters.price);
  const minPrice = parsePositiveMoney(filters.priceMin ?? filters.minPrice);
  const maxPrice = parsePositiveMoney(filters.priceMax ?? filters.maxPrice);

  if (exactPrice === null && minPrice === null && maxPrice === null) {
    return null;
  }

  return {
    exactPrice,
    minPrice,
    maxPrice,
  };
}

function toRentalStatus(record) {
  if (record.IsCompleted) {
    return 'completed';
  }

  if (record.ReturnVerified) {
    return 'return-verified';
  }

  if (record.ConditionChecked) {
    return 'condition-checked';
  }

  return 'pending';
}

function buildRentalReference(transactionId, startDate) {
  const year = new Date(startDate).getUTCFullYear();
  return `INV-R-${year}-${String(transactionId).padStart(4, '0')}`;
}

function serializeItem(item, activeRentalsCount) {
  const totalQuantity = Number(item.TotalQuantity || 0);
  const reservedQuantity = Math.max(Number(activeRentalsCount || 0), 0);
  const availableQuantity = Math.max(0, totalQuantity - reservedQuantity);
  const isAvailable = availableQuantity > 0;

  return {
    itemId: item.InventoryItemID,
    itemName: item.ItemName,
    description: item.Description,
    photoUrl: item.PhotoURL,
    isSchoolOwned: isSchoolOwnedItem(item),
    symbolicFee: toMoney(item.SymbolicFee),
    totalQuantity,
    reservedQuantity,
    availableQuantity,
    status: isAvailable ? 'available' : 'reserved',
    isAvailable,
    category: item.ItemCategory
      ? {
        categoryId: item.ItemCategory.CategoryID,
        categoryName: item.ItemCategory.CategoryName,
      }
      : null,
  };
}

function serializeRental(record) {
  const symbolicFee = toMoney(record.InventoryItem.SymbolicFee) || 0;
  const reference = buildRentalReference(record.TransactionID, record.StartDate);

  return {
    rentalId: record.TransactionID,
    reference,
    status: toRentalStatus(record),
    startDate: record.StartDate,
    endDate: record.EndDate,
    symbolicFee,
    estimatedTotal: symbolicFee,
    paymentMethod: {
      paymentMethodId: record.PaymentMethod.PaymentMethodID,
      methodName: record.PaymentMethod.MethodName,
    },
    item: {
      itemId: record.InventoryItem.InventoryItemID,
      itemName: record.InventoryItem.ItemName,
      photoUrl: record.InventoryItem.PhotoURL,
    },
    returnVerification: {
      conditionChecked: Boolean(record.ConditionChecked),
      returnVerified: Boolean(record.ReturnVerified),
      conditionStatus: record.ReturnConditionStatus ?? null,
      conditionNotes: record.ReturnConditionNotes ?? null,
      verifiedAt: record.ReturnVerifiedAt ?? null,
    },
  };
}

function buildCategoryFilter(rawCategory, rawCategoryId) {
  const normalizedCategoryId = Number.parseInt(rawCategoryId, 10);

  if (Number.isInteger(normalizedCategoryId) && normalizedCategoryId > 0) {
    return {
      CategoryID: normalizedCategoryId,
    };
  }

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
      is: {
        IsActive: true,
        CategoryName: category,
      },
    },
  };
}

function buildInventoryInclude() {
  return {
    ItemCategory: {
      select: {
        CategoryID: true,
        CategoryName: true,
        IsActive: true,
      },
    },
  };
}

function buildInventoryWhere(filters = {}) {
  const where = {
    IsSchoolOwned: true,
    ItemCategory: {
      is: {
        IsActive: true,
      },
    },
  };

  const categoryFilter = buildCategoryFilter(filters.category, filters.categoryId);

  if (categoryFilter) {
    Object.assign(where, categoryFilter);
  }

  const searchFilter = buildSearchFilter(filters.search);

  if (searchFilter) {
    Object.assign(where, searchFilter);
  }

  return where;
}

function matchesInventoryStatusFilter(item, statusFilter) {
  if (!statusFilter) {
    return true;
  }

  if (statusFilter === 'available') {
    return item.isAvailable;
  }

  return !item.isAvailable;
}

function matchesInventoryPriceFilter(item, priceFilter) {
  if (!priceFilter) {
    return true;
  }

  const symbolicFee = Number(item.symbolicFee ?? 0);

  if (priceFilter.exactPrice !== null && symbolicFee !== priceFilter.exactPrice) {
    return false;
  }

  if (priceFilter.minPrice !== null && symbolicFee < priceFilter.minPrice) {
    return false;
  }

  if (priceFilter.maxPrice !== null && symbolicFee > priceFilter.maxPrice) {
    return false;
  }

  return true;
}

async function loadReservedQuantities(db, itemIds) {
  if (itemIds.length === 0) {
    return new Map();
  }

  const activeRentals = await db.inventoryTransaction.groupBy({
    by: ['InventoryItemID'],
    where: {
      InventoryItemID: {
        in: itemIds,
      },
      IsCompleted: false,
    },
    _count: {
      _all: true,
    },
  });

  return new Map(
    activeRentals.map((row) => [row.InventoryItemID, Number(row._count?._all || 0)])
  );
}

async function listItems(filters = {}) {
  const items = await prisma.inventoryItem.findMany({
    where: buildInventoryWhere(filters),
    include: buildInventoryInclude(),
    orderBy: {
      ItemName: 'asc',
    },
  });

  if (items.length === 0) {
    return [];
  }

  const itemIds = items.map((item) => item.InventoryItemID);
  const activeRentalsByItem = await loadReservedQuantities(prisma, itemIds);
  const statusFilter = buildInventoryStatusFilter(filters);
  const priceFilter = buildInventoryPriceFilter(filters);

  const result = items.map((item) => {
    const activeRentalsCount = activeRentalsByItem.get(item.InventoryItemID) || 0;
    return serializeItem(item, activeRentalsCount);
  });

  return result.filter((item) => (
    matchesInventoryStatusFilter(item, statusFilter)
    && matchesInventoryPriceFilter(item, priceFilter)
  ));
}

async function getItemById(itemId) {
  const item = await prisma.inventoryItem.findUnique({
    where: {
      InventoryItemID: itemId,
    },
    include: buildInventoryInclude(),
  });

  if (!item || item.ItemCategory?.IsActive === false || !isSchoolOwnedItem(item)) {
    return null;
  }

  const activeRentalsCount = await prisma.inventoryTransaction.count({
    where: {
      InventoryItemID: itemId,
      IsCompleted: false,
    },
  });

  return serializeItem(item, activeRentalsCount);
}

async function ensureActivePaymentMethod(db, paymentMethodId) {
  const paymentMethod = await db.paymentMethod.findUnique({
    where: {
      PaymentMethodID: paymentMethodId,
    },
    select: {
      PaymentMethodID: true,
      MethodName: true,
      IsActive: true,
    },
  });

  if (!paymentMethod || !paymentMethod.IsActive) {
    throw createHttpError(400, 'Método de pagamento inválido');
  }

  return paymentMethod;
}

async function lockInventoryItemRow(db, inventoryItemId) {
  const lockedItems = await db.$queryRaw`
    SELECT TOP (1)
      InventoryItemID,
      ItemName,
      SymbolicFee,
      TotalQuantity
    FROM InventoryItem WITH (UPDLOCK, HOLDLOCK, ROWLOCK)
    WHERE InventoryItemID = ${inventoryItemId}
  `;

  return lockedItems[0] ?? null;
}

async function loadRentableItem(db, itemId) {
  const item = await db.inventoryItem.findUnique({
    where: {
      InventoryItemID: itemId,
    },
    include: buildInventoryInclude(),
  });

  if (!item || item.ItemCategory?.IsActive === false) {
    throw createHttpError(404, 'Artigo não encontrado');
  }

  if (!isSchoolOwnedItem(item)) {
    throw createHttpError(400, 'Apenas artigos oficiais da escola podem ser alugados');
  }

  return item;
}

async function ensureItemCanBeRented(db, item) {
  const activeRentalsCount = await db.inventoryTransaction.count({
    where: {
      InventoryItemID: item.InventoryItemID,
      IsCompleted: false,
    },
  });

  if (activeRentalsCount >= Number(item.TotalQuantity || 0)) {
    throw createHttpError(409, 'Artigo sem stock disponível para aluguer');
  }
}

async function createRental(data, renterId) {
  return prisma.$transaction(async (tx) => {
    const lockedItem = await lockInventoryItemRow(tx, data.inventoryItemId);

    if (!lockedItem) {
      throw createHttpError(404, 'Artigo não encontrado');
    }

    const item = await loadRentableItem(tx, data.inventoryItemId);

    const paymentMethod = await ensureActivePaymentMethod(tx, data.paymentMethodId);
    await ensureItemCanBeRented(tx, lockedItem);

    const created = await tx.inventoryTransaction.create({
      data: {
        InventoryItemID: data.inventoryItemId,
        RenterID: renterId,
        StartDate: data.startDate,
        EndDate: data.endDate || null,
        PaymentMethodID: data.paymentMethodId,
        IsCompleted: false,
        ConditionChecked: false,
        ReturnVerified: false,
      },
    });

    const symbolicFee = toMoney(item.SymbolicFee) || 0;
    const reference = buildRentalReference(created.TransactionID, created.StartDate);
    const rentalStatus = 'pending_validation';

    return {
      rental: {
        rentalId: created.TransactionID,
        itemId: item.InventoryItemID,
        itemName: item.ItemName,
        renterId: created.RenterID,
        startDate: created.StartDate,
        endDate: created.EndDate,
        symbolicFee,
        status: rentalStatus,
        paymentMethod: {
          paymentMethodId: paymentMethod.PaymentMethodID,
          methodName: paymentMethod.MethodName,
        },
        isCompleted: created.IsCompleted,
        conditionChecked: created.ConditionChecked,
        returnVerified: created.ReturnVerified,
      },
      checkoutSummary: {
        reference,
        item: {
          itemId: item.InventoryItemID,
          itemName: item.ItemName,
        },
        rentalPeriod: {
          startDate: created.StartDate,
          endDate: created.EndDate,
        },
        symbolicFee,
        estimatedTotal: symbolicFee,
        status: rentalStatus,
        paymentMethodName: paymentMethod.MethodName,
        paymentFlow: 'offline',
      },
    };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

async function startRental(data, renterId) {
  return createRental(data, renterId);
}

async function listRentalsByRenterId(renterId) {
  const rentals = await prisma.inventoryTransaction.findMany({
    where: {
      RenterID: renterId,
    },
    include: {
      InventoryItem: {
        select: {
          InventoryItemID: true,
          ItemName: true,
          PhotoURL: true,
          SymbolicFee: true,
        },
      },
      PaymentMethod: {
        select: {
          PaymentMethodID: true,
          MethodName: true,
        },
      },
    },
    orderBy: {
      TransactionID: 'desc',
    },
  });

  return rentals.map(serializeRental);
}

async function ensureActiveCategory(db, categoryId) {
  const category = await db.itemCategory.findUnique({
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

  return category;
}

async function getAdminInventoryItems(filters = {}) {
  return listItems(filters);
}

async function createSchoolInventoryItem(data) {
  if (data.categoryId !== undefined) {
    await ensureActiveCategory(prisma, data.categoryId);
  }

  const created = await prisma.inventoryItem.create({
    data: {
      ItemName: data.itemName,
      CategoryID: data.categoryId,
      SymbolicFee: data.symbolicFee,
      Description: data.description ?? null,
      PhotoURL: data.photoUrl ?? null,
      TotalQuantity: data.totalQuantity ?? 1,
      IsSchoolOwned: true,
    },
    include: buildInventoryInclude(),
  });

  return serializeItem(created, 0);
}

async function loadSchoolInventoryItemById(db, itemId) {
  const item = await db.inventoryItem.findUnique({
    where: {
      InventoryItemID: itemId,
    },
    include: buildInventoryInclude(),
  });

  if (!item || !isSchoolOwnedItem(item)) {
    return null;
  }

  return item;
}

async function updateSchoolInventoryItem(itemId, data) {
  const existing = await loadSchoolInventoryItemById(prisma, itemId);

  if (!existing) {
    return null;
  }

  if (data.categoryId !== undefined) {
    await ensureActiveCategory(prisma, data.categoryId);
  }

  const updated = await prisma.inventoryItem.update({
    where: {
      InventoryItemID: itemId,
    },
    data: {
      ...(data.itemName !== undefined ? { ItemName: data.itemName } : {}),
      ...(data.categoryId !== undefined ? { CategoryID: data.categoryId } : {}),
      ...(data.symbolicFee !== undefined ? { SymbolicFee: data.symbolicFee } : {}),
      ...(data.description !== undefined ? { Description: data.description || null } : {}),
      ...(data.photoUrl !== undefined ? { PhotoURL: data.photoUrl || null } : {}),
      ...(data.totalQuantity !== undefined ? { TotalQuantity: data.totalQuantity } : {}),
      IsSchoolOwned: true,
    },
    include: buildInventoryInclude(),
  });

  const activeRentalsCount = await prisma.inventoryTransaction.count({
    where: {
      InventoryItemID: itemId,
      IsCompleted: false,
    },
  });

  return serializeItem(updated, activeRentalsCount);
}

async function deleteSchoolInventoryItem(itemId) {
  const existing = await prisma.inventoryItem.findUnique({
    where: {
      InventoryItemID: itemId,
    },
    select: {
      InventoryItemID: true,
      IsSchoolOwned: true,
    },
  });

  if (!existing || !isSchoolOwnedItem(existing)) {
    return false;
  }

  const activeRentalsCount = await prisma.inventoryTransaction.count({
    where: {
      InventoryItemID: itemId,
      IsCompleted: false,
    },
  });

  if (activeRentalsCount > 0) {
    throw createHttpError(409, 'Não é possível remover artigo com alugueres ativos');
  }

  await prisma.inventoryItem.delete({
    where: {
      InventoryItemID: itemId,
    },
  });

  return true;
}

async function updateSchoolInventoryAvailability(itemId, data) {
  return prisma.$transaction(async (tx) => {
    const item = await loadSchoolInventoryItemById(tx, itemId);

    if (!item) {
      return null;
    }

    const activeRentalsCount = await tx.inventoryTransaction.count({
      where: {
        InventoryItemID: itemId,
        IsCompleted: false,
      },
    });

    let nextTotalQuantity = data.totalQuantity !== undefined
      ? data.totalQuantity
      : Number(item.TotalQuantity || 0);

    if (data.isAvailable === false) {
      nextTotalQuantity = 0;
    }

    if (data.isAvailable === true && nextTotalQuantity <= 0) {
      nextTotalQuantity = Math.max(activeRentalsCount, 1);
    }

    if (nextTotalQuantity < activeRentalsCount) {
      throw createHttpError(409, 'Quantidade total não pode ser inferior ao número de alugueres ativos');
    }

    const updated = await tx.inventoryItem.update({
      where: {
        InventoryItemID: itemId,
      },
      data: {
        TotalQuantity: nextTotalQuantity,
        IsSchoolOwned: true,
      },
      include: buildInventoryInclude(),
    });

    return serializeItem(updated, activeRentalsCount);
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

async function verifyRentalReturn(rentalId, data) {
  const existing = await prisma.inventoryTransaction.findUnique({
    where: {
      TransactionID: rentalId,
    },
    include: {
      InventoryItem: {
        select: {
          InventoryItemID: true,
          ItemName: true,
          PhotoURL: true,
          SymbolicFee: true,
          IsSchoolOwned: true,
        },
      },
      PaymentMethod: {
        select: {
          PaymentMethodID: true,
          MethodName: true,
        },
      },
    },
  });

  if (!existing) {
    return null;
  }

  if (!isSchoolOwnedItem(existing.InventoryItem)) {
    throw createHttpError(400, 'A verificação de devolução aplica-se apenas a artigos da escola');
  }

  if (existing.IsCompleted) {
    throw createHttpError(409, 'Este aluguer já foi concluído');
  }

  const returnDate = new Date(data.returnDate);

  if (Number.isNaN(returnDate.getTime()) || returnDate < existing.StartDate) {
    throw createHttpError(400, 'Data de devolução inválida');
  }

  const updated = await prisma.inventoryTransaction.update({
    where: {
      TransactionID: rentalId,
    },
    data: {
      EndDate: returnDate,
      IsCompleted: true,
      ConditionChecked: true,
      ReturnVerified: true,
      ReturnConditionStatus: data.conditionStatus,
      ReturnConditionNotes: data.conditionNotes || null,
      ReturnVerifiedAt: new Date(),
    },
    include: {
      InventoryItem: {
        select: {
          InventoryItemID: true,
          ItemName: true,
          PhotoURL: true,
          SymbolicFee: true,
          IsSchoolOwned: true,
        },
      },
      PaymentMethod: {
        select: {
          PaymentMethodID: true,
          MethodName: true,
        },
      },
    },
  });

  return serializeRental(updated);
}

async function completeRental(rentalId, data) {
  return verifyRentalReturn(rentalId, data);
}

module.exports = {
  listItems,
  getItemById,
  createRental,
  startRental,
  listRentalsByRenterId,
  getAdminInventoryItems,
  createSchoolInventoryItem,
  updateSchoolInventoryItem,
  deleteSchoolInventoryItem,
  updateSchoolInventoryAvailability,
  verifyRentalReturn,
  completeRental,
};

