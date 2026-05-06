/**
 * @file src/middlewares/validate.middleware.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const { validationResult } = require('express-validator');

function validateRequest(req, res, next) {
  const errors = validationResult(req);

  if (errors.isEmpty()) {
    next();
    return;
  }

  res.status(400).json({
    error: 'Validation failed',
    details: errors.array({ onlyFirstError: true }).map((e) => ({
      ...e,
      path: Array.isArray(e.path) ? e.path : [e.path],
    })),
  });
}

module.exports = validateRequest;

