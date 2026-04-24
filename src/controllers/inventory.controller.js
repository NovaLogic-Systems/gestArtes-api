const inventoryService = require('../services/inventory.service');

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeString(value) {
  return String(value || '').trim().toLowerCase();
}

function getAuthenticatedInventoryUserId(req) {
  const userId = Number(req.session?.userId);
  const role = normalizeString(req.session?.role);

  if (!Number.isInteger(userId) || userId <= 0) {
    throw createHttpError(401, 'Unauthorized');
  }

  if (role !== 'student' && role !== 'teacher') {
    throw createHttpError(403, 'Forbidden');
  }

  return userId;
}

async function getItems(req, res, next) {
  try {
    res.json({
      items: await inventoryService.listItems(req.query),
    });
  } catch (error) {
    next(error);
  }
}

async function getItemById(req, res, next) {
  try {
    const item = await inventoryService.getItemById(req.params.id);

    if (!item) {
      throw createHttpError(404, 'Artigo não encontrado');
    }

    res.json({
      item,
    });
  } catch (error) {
    next(error);
  }
}

async function createRental(req, res, next) {
  try {
    const renterId = getAuthenticatedInventoryUserId(req);
    const rental = await inventoryService.createRental(req.body, renterId);
    res.status(201).json(rental);
  } catch (error) {
    next(error);
  }
}

async function getRentals(req, res, next) {
  try {
    const renterId = getAuthenticatedInventoryUserId(req);
    res.json({
      rentals: await inventoryService.listRentalsByRenterId(renterId),
    });
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
