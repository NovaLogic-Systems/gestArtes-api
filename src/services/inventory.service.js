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

function buildSearchFilter(rawSearch) {
  if (!rawSearch) {
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

function serializeItem(item, activeRentalsCount) {
  const availableQuantity = Math.max(0, item.TotalQuantity - activeRentalsCount);

  return {
    itemId: item.InventoryItemID,
    itemName: item.ItemName,
    description: item.Description,
    photoUrl: item.PhotoURL,
    symbolicFee: toMoney(item.SymbolicFee),
    totalQuantity: item.TotalQuantity,
    availableQuantity,
    isAvailable: availableQuantity > 0,
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

  return {
    rentalId: record.TransactionID,
    reference: `INV-R-${record.StartDate.getUTCFullYear()}-${String(record.TransactionID).padStart(4, '0')}`,
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

async function listItems(filters = {}) {
  const where = {
    ItemCategory: {
      IsActive: true,
    },
  };

  if (filters.categoryId) {
    where.CategoryID = filters.categoryId;
  }

  const searchFilter = buildSearchFilter(filters.search);

  if (searchFilter) {
    Object.assign(where, searchFilter);
  }

  const items = await prisma.inventoryItem.findMany({
    where,
    include: {
      ItemCategory: {
        select: {
          CategoryID: true,
          CategoryName: true,
          IsActive: true,
        },
      },
    },
    orderBy: {
      InventoryItemID: 'desc',
    },
  });

  if (items.length === 0) {
    return [];
  }

  const itemIds = items.map((item) => item.InventoryItemID);
  const activeRentals = await prisma.inventoryTransaction.groupBy({
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

  const activeRentalsByItem = new Map(
    activeRentals.map((row) => [row.InventoryItemID, row._count._all])
  );

  const result = items.map((item) => {
    const activeRentalsCount = activeRentalsByItem.get(item.InventoryItemID) || 0;
    return serializeItem(item, activeRentalsCount);
  });

  if (filters.availableOnly) {
    return result.filter((item) => item.isAvailable);
  }

  return result;
}

async function getItemById(itemId) {
  const item = await prisma.inventoryItem.findFirst({
    where: {
      InventoryItemID: itemId,
      ItemCategory: {
        IsActive: true,
      },
    },
    include: {
      ItemCategory: {
        select: {
          CategoryID: true,
          CategoryName: true,
          IsActive: true,
        },
      },
    },
  });

  if (!item) {
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

async function ensurePaymentMethodExists(db, paymentMethodId) {
  const paymentMethod = await db.paymentMethod.findUnique({
    where: {
      PaymentMethodID: paymentMethodId,
    },
    select: {
      PaymentMethodID: true,
    },
  });

  if (!paymentMethod) {
    throw createHttpError(400, 'Método de pagamento inválido');
  }
}

async function ensureItemCanBeRented(db, itemId) {
  const item = await db.inventoryItem.findFirst({
    where: {
      InventoryItemID: itemId,
      ItemCategory: {
        IsActive: true,
      },
    },
    include: {
      ItemCategory: {
        select: {
          CategoryID: true,
          CategoryName: true,
        },
      },
    },
  });

  if (!item) {
    throw createHttpError(404, 'Artigo não encontrado');
  }

  const activeRentalsCount = await db.inventoryTransaction.count({
    where: {
      InventoryItemID: itemId,
      IsCompleted: false,
    },
  });

  if (activeRentalsCount >= item.TotalQuantity) {
    throw createHttpError(400, 'Artigo indisponível para aluguer');
  }

  return item;
}

async function createRental(data, renterId) {
  return prisma.$transaction(async (tx) => {
    const item = await ensureItemCanBeRented(tx, data.inventoryItemId);
    await ensurePaymentMethodExists(tx, data.paymentMethodId);

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
    });

    const symbolicFee = toMoney(item.SymbolicFee) || 0;

    return {
      rental: serializeRental(created),
      checkoutSummary: {
        reference: `INV-R-${created.StartDate.getUTCFullYear()}-${String(created.TransactionID).padStart(4, '0')}`,
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
        status: 'pending',
        paymentMethodName: created.PaymentMethod.MethodName,
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