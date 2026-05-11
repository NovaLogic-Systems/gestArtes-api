/**
 * @file src/controllers/admin_inventory.controller.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const inventoryService = require('../services/inventory.service');
const { createInventoryUseCases } = require('../application/use-cases/inventory');
const { sendNotification } = require('./notification.controller');

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

async function getRentals(req, res, next) {
  try {
    const rentals = await inventoryService.listAllRentals();
    res.json({ rentals });
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

async function rejectReturn(req, res, next) {
  try {
    const result = await inventoryUseCases.rejectReturn.execute({
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

async function approveRental(req, res, next) {
  try {
    const result = await inventoryUseCases.approveRental.execute({
      rentalId: Number(req.params.rentalId),
      payload: req.body,
    });

    if (!result || !result.rental) {
      throw createHttpError(404, 'Pedido de aluguer não encontrado');
    }

    // Notify renter about decision (approved/rejected)
    try {
      const renterId = result.rental?.borrower?.userId;
      if (Number.isInteger(Number(renterId)) && renterId > 0) {
        const decision = String(req.body?.decision || '').toLowerCase();
        const title = decision === 'approve' ? 'Pedido de aluguer aprovado' : 'Pedido de aluguer rejeitado';
        const message = decision === 'approve'
          ? `O seu pedido ${result.rental.reference} foi aprovado pelo administrador.`
          : `O seu pedido ${result.rental.reference} foi rejeitado pelo administrador.`;

        await sendNotification(req, {
          userId: renterId,
          type: 'inventory',
          title,
          message,
        });
      }
    } catch (notifyErr) {
      // do not block main flow if notification fails
      // log and continue
      console.error('Failed to send inventory approval notification', notifyErr);
    }

    res.json({ rental: result.rental });
  } catch (error) {
    next(error);
  }
}

const verifyReturn = completeRental;

module.exports = {
  getItems,
  getRentals,
  createItem,
  updateItem,
  removeItem,
  updateAvailability,
  completeRental,
  verifyReturn,
  rejectReturn,
  approveRental,
};

