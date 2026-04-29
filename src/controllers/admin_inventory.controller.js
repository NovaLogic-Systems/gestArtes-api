const inventoryService = require('../services/inventory.service');
const { createInventoryUseCases } = require('../application/use-cases/inventory');

// Factory de use-cases: injeção de dependências de serviço ao arranque
const inventoryUseCases = createInventoryUseCases({ inventoryService });
const { createHttpError } = require('../utils/http-error');

async function getItems(req, res, next) {
  try {
    const items = await inventoryService.getAdminInventoryItems(req.query);
    res.json({ items });
  } catch (error) {
    next(error);
  }
}

async function createItem(req, res, next) {
  try {
    const item = await inventoryService.createSchoolInventoryItem(req.body);
    res.status(201).json({ item });
  } catch (error) {
    next(error);
  }
}

async function updateItem(req, res, next) {
  try {
    const item = await inventoryService.updateSchoolInventoryItem(req.params.id, req.body);

    if (!item) {
      throw createHttpError(404, 'Artigo não encontrado');
    }

    res.json({ item });
  } catch (error) {
    next(error);
  }
}

async function removeItem(req, res, next) {
  try {
    const deleted = await inventoryService.deleteSchoolInventoryItem(req.params.id);

    if (!deleted) {
      throw createHttpError(404, 'Artigo não encontrado');
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

async function updateAvailability(req, res, next) {
  try {
    const item = await inventoryService.updateSchoolInventoryAvailability(req.params.id, req.body);

    if (!item) {
      throw createHttpError(404, 'Artigo não encontrado');
    }

    res.json({ item });
  } catch (error) {
    next(error);
  }
}

async function completeRental(req, res, next) {
  try {
    const result = await inventoryUseCases.verifyReturn.execute({
      rentalId: Number(req.params.rentalId),
      payload: req.body,
    });

    if (!result || !result.rental) {
      throw createHttpError(404, 'Aluguer não encontrado');
    }

    res.json({ rental: result.rental });
  } catch (error) {
    next(error);
  }
}

const verifyReturn = completeRental;

module.exports = {
  getItems,
  createItem,
  updateItem,
  removeItem,
  updateAvailability,
  completeRental,
  verifyReturn,
};
