const { body } = require('express-validator');

const createStudioSchema = [
  body('studioName')
    .isLength({ min: 1, max: 50 }).withMessage('Nome do estúdio inválido')
    .trim()
    .escape(),
  body('capacity')
    .isInt({ min: 1, max: 50 }).withMessage('Capacidade inválida')
    .toInt(),
];

module.exports = { createStudioSchema };