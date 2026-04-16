const { body } = require('express-validator');

const createLostAndFoundItemSchema = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 255 }).withMessage('Título inválido')
    .escape(),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage('Descrição inválida')
    .escape(),
  body('foundDate')
    .isISO8601().withMessage('Data inválida')
    .toDate(),
  body('photoUrl')
    .optional()
    .isURL({ require_protocol: false }).withMessage('URL da foto inválida'),
];

module.exports = { createLostAndFoundItemSchema };