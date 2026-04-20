const inventoryService = require('../services/inventory.service');

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function ensureStudentRole(req) {
  const role = String(req.session?.role || '').trim().toLowerCase();

  if (role !== 'student') {
    throw createHttpError(403, 'Forbidden');
  }
}

async function getItems(req, res, next) {
  try {
    const items = await inventoryService.listItems({
      categoryId: req.query.categoryId,
      search: req.query.search,
      availableOnly: req.query.availableOnly,
    });

    res.json({ items });
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

    res.json({ item });
  } catch (error) {
    next(error);
  }
}

async function createRental(req, res, next) {
  try {
    ensureStudentRole(req);

    const renterId = Number(req.session?.userId);

    if (!Number.isInteger(renterId) || renterId <= 0) {
      throw createHttpError(401, 'Not authenticated');
    }

    const payload = await inventoryService.createRental(req.body, renterId);
    res.status(201).json(payload);
  } catch (error) {
    next(error);
  }
}

async function getRentals(req, res, next) {
  try {
    ensureStudentRole(req);

    const renterId = Number(req.session?.userId);

    if (!Number.isInteger(renterId) || renterId <= 0) {
      throw createHttpError(401, 'Not authenticated');
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