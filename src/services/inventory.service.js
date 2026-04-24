const { Prisma } = require('@prisma/client');

const prisma = require('../config/prisma');

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

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

function shouldOnlyReturnAvailable(filters = {}) {
  return (
    filters.availableOnly === true
    || normalizeString(filters.availableOnly) === 'true'
    || filters.onlyAvailable === true
    || normalizeString(filters.onlyAvailable) === 'true'
  );
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

  const result = items.map((item) => {
    const activeRentalsCount = activeRentalsByItem.get(item.InventoryItemID) || 0;
    return serializeItem(item, activeRentalsCount);
  });

  if (shouldOnlyReturnAvailable(filters)) {
    return result.filter((item) => item.isAvailable);
  }

  return result;
}

async function getItemById(itemId) {
  const item = await prisma.inventoryItem.findUnique({
    where: {
      InventoryItemID: itemId,
    },
    include: buildInventoryInclude(),
  });

  if (!item || item.ItemCategory?.IsActive === false) {
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

module.exports = {
  listItems,
  getItemById,
  createRental,
  listRentalsByRenterId,
};
