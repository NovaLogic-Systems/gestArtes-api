const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');
const inventoryService = require('../services/inventory.service');

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

function buildInventoryInclude() {
  return {
    ItemCategory: {
      select: {
        CategoryID: true,
        CategoryName: true,
      },
    },
  };
}

function serializeInventoryItem(record, reservedQuantity = 0) {
  const totalQuantity = Number(record.TotalQuantity || 0);
  const reserved = Math.max(Number(reservedQuantity || 0), 0);
  const available = Math.max(totalQuantity - reserved, 0);

  return {
    itemId: record.InventoryItemID,
    itemName: record.ItemName,
    description: record.Description,
    photoUrl: record.PhotoURL,
    symbolicFee: toMoney(record.SymbolicFee),
    totalQuantity,
    reservedQuantity: reserved,
    availableQuantity: available,
    status: available > 0 ? 'available' : 'reserved',
    category: record.ItemCategory
      ? {
        categoryId: record.ItemCategory.CategoryID,
        categoryName: record.ItemCategory.CategoryName,
      }
      : null,
  };
}

async function lockInventoryItemRow(tx, inventoryItemId) {
  const lockedItems = await tx.$queryRaw`
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

async function getItems(req, res, next) {
  try {
    const where = {};
    const categoryFilter = buildCategoryFilter(req.query.category);

    if (categoryFilter) {
      Object.assign(where, categoryFilter);
    }

    const items = await prisma.inventoryItem.findMany({
      where,
      include: buildInventoryInclude(),
      orderBy: {
        ItemName: 'asc',
      },
    });

    if (items.length === 0) {
      res.json({
        items: [],
      });
      return;
    }

    const itemIds = items.map((item) => item.InventoryItemID);

    const groupedActiveRentals = await prisma.inventoryTransaction.groupBy({
      by: ['InventoryItemID'],
      where: {
        IsCompleted: false,
        InventoryItemID: {
          in: itemIds,
        },
      },
      _count: {
        _all: true,
      },
    });

    const reservedByItemId = new Map(
      groupedActiveRentals.map((entry) => [entry.InventoryItemID, Number(entry._count?._all || 0)])
    );

    const serializedItems = items.map((item) => {
      const reservedQuantity = reservedByItemId.get(item.InventoryItemID) || 0;
      return serializeInventoryItem(item, reservedQuantity);
    });

    const shouldOnlyReturnAvailable =
      req.query.onlyAvailable === true
      || normalizeString(req.query.onlyAvailable) === 'true';

    res.json({
      items: shouldOnlyReturnAvailable
        ? serializedItems.filter((item) => item.availableQuantity > 0)
        : serializedItems,
    });
  } catch (error) {
    next(error);
  }
}

async function getItemById(req, res, next) {
  try {
    const item = await prisma.inventoryItem.findUnique({
      where: {
        InventoryItemID: req.params.id,
      },
      include: buildInventoryInclude(),
    });

    if (!item) {
      throw createHttpError(404, 'Artigo não encontrado');
    }

    const reservedQuantity = await prisma.inventoryTransaction.count({
      where: {
        InventoryItemID: item.InventoryItemID,
        IsCompleted: false,
      },
    });

    res.json({
      item: serializeInventoryItem(item, reservedQuantity),
    });
  } catch (error) {
    next(error);
  }
}

async function createRental(req, res, next) {
  try {
    const renterId = Number(req.session?.userId);

    if (!Number.isInteger(renterId) || renterId <= 0) {
      throw createHttpError(401, 'Unauthorized');
    }

    const role = normalizeString(req.session?.role);
    if (role !== 'student' && role !== 'teacher') {
      throw createHttpError(403, 'Forbidden');
    }

    const transactionResult = await prisma.$transaction(async (tx) => {
      const item = await lockInventoryItemRow(tx, req.body.inventoryItemId);

      if (!item) {
        throw createHttpError(404, 'Artigo não encontrado');
      }

      const paymentMethod = await tx.paymentMethod.findUnique({
        where: {
          PaymentMethodID: req.body.paymentMethodId,
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

      const activeReservations = await tx.inventoryTransaction.count({
        where: {
          InventoryItemID: item.InventoryItemID,
          IsCompleted: false,
        },
      });

      if (activeReservations >= item.TotalQuantity) {
        throw createHttpError(409, 'Artigo sem stock disponível para aluguer');
      }

      const rental = await tx.inventoryTransaction.create({
        data: {
          InventoryItemID: item.InventoryItemID,
          RenterID: renterId,
          StartDate: req.body.startDate,
          EndDate: req.body.endDate ?? null,
          PaymentMethodID: paymentMethod.PaymentMethodID,
          IsCompleted: false,
          ConditionChecked: false,
          ReturnVerified: false,
        },
      });

      return {
        rental,
        item,
        paymentMethod,
      };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });

    res.status(201).json({
      rental: {
        rentalId: transactionResult.rental.TransactionID,
        itemId: transactionResult.rental.InventoryItemID,
        itemName: transactionResult.item.ItemName,
        renterId: transactionResult.rental.RenterID,
        startDate: transactionResult.rental.StartDate,
        endDate: transactionResult.rental.EndDate,
        symbolicFee: toMoney(transactionResult.item.SymbolicFee),
        status: 'pending_validation',
        paymentMethod: {
          paymentMethodId: transactionResult.paymentMethod.PaymentMethodID,
          methodName: transactionResult.paymentMethod.MethodName,
        },
        isCompleted: transactionResult.rental.IsCompleted,
        conditionChecked: transactionResult.rental.ConditionChecked,
        returnVerified: transactionResult.rental.ReturnVerified,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getRentals(req, res, next) {
  try {
    const renterId = Number(req.session?.userId);

    if (!Number.isInteger(renterId) || renterId <= 0) {
      throw createHttpError(401, 'Unauthorized');
    }

    const role = normalizeString(req.session?.role);
    if (role !== 'student' && role !== 'teacher') {
      throw createHttpError(403, 'Forbidden');
    }

    const rentals = await inventoryService.listRentalsByRenterId(renterId);

    res.json({ rentals });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getItems,
  getItemById,
  createRental,
  getRentals,
};
