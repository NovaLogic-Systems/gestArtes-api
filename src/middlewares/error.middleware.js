/**
 * @file src/middlewares/error.middleware.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  logger.error('Unhandled request error', {
    message: err.message,
    stack: err.stack,
    method: req.method,
    path: req.originalUrl,
  });

  if (res.headersSent) {
    next(err);
    return;
  }

  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
}

module.exports = errorHandler;

